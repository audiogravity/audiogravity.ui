/**
 * @module reload-guard
 * @description Let the page reload itself, on its own initiative, at most once in a given
 * time — so that nothing can make it loop. The time of the last such reload is kept in
 * session storage, under a key of its own for each reason.
 *
 * Shared by the reloads the page decides alone: onto a newer version of the interface
 * (stale-chunk-reload.js), and to let a new service worker in (sw-update.js).
 */

/**
 * Whether a reload kept under `key` may happen now.
 *
 * @param {string} key - The session storage key the reason keeps its time under.
 * @param {number} windowMs - How long after such a reload no other one is made, in ms.
 * @param {{storage?: Storage, now?: number}} [env] - Seams for the tests.
 * @returns {boolean} False within the window, and without session storage: nothing would
 *   then stop a loop.
 */
export function reloadAllowed(key, windowMs, { storage = window.sessionStorage, now = Date.now() } = {}) {
    try {
        const since = now - (Number(storage.getItem(key)) || 0);
        // A time to come counts as long past: a clock set back since — a tablet
        // resynchronised after its sleep — would otherwise hold the window shut as long.
        return !(since >= 0 && since < windowMs);
    } catch {
        return false;
    }
}

/**
 * Take the right to reload now: allowed, and recorded for the next time.
 *
 * @param {string} key - The session storage key the reason keeps its time under.
 * @param {number} windowMs - How long after such a reload no other one is made, in ms.
 * @param {{storage?: Storage, now?: number}} [env] - Seams for the tests.
 * @returns {boolean} Whether the page may reload — a reload that cannot be recorded may not.
 */
export function claimReload(key, windowMs, { storage = window.sessionStorage, now = Date.now() } = {}) {
    if (!reloadAllowed(key, windowMs, { storage, now })) return false;
    try {
        storage.setItem(key, String(now));
        return true;
    } catch {
        return false;
    }
}
