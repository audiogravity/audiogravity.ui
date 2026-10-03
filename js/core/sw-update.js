/**
 * @module sw-update
 * @description Tell a new version of the service worker to take over once it is
 * installed — the one found while the page is open, and the one the page finds waiting,
 * or still installing, when it registers.
 *
 * sw.js does not take over by itself: it does not call skipWaiting() at install, since a
 * page still running the old code would then ask the new worker for chunks it does not
 * hold. The page tells it to — `SKIP_WAITING`, which sw.js's message listener answers
 * with skipWaiting() — and reloads once it has (controllerchange, common.js).
 *
 * Only a worker the page saw being found used to be told. One installed before the page
 * listened — found by the navigation that opened it, or during a session closed before
 * the message went out — waited until every window of the app was closed, a reload
 * included (measured in Chromium 145, 2026-10-03).
 *
 * And told, a worker does not always take over: with the app opened right after an
 * update, Chromium left it waiting in 13 attempts out of 41, with nothing left for the old
 * worker to do. A second message did not help, nor a request through the old worker; a
 * reload did, every time (8 out of 8). Measured in Chromium 145 without a debugger
 * attached: one changes these timings. So the page reloads itself when the takeover has
 * not come within TAKEOVER_WAIT_MS — once in RELOAD_WINDOW_MS at most (reload-guard.js),
 * so that another window still holding the old worker cannot make it loop. A worker
 * still waiting is told again at the periodic check (common.js): the update the check
 * looks for is that one, so it finds nothing new.
 */

import { reloadAllowed, claimReload } from './reload-guard.js';

/** The message sw.js answers with skipWaiting(). */
export const SKIP_WAITING = Object.freeze({ type: 'SKIP_WAITING' });

/** How long a told worker may take before the page reloads to let it in, in ms. */
export const TAKEOVER_WAIT_MS = 10_000;

/** How long after such a reload no other one is made, in ms. */
export const RELOAD_WINDOW_MS = 5 * 60_000;

/** Where the time of the last such reload is kept, for the page's session. */
const RELOADED_AT = 'sw-update-reload-at';

/**
 * Tell each new worker of `registration` to take over, once it is installed.
 *
 * @param {ServiceWorkerRegistration} registration - The page's registration.
 * @param {{onUpdate?: () => void, reload?: () => void, storage?: Storage,
 *   now?: () => number}} [options] - `onUpdate` runs when a worker is told and a reload
 *   may follow, to say why; the others are seams for the tests.
 * @returns {() => void} Tells the worker still waiting, if any, again — for the periodic
 *   check.
 */
export function applyUpdates(registration, {
    onUpdate = () => {},
    reload = () => window.location.reload(),
    storage = window.sessionStorage,
    now = Date.now,
} = {}) {
    const takeOver = (worker) => {
        // No active worker: the first install, which activates by itself and takes the
        // page over (clients.claim in sw.js) — there is no version to replace. Not the
        // controller: a hard reload leaves the page without one, an older version active.
        if (!registration.active) return;
        worker.postMessage(SKIP_WAITING);
        // Within the window after a reload of ours, no other one can follow: the message
        // is all there is to do, and "Updating…" would announce nothing.
        if (!reloadAllowed(RELOADED_AT, RELOAD_WINDOW_MS, { storage, now: now() })) return;
        onUpdate();
        setTimeout(() => {
            if (registration.waiting !== worker) return;   // taken over: the page is reloading
            if (claimReload(RELOADED_AT, RELOAD_WINDOW_MS, { storage, now: now() })) reload();
        }, TAKEOVER_WAIT_MS);
    };
    const followed = new WeakSet();
    const follow = (worker) => {
        if (!worker || followed.has(worker)) return;
        followed.add(worker);
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') takeOver(worker);
        });
    };

    if (registration.waiting) takeOver(registration.waiting);
    follow(registration.installing);
    registration.addEventListener('updatefound', () => follow(registration.installing));
    return () => {
        if (registration.waiting) takeOver(registration.waiting);
    };
}
