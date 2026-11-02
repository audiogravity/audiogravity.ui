/**
 * @module shared-stream
 * @description One EventSource per server-sent stream, shared by its subscribers.
 *
 * The first subscriber opens the stream, the last one leaving closes it — for a stream
 * that makes the box work while it is open (the level meter turns MPD's copy of its
 * stream on), closing it is what stops that work.
 *
 * After a transport error the browser retries by itself, every few seconds, for as long
 * as the page lives — the service worker no longer answers for a box out of reach with
 * the 503 that closed the stream (sw.js). A first error is left to it: the stream drops
 * at times, and comes back at once. A second one before the stream reopened means the
 * box is out of reach: the stream is closed, and opened again with a delay that doubles,
 * from 2 s up to 30 s. A stream the server closed (401/4xx) too. A subscriber that joins
 * while a reconnect waits opens the stream at once, and the reconnect is cancelled: left
 * armed, it opened a second stream over the first, and every event arrived twice for the
 * life of the page.
 *
 * The last payload of each event named in `replay` is handed at once to a subscriber
 * that joins a stream already open: a server that sends a state when it changes would
 * otherwise leave it with nothing until the next change.
 *
 * Extracted from library-store.js, the player's state stream, when the level meter's
 * stream came (2026-11-01): one policy for both (CLAUDE.md rule 9).
 */

const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * @typedef {object} SharedStream
 * @property {(cb: (name: string, payload: any) => void) => () => void} subscribe
 *     Follow the stream; returns the function that stops following it.
 */

/**
 * Create a stream shared by its subscribers. Nothing is opened until one subscribes.
 *
 * @param {object} options
 * @param {() => (string|null)} options.url - The stream's URL, read at each opening;
 *     null when it must not be opened — no credentials: an EventSource opened anyway
 *     would collect a 401 and reconnect against it for as long as the tab lives.
 * @param {string[]} options.events - The events handed to the subscribers, their data
 *     read as JSON; one that is not JSON is dropped.
 * @param {string[]} [options.replay] - The events whose last payload a subscriber that
 *     joins an open stream gets at once.
 * @param {(name: string, payload: any) => void} [options.onEvent] - Called once for each
 *     event, before the subscribers: what the stream feeds besides them.
 * @param {string} [options.label] - The stream's name in the console.
 * @returns {SharedStream} The stream.
 */
export function createSharedStream({ url, events, replay = [], onEvent, label = 'stream' }) {
    /** @type {Set<(name: string, payload: any) => void>} */
    const subscribers = new Set();
    /** The last payload of each replayed event, while the stream is open. */
    const last = new Map();
    /** @type {EventSource|null} */
    let source = null;
    let reconnectTimer = null;
    let backoff = null;
    /** Transport errors since the stream last opened. */
    let errorsSinceOpen = 0;

    function deliver(name, payload) {
        if (onEvent) {
            try { onEvent(name, payload); } catch (err) {
                console.warn(`[${label}] ${name} handler threw:`, err);
            }
        }
        for (const cb of subscribers) {
            try { cb(name, payload); } catch (err) {
                console.warn(`[${label}] subscriber threw:`, err);
            }
        }
    }

    function open() {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        const href = url();
        if (!href) return;
        const es = new EventSource(href);
        source = es;
        es.addEventListener('open', () => { errorsSinceOpen = 0; });
        for (const name of events) {
            es.addEventListener(name, (e) => {
                let payload;
                try {
                    payload = JSON.parse(e.data);
                } catch (err) {
                    console.warn(`[${label}] dropping malformed ${name} event:`, err);
                    return;
                }
                // The first event that arrives resets the reconnect delay.
                backoff = null;
                if (replay.includes(name)) last.set(name, payload);
                deliver(name, payload);
            });
        }
        es.onerror = () => {
            if (es.readyState !== EventSource.CLOSED) {
                errorsSinceOpen += 1;
                if (errorsSinceOpen < 2) return;
                es.close();
            }
            if (source === es) source = null;
            if (subscribers.size === 0) return;
            backoff = Math.min((backoff ?? RECONNECT_MIN_MS) * 2, RECONNECT_MAX_MS);
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                if (subscribers.size) open();
            }, backoff);
        };
    }

    function close() {
        if (source) { source.close(); source = null; }
        last.clear();
        errorsSinceOpen = 0;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        backoff = null;
    }

    return {
        subscribe(cb) {
            subscribers.add(cb);
            if (!source) open();
            else if (last.size) {
                // After the caller has stored its unsubscribe — unless it is already gone.
                queueMicrotask(() => {
                    if (!subscribers.has(cb)) return;
                    for (const [name, payload] of last) cb(name, payload);
                });
            }
            return () => {
                if (!subscribers.delete(cb)) return;
                if (subscribers.size === 0) close();
            };
        },
    };
}
