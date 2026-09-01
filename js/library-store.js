/**
 * @module LibraryStore
 * @description Module-singleton cache + subscription hub for cross-component
 * player / library data.
 *
 * Two responsibilities:
 *
 * 1. **Dedup + TTL cache** for one-shot fetches:
 *    - `/player/state/snapshot` — pulled at library mount by 3 components,
 *      otherwise hit concurrently. TTL 30s.
 *    - `/library/roon-zones` — pulled by 2 components. TTL 60s.
 *    - `/library/roon-status` — where the Roon setup stands, polled by the
 *      status panel while a connection attempt runs. TTL 10s: the state changes
 *      because of something the owner does inside Roon, which the box only
 *      learns on its next attempt.
 *
 * 2. **PlayerState SSE multiplexer**: the backend exposes `GET /player/state`
 *    as a live SSE stream of `state` events. Components subscribe via
 *    {@link subscribePlayerState} and the store owns the EventSource lifecycle.
 *    The connection opens lazily on first subscriber, closes on last
 *    unsubscribe, and keeps the snapshot cache live in the background when the
 *    unfiltered (active-source) stream is active.
 *
 *    A `{ sourceId }` option lets a subscriber pin to a specific source; each
 *    distinct source key gets its own SSE connection, shared by all
 *    subscribers of the same key.
 */

import { apiGet, buildAuthedUrl } from './api.js';
import { fetchFavoriteIds, addFavorite, removeFavorite } from './library-api.js';
import { activeOutputError, outputErrorLabel } from './player-utils.js';
import { showToast } from './ui-helpers.js';

const TTL_SNAPSHOT   = 30_000;
const TTL_ROON_ZONES = 60_000;
// Where the Roon setup stands. Short-lived on purpose: the state it reports
// changes because of something the owner does inside Roon, which the box learns
// about only on its next attempt — a stale answer would leave the card claiming
// they still have a click to make after they made it.
const TTL_ROON_STATUS = 10_000;
// The fixed lists a streaming source publishes — HIGHRESAUDIO's shop categories,
// labels and genres, Qobuz's shelves and genres: fixed for an account, and the core
// memoises them too, so this only has to survive the page. Long, but not forever — an
// empty answer (HRA refusing a session comes back as one) must not leave the pill bar
// bare for a screen that stays open for days.
const TTL_SOURCE_LISTS = 3_600_000;
// The HIGHRESAUDIO connection — read for one bit, whether the account holds a
// subscription, which decides what the browse may offer. Long for the same reason
// as the categories: the state changes only when someone signs in or out on the
// sources card, and that card SAYS so (rememberHraConnection / forgetHraAccount) —
// explicit invalidation is the mechanism, not the TTL. Short, every quiet minute
// put one serialized round-trip in front of the next grid, and a core busy
// re-establishing its HRA session held every pill's loader hostage.
const TTL_HRA_CONNECTION = 3_600_000;

// Offline snapshot — last known player state persisted to localStorage so the
// player is not empty when the page is loaded without a network connection.
const OFFLINE_SNAPSHOT_KEY  = 'ag_snapshot_player_state';
// Debounce the localStorage write: player state events can fire every second
// (position ticks) — writing on every event would add synchronous I/O to the
// main thread hot path (CLAUDE.md §12). 5 s is short enough to keep the
// snapshot fresh without burdening the CPU.
const OFFLINE_SNAPSHOT_DEBOUNCE_MS = 5_000;
let _offlineSnapshotTimer = null;

const snapshot = { value: null, fetchedAt: 0, inFlight: null };
const zones    = { value: null, fetchedAt: 0, inFlight: null };
const roonState = { value: null, fetchedAt: 0, inFlight: null };
const hraCategories = { value: null, fetchedAt: 0, inFlight: null };
const hraGenres = { value: null, fetchedAt: 0, inFlight: null };
const hraLabels = { value: null, fetchedAt: 0, inFlight: null };
const hraSearchFilters = { value: null, fetchedAt: 0, inFlight: null };
// Qobuz's two fixed lists. Catalogue-wide, not account-wide — the nine shelves and the
// thirteen genres are the same for every subscriber — so, unlike HRA's, they are not
// cleared when an account signs out: there is nothing of the account's in them.
const qobuzShelves = { value: null, fetchedAt: 0, inFlight: null };
const qobuzGenres = { value: null, fetchedAt: 0, inFlight: null };
// Tidal's three browsable lists. Catalogue-wide like Qobuz's, so no account
// invalidation — but their labels DO come in the language of the account's country,
// which is why the core sorts them on what it displays rather than on their key.
const tidalShelves = { value: null, fetchedAt: 0, inFlight: null };
const tidalGenres = { value: null, fetchedAt: 0, inFlight: null };
const tidalMoods = { value: null, fetchedAt: 0, inFlight: null };
const tidalExplore = { value: null, fetchedAt: 0, inFlight: null };
// One entry per grouping — genre and theme are two lists, and sharing a cache between
// them would serve one under the other's heading.
const hraPlaylistGroups = {
    genre: { value: null, fetchedAt: 0, inFlight: null },
    theme: { value: null, fetchedAt: 0, inFlight: null },
};
// `gen` counts account changes: a flight started under an older generation may
// neither stamp this entry nor answer a caller who asked after the change.
const hraConnection = { value: null, fetchedAt: 0, inFlight: null, gen: 0 };

/**
 * Last output failure already announced, so the toast fires on the transition
 * into a failure rather than on every state event (they arrive every second).
 * @type {string|null}
 */
let _announcedOutputError = null;

/**
 * Raise a toast when the active output starts reporting a failure.
 *
 * Without this the reason for the silence is only readable in the fullscreen
 * player, so pressing play on a busy DAC looks like nothing happened at all.
 * Edge-triggered on the message itself: a different failure re-announces, the
 * same one stays quiet, and recovery re-arms it.
 *
 * Exported for unit testing — production callers get it through the unfiltered
 * SSE stream, never directly.
 *
 * @param {object|null} state - PlayerState from the active-source stream.
 */
export function notifyOutputError(state) {
    const err = activeOutputError(state);
    if (err === _announcedOutputError) return;
    _announcedOutputError = err;
    if (err) showToast('error', 'Playback blocked', outputErrorLabel(err));
}

/** sourceId-or-null → Set<callback> */
const _subscribers = new Map();
/** sourceId-or-null → EventSource */
const _connections = new Map();
/** sourceId-or-null → setTimeout handle for pending reconnect */
const _reconnectTimers = new Map();

const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
/** sourceId-or-null → current backoff in ms */
const _backoff = new Map();

function _openSse(key) {
    const url = buildAuthedUrl('/player/state', key ? { source_id: key } : {});
    if (!url) {
        // No credentials: an EventSource opened anyway would collect a 401 and let the
        // browser reconnect against it for as long as the tab lives. The keyless state is
        // signalled once by api.js; here we simply stay silent.
        return;
    }
    const es = new EventSource(url);
    _connections.set(key, es);

    es.addEventListener('state', (e) => {
        let state;
        try {
            state = JSON.parse(e.data);
        } catch (err) {
            console.warn('[library-store] dropping malformed state event:', err);
            return;
        }
        // First successful event resets the reconnect backoff.
        _backoff.delete(key);
        // Unfiltered stream (active source) feeds the shared snapshot cache
        // and the offline localStorage snapshot.
        if (key === null) {
            snapshot.value     = state;
            snapshot.fetchedAt = Date.now();
            // Debounced write — position ticks fire every second; writing on
            // every event would add synchronous localStorage I/O to the hot
            // path (CLAUDE.md §12). We coalesce into one write per 5 s.
            if (_offlineSnapshotTimer) clearTimeout(_offlineSnapshotTimer);
            _offlineSnapshotTimer = setTimeout(() => {
                _offlineSnapshotTimer = null;
                try {
                    localStorage.setItem(OFFLINE_SNAPSHOT_KEY, JSON.stringify(state));
                } catch { /* storage quota — non-blocking */ }
            }, OFFLINE_SNAPSHOT_DEBOUNCE_MS);
        }
        if (key === null) notifyOutputError(state);
        const subs = _subscribers.get(key);
        if (subs) for (const cb of subs) {
            try { cb(state); } catch (err) {
                console.warn('[library-store] subscriber threw:', err);
            }
        }
    });

    es.onerror = () => {
        // EventSource auto-reconnects on transport errors; we only intervene
        // when the connection has actually closed (server returned a non-
        // retryable status, e.g. 401/4xx). In that case we schedule a manual
        // reopen with exponential backoff as long as someone still listens.
        if (es.readyState !== EventSource.CLOSED) return;
        _connections.delete(key);
        if (!_subscribers.has(key) || _subscribers.get(key).size === 0) return;
        const next = Math.min((_backoff.get(key) ?? RECONNECT_MIN_MS) * 2, RECONNECT_MAX_MS);
        _backoff.set(key, next);
        _reconnectTimers.set(key, setTimeout(() => {
            _reconnectTimers.delete(key);
            if (_subscribers.get(key)?.size) _openSse(key);
        }, next));
    };
}

function _closeSse(key) {
    const es = _connections.get(key);
    if (es) { es.close(); _connections.delete(key); }
    const timer = _reconnectTimers.get(key);
    if (timer) { clearTimeout(timer); _reconnectTimers.delete(key); }
    _backoff.delete(key);
}

/**
 * Subscribe to PlayerState `state` events from `GET /player/state`.
 * The first subscriber for a given source key opens the SSE connection;
 * the last unsubscribe closes it.
 *
 * BACKLOG: today only `ag-now-playing-fullscreen` subscribes. When the
 * fullscreen player is closed, the snapshot cache falls back to its 30s TTL.
 * Making `ag-library-page` subscribe too would keep the library live at all
 * times — see `/BACKLOG.md` for the rationale and trade-offs before doing it.
 *
 * @param {(state: object) => void} cb
 * @param {object} [opts]
 * @param {string} [opts.sourceId] - When set, pin to a specific source.
 *                                   Default (omitted/empty/null) streams the
 *                                   active source and feeds the snapshot cache.
 * @returns {() => void} unsubscribe function — call it on disconnect.
 */
export function subscribePlayerState(cb, { sourceId } = {}) {
    const key = sourceId || null;
    if (!_subscribers.has(key)) _subscribers.set(key, new Set());
    _subscribers.get(key).add(cb);
    if (!_connections.has(key)) _openSse(key);
    return () => {
        const set = _subscribers.get(key);
        if (!set) return;
        set.delete(cb);
        if (set.size === 0) {
            _subscribers.delete(key);
            _closeSse(key);
        }
    };
}

function isFresh(entry, ttl) {
    return entry.value !== null && (Date.now() - entry.fetchedAt) < ttl;
}

async function fetchInto(entry, path) {
    entry.inFlight = apiGet(path)
        .then(value => {
            entry.value     = value;
            entry.fetchedAt = Date.now();
            return value;
        })
        .finally(() => { entry.inFlight = null; });
    return entry.inFlight;
}

/**
 * Resolve the current player-state snapshot.
 * Returns the cached value when fresh (kept live by the unfiltered
 * {@link subscribePlayerState} stream when active, or by TTL otherwise);
 * otherwise issues a single fetch deduplicated across concurrent callers.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache. Needed right after something
 *        changed the source list: a fresh-but-stale snapshot would answer with
 *        the state from before the change.
 */
export async function getSnapshot({ force = false } = {}) {
    if (!force && isFresh(snapshot, TTL_SNAPSHOT)) return snapshot.value;
    if (snapshot.inFlight) return snapshot.inFlight;
    return fetchInto(snapshot, '/player/state/snapshot');
}

/**
 * One of a streaming source's fixed lists: fetch it, or serve the cached one.
 *
 * Every caller goes through the same sanitising and the same catch, the one already
 * in flight included. Handing a concurrent caller the raw request instead — which is
 * what a bare `return entry.inFlight` does — gives it `null` on a 204 and an unhandled
 * rejection on a failure, and both land in a component that called this without
 * awaiting it: a pill bar built from `null`, and a render that throws.
 *
 * An empty list is never kept, so the next visit asks again (see getHraCategories).
 *
 * @param {{value: *, fetchedAt: number, inFlight: Promise|null}} entry - Cache slot.
 * @param {string} path - API path to fetch.
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<Array<object>>} the list, or [] on any failure
 */
async function cachedList(entry, path, { force = false } = {}) {
    if (!force && isFresh(entry, TTL_SOURCE_LISTS)) return entry.value;
    const inFlight = entry.inFlight ?? fetchInto(entry, path);
    return inFlight
        .then((value) => {
            const list = Array.isArray(value) ? value : [];
            if (!list.length) entry.value = null;
            return list;
        })
        .catch(() => []);
}

/**
 * Resolve HIGHRESAUDIO's shop categories — one pill each on the browse bar.
 *
 * Each entry is `{title, label}`: the title addresses the category on the core, the
 * label is what to show (four titles come back in German whatever the language asked
 * for, and the core relabels them). Only a non-empty list is cached: an empty one is
 * a failure the core cannot report as an error, and caching it would leave the bar
 * showing Favorites alone with nothing to retry it.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, label: string}>>} empty on any failure
 */
export async function getHraCategories({ force = false } = {}) {
    return cachedList(hraCategories, '/library/highresaudio-categories', { force });
}

/**
 * Resolve HIGHRESAUDIO's genres, each with its sub-genres one level deep.
 *
 * Same shape and same rules as {@link getHraCategories}: fixed for an account, cached
 * for the page, and an empty answer never kept. Each entry carries a `path` — the
 * title alone does not identify a genre, since sub-genre titles repeat and some carry
 * the name of a top-level genre.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, path: string, subgenres: Array<object>}>>} empty on failure
 */
export async function getHraGenres({ force = false } = {}) {
    return cachedList(hraGenres, '/library/highresaudio-genres', { force });
}

/**
 * Resolve the shelves of the Qobuz catalogue — one pill each under the Shelves pill.
 *
 * Same `{title, label}` shape and same rules as {@link getHraCategories}, so one strip
 * renders both. The list is a closed one the core holds rather than one Qobuz serves,
 * which is why it cannot simply be written here too: two copies would drift.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, label: string}>>} empty on any failure
 */
export async function getQobuzShelves({ force = false } = {}) {
    return cachedList(qobuzShelves, '/library/qobuz-shelves', { force });
}

/**
 * Resolve the Qobuz genres, each with its sub-genres one level deep.
 *
 * Same shape and same rules as {@link getHraGenres}. Its `path` is opaque — Qobuz's is
 * a numeric id, HRA's a title path — so round-trip it and display `title`; nothing may
 * parse it, and two genres publish one sub-genre or none at all.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, path: string, subgenres: Array<object>}>>} empty on failure
 */
export async function getQobuzGenres({ force = false } = {}) {
    return cachedList(qobuzGenres, '/library/qobuz-genres', { force });
}

/**
 * Resolve the browsable shelves of the Tidal catalogue.
 *
 * Same `{title, label}` shape and same rules as {@link getQobuzShelves}, so one strip
 * renders both. The core drops the shelves that hold nothing, which it settles by
 * asking rather than by reading Tidal's own `hasAlbums` flag — one shelf sets that flag
 * and answers 404, another clears it and holds 281 playlists.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, label: string}>>} empty on any failure
 */
export async function getTidalShelves({ force = false } = {}) {
    return cachedList(tidalShelves, '/library/tidal-shelves', { force });
}

/**
 * Resolve Tidal's genres.
 *
 * Same shape and rules as {@link getQobuzGenres}, with one difference to know: Tidal
 * publishes no sub-genres, so `subgenres` is always empty. A strip built from this
 * therefore never drills — it marks the chosen genre and keeps the others one tap away,
 * which is what a flat list should do.
 * `path` is opaque here too — Tidal's slug differs from the name it shows (`Hiphop` is
 * displayed *Hip Hop / Rap*).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, path: string, subgenres: Array<object>}>>} empty on failure
 */
export async function getTidalGenres({ force = false } = {}) {
    return cachedList(tidalGenres, '/library/tidal-genres', { force });
}

/**
 * Resolve Tidal's moods — the one shelf HIGHRESAUDIO has and Qobuz could not offer.
 * They hold playlists, never albums; the grid renders both the same way.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, label: string}>>} empty on any failure
 */
export async function getTidalMoods({ force = false } = {}) {
    return cachedList(tidalMoods, '/library/tidal-moods', { force });
}

/**
 * Resolve the entries of Tidal's own Explore tree — its genres, moods and activities,
 * decades, and New / Top / Videos / HiRes / Clean Content, flattened into one strip in
 * Tidal's order. Each `title` is a page path for {@link getTidalPage}.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, label: string}>>} empty on any failure
 */
export async function getTidalExplore({ force = false } = {}) {
    return cachedList(tidalExplore, '/library/tidal-explore', { force });
}

/**
 * Read one page of Tidal's Explore tree.
 *
 * A page holds either `links` to further pages — *Record Labels* is 52 of them — or
 * `sections` of content. Not cached: there are dozens of pages and each is one small
 * request, so a per-page cache would hold a directory nobody asked for; the strip is
 * rebuilt on the tap that opens it.
 *
 * @param {string} path - A page path from {@link getTidalExplore} or another page's links.
 * @returns {Promise<{title: string, links: Array<object>, sections: Array<object>}>}
 *   an empty page on any failure, so a caller that did not await it cannot throw.
 */
export async function getTidalPage(path) {
    try {
        const page = await apiGet(`/library/tidal-page?path=${encodeURIComponent(path)}`);
        return {
            title: page?.title ?? '',
            links: Array.isArray(page?.links) ? page.links : [],
            sections: Array.isArray(page?.sections) ? page.sections : [],
        };
    } catch {
        return { title: '', links: [], sections: [] };
    }
}

/**
 * Resolve the record labels HIGHRESAUDIO publishes — one pill each under the Labels
 * shelf. Same `{title, label}` shape and same rules as {@link getHraCategories}.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, label: string}>>} empty on any failure
 */
export async function getHraLabels({ force = false } = {}) {
    return cachedList(hraLabels, '/library/highresaudio-labels', { force });
}

/**
 * Resolve the genres or the themes HIGHRESAUDIO files its editorial playlists under.
 *
 * A grouping filters that tree rather than partitioning it: measured over the 1764
 * selections, the genres reach 1699 of them and the themes 1021, the rest carrying no
 * such field. Same `{title, label}` shape as the categories.
 *
 * @param {'genre'|'theme'} kind - Which grouping to list.
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<Array<{title: string, label: string}>>} empty on failure or an
 *   unknown kind
 */
export async function getHraPlaylistGroups(kind, { force = false } = {}) {
    const entry = hraPlaylistGroups[kind];
    if (!entry) return [];
    return cachedList(entry, `/library/highresaudio-playlist-groups?type=${kind}`, { force });
}

/**
 * Resolve what a HIGHRESAUDIO search can be narrowed and ordered by: the eleven audio
 * formats, the moods grouped by family, and the nine sort orders.
 *
 * An object rather than a list, so it cannot go through {@link getHraCategories}'
 * helper — but under the same rules: cached for the page, and a half-empty answer
 * never kept, so the next visit asks again rather than leaving the advanced form with
 * two empty menus for as long as it stays open.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<{formats: Array<object>, moods: Array<object>, sorts: Array<object>}>}
 *   all three empty on any failure
 */
export async function getHraSearchFilters({ force = false } = {}) {
    const empty = { formats: [], moods: [], sorts: [] };
    if (!force && isFresh(hraSearchFilters, TTL_SOURCE_LISTS)) return hraSearchFilters.value;
    const inFlight = hraSearchFilters.inFlight
        ?? fetchInto(hraSearchFilters, '/library/highresaudio-search-filters');
    return inFlight
        .then((value) => {
            const filters = { ...empty, ...(value ?? {}) };
            // The formats and the moods come from two calls on HRA's side, and it
            // reports some failures as a 200 with nothing in it. The orders are the
            // core's own list and are always there, so they cannot vouch for the rest.
            //
            // What is CACHED is the filled-in object, not the body that came back: a
            // core older than this branch answers {formats, moods} with no `sorts` at
            // all, and the cache hit would then hand a caller a shape the fetch never
            // returns. The form reads `sorts` straight into a `.filter()`, so the
            // second reader — a source switched away from HRA and back — threw and
            // took the whole form down until a reload.
            if (!filters.formats.length || !filters.moods.length) hraSearchFilters.value = null;
            else hraSearchFilters.value = filters;
            return filters;
        })
        .catch(() => empty);
}

/**
 * Whether an HRA connection may stream the catalogue — the ONE home of the
 * "absent means subscribed" contract, wherever the connection object is read.
 *
 * `has_subscription: false` is the only value that narrows anything: it is what
 * the core answers for an account HRA signed in without a subscription (it can
 * play its purchases and nothing else — catalogue, favourites and playlists all
 * answer NO SUBSCRIPTION to that session). An absent field is a core that
 * predates it, an unknown state, or no answer at all — every account had the
 * full bar before the field existed, and an unanswered question must not hide
 * the shelves.
 *
 * @param {{has_subscription?: boolean|null}|null|undefined} conn - As the
 *        connection endpoint answers it, or null/undefined for "unknown".
 * @returns {boolean} True when the catalogue may be offered.
 */
export function hraHasSubscription(conn) {
    return conn?.has_subscription !== false;
}

/** @returns {object|null} The body if it is a usable connection object, else null. */
function _sanitizeHraConnection(body) {
    return (body && typeof body === 'object') ? body : null;
}

/**
 * Resolve the HIGHRESAUDIO connection state, as `/highresaudio/connection` reports it.
 *
 * The browse and the search read one field of it, through {@link hraHasSubscription}:
 * whether the account may be offered the catalogue, or its purchases alone.
 *
 * `null` on any failure, and never cached — a caller reads `null` as "unknown",
 * which {@link hraHasSubscription} maps to the full bar, so a core that cannot
 * answer costs nothing but a retry. Only sanitized objects are ever stamped into
 * the cache, so a cache hit cannot serve what the fetch path would have refused.
 *
 * The entry carries a generation counter: {@link forgetHraAccount} bumps it, so a
 * request that was in flight when the account changed can neither stamp the cache
 * nor be handed to a caller who asked after the change — it was the previous
 * account's question.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<{connected: boolean, has_subscription?: boolean|null}|null>}
 */
export async function getHraConnection({ force = false } = {}) {
    if (!force && isFresh(hraConnection, TTL_HRA_CONNECTION)) return hraConnection.value;
    if (!hraConnection.inFlight) {
        const gen = hraConnection.gen;
        hraConnection.inFlight = apiGet('/highresaudio/connection')
            .then((body) => {
                const conn = _sanitizeHraConnection(body);
                if (gen === hraConnection.gen && conn) {
                    hraConnection.value = conn;
                    hraConnection.fetchedAt = Date.now();
                }
                // Superseded by an account change: answer with what is known NOW
                // (the seeded new connection, or null), never with the old account's.
                return gen === hraConnection.gen ? conn : hraConnection.value;
            })
            .catch(() => null)
            .finally(() => {
                // A newer generation owns the slot — its own flight may sit there.
                if (gen === hraConnection.gen) hraConnection.inFlight = null;
            });
    }
    return hraConnection.inFlight;
}

/**
 * Seed the connection cache from a sign-in's own answer. The POST returns the very
 * object the GET would — throwing it away bought a round-trip the browse pays,
 * serialized, in front of its first grid. Everything cached for the previous
 * account is dropped first: a sign-in IS an account change.
 *
 * @param {object|null|undefined} conn - The POST /highresaudio/connection response.
 */
export function rememberHraConnection(conn) {
    forgetHraAccount();
    const clean = _sanitizeHraConnection(conn);
    if (clean) {
        hraConnection.value = clean;
        hraConnection.fetchedAt = Date.now();
    }
}

/**
 * Drop everything cached about the HRA *account* — the sources card calls this on
 * sign-out (sign-in goes through {@link rememberHraConnection}, which starts here).
 *
 * All of it, not just the connection: the favourites Set and the categories and
 * genres ("fixed for an account", says their own cache comment) are the previous
 * account's answers too — kept, its stars would show and WRITE against the new
 * account for the length of a TTL. The generation bump orphans any request still
 * in flight, so a slow answer cannot resurrect what was just forgotten.
 */
export function forgetHraAccount() {
    hraConnection.gen += 1;
    hraConnection.value = null;
    hraConnection.fetchedAt = 0;
    hraConnection.inFlight = null;
    hraCategories.value = null;
    hraCategories.fetchedAt = 0;
    hraGenres.value = null;
    hraGenres.fetchedAt = 0;
    // The two shelves added with the menu restructure live under the same
    // "fixed for an account" hour as the categories — left uncleared, a sign-out/
    // sign-in served the previous account's labels and groupings for up to an hour
    // (review finding: they simply missed this function when they were added).
    hraLabels.value = null;
    hraLabels.fetchedAt = 0;
    for (const entry of Object.values(hraPlaylistGroups)) {
        entry.value = null;
        entry.fetchedAt = 0;
    }
    // The search filters are catalogue-wide rather than account-wide, so this is not
    // correcting anything — it is keeping ONE rule ("nothing HRA outlives a sign-out")
    // instead of a list of exceptions, which is what the shelves above got wrong.
    hraSearchFilters.value = null;
    hraSearchFilters.fetchedAt = 0;
    _favorites.delete('src_highresaudio');
    _notifyFavorites('src_highresaudio');
}

/**
 * Resolve the list of Roon zones.
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 */
export async function getRoonZones({ force = false } = {}) {
    if (!force && isFresh(zones, TTL_ROON_ZONES)) return zones.value;
    if (zones.inFlight) return zones.inFlight;
    return fetchInto(zones, '/library/roon-zones');
}

/**
 * Resolve where the Roon setup stands: whether a Roon endpoint runs on the box,
 * whether a Core answers, whether the extension still has to be enabled inside
 * Roon, and how many zones are visible once it is.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Bypass the cache and refetch.
 * @returns {Promise<{state: string, zones: number, extension_name: string}>}
 */
export async function getRoonStatus({ force = false } = {}) {
    if (!force && isFresh(roonState, TTL_ROON_STATUS)) return roonState.value;
    if (roonState.inFlight) return roonState.inFlight;
    return fetchInto(roonState, '/library/roon-status');
}

/** Drop the cached snapshot so the next call re-fetches. */

/**
 * Return the last offline player-state snapshot from localStorage, or null.
 *
 * Called by ag-now-playing on startup when the network is unavailable so
 * the player shows the last known state instead of an empty screen.
 *
 * @returns {object|null}
 */
export function getOfflinePlayerSnapshot() {
    try {
        const raw = localStorage.getItem(OFFLINE_SNAPSHOT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// ── Renderer status subscription ─────────────────────────────────────────────
//
// Single window listener registered once here; components call
// subscribeRendererStatus(cb) instead of managing the window event themselves.
// This eliminates the triple-duplication of add/remove window.addEventListener
// across ag-upnp-renderer-card, ag-now-playing, and ag-now-playing-fullscreen.

const _rendererCallbacks = new Set();

window.addEventListener('renderer-status-update', (e) => {
    const data = e.detail;
    if (!data) return;
    _rendererCallbacks.forEach((cb) => {
        try { cb(data); } catch (_) { /* never propagate into the dispatch loop */ }
    });
});

/**
 * Subscribe to renderer_status SSE events dispatched by sse.js.
 * The callback receives the raw payload object.
 * Returns an unsubscribe function.
 *
 * @param {(data: object) => void} cb - Called on every renderer_status event.
 * @returns {() => void} Unsubscribe function.
 */
export function subscribeRendererStatus(cb) {
    _rendererCallbacks.add(cb);
    return () => _rendererCallbacks.delete(cb);
}

/**
 * Fetch the active renderer status in one call.
 * Resolves GET /upnp-renderer/known to find the active UDN, then fetches its
 * status. Returns the status object, or null when no renderer is active or on
 * any network error.
 *
 * @returns {Promise<object|null>}
 */
export async function fetchActiveRendererStatus() {
    try {
        const known = await apiGet('/upnp-renderer/known');
        const active = known?.find(r => r.active);
        if (!active?.udn) return null;
        return await apiGet(`/upnp-renderer/${active.udn}/status`);
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Streaming favorites (album ★) — per-source id cache for accurate star state
// ---------------------------------------------------------------------------

const TTL_FAVORITES = 60_000;
/** sourceId → { value: Set<string>|null, fetchedAt: number, inFlight: Promise|null } */
const _favorites = new Map();
/** sourceId → Set<callback> notified whenever the favorite set changes (any view) */
const _favSubscribers = new Map();

function _favEntry(sourceId) {
    let e = _favorites.get(sourceId);
    if (!e) { e = { value: null, fetchedAt: 0, inFlight: null }; _favorites.set(sourceId, e); }
    return e;
}

function _notifyFavorites(sourceId) {
    const subs = _favSubscribers.get(sourceId);
    if (subs) for (const cb of subs) {
        try { cb(); } catch (err) { console.warn('[library-store] favorites subscriber threw:', err); }
    }
}

/**
 * Subscribe to favorite-set changes for a source. Fires on every toggle (optimistic
 * update AND revert) so all views (browse, search) stay in sync live.
 * @param {string} sourceId
 * @param {() => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeFavorites(sourceId, cb) {
    if (!_favSubscribers.has(sourceId)) _favSubscribers.set(sourceId, new Set());
    _favSubscribers.get(sourceId).add(cb);
    return () => {
        const s = _favSubscribers.get(sourceId);
        if (s) { s.delete(cb); if (s.size === 0) _favSubscribers.delete(sourceId); }
    };
}

/**
 * Set of the user's favorited album ids on a streaming source (cached, dedup + TTL 60s).
 * Lets browse/search render the accurate ★ state with a single fetch per source.
 * Returns a COPY — the internal cache is never handed out, so a later toggle can't
 * mutate a Set a caller already holds.
 * @param {string} sourceId
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<Set<string>>}
 */
export async function getFavoriteAlbumIds(sourceId, { force = false } = {}) {
    const e = _favEntry(sourceId);
    if (!force && isFresh(e, TTL_FAVORITES)) return new Set(e.value);
    if (e.inFlight) return e.inFlight.then((v) => new Set(v));
    e.inFlight = fetchFavoriteIds(sourceId, 'album')
        .then((ids) => { e.value = new Set(ids); e.fetchedAt = Date.now(); return e.value; })
        .finally(() => { e.inFlight = null; });
    return e.inFlight.then((v) => new Set(v));
}

/**
 * Persist an album's favorite state and keep the cached Set in sync. Updates the
 * cache optimistically (instant ★ — the Set is REPLACED, not mutated) and reverts on
 * failure; notifies subscribers on every change so every view re-renders.
 * @param {string} sourceId
 * @param {string} albumId
 * @param {boolean} favorited - desired state
 * @returns {Promise<boolean>} the persisted state
 * @throws re-throws the API error (after reverting the cache) so the caller can toast
 */
export async function setAlbumFavorited(sourceId, albumId, favorited) {
    const e = _favEntry(sourceId);
    const optimistic = new Set(e.value ?? []);
    if (favorited) optimistic.add(albumId); else optimistic.delete(albumId);
    e.value = optimistic;              // replace — never mutate a handed-out Set
    _notifyFavorites(sourceId);
    try {
        if (favorited) await addFavorite(sourceId, albumId, 'album');
        else await removeFavorite(sourceId, albumId, 'album');
        return favorited;
    } catch (err) {
        const reverted = new Set(e.value);
        if (favorited) reverted.delete(albumId); else reverted.add(albumId);
        e.value = reverted;
        _notifyFavorites(sourceId);
        throw err;
    }
}
