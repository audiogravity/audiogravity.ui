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

const TTL_SNAPSHOT   = 30_000;
const TTL_ROON_ZONES = 60_000;

const snapshot = { value: null, fetchedAt: 0, inFlight: null };
const zones    = { value: null, fetchedAt: 0, inFlight: null };

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
        // Unfiltered stream (active source) feeds the shared snapshot cache.
        if (key === null) {
            snapshot.value     = state;
            snapshot.fetchedAt = Date.now();
        }
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
