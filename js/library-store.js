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
    const es = new EventSource(buildAuthedUrl('/player/state', key ? { source_id: key } : {}));
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
 */
export async function getSnapshot() {
    if (isFresh(snapshot, TTL_SNAPSHOT)) return snapshot.value;
    if (snapshot.inFlight) return snapshot.inFlight;
    return fetchInto(snapshot, '/player/state/snapshot');
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
