/**
 * @module app-badge
 * @description The number on the installed app's icon — the notifications that arrived
 * while the app was out of sight — goes at each start of the app and at each return to
 * the foreground.
 *
 * The count belongs to the service worker, which keeps it between two pushes (sw.js,
 * PUSH NOTIFICATIONS); the page only tells it that the app is in front of someone.
 * Through the controller, not `serviceWorker.ready`: that promise never settles where no
 * worker is registered — the dev server unregisters them (common.js) — and a page coming
 * back to the foreground a hundred times would leave a hundred callbacks waiting on it.
 * A page has no controller only before the first worker takes it over (clients.claim in
 * sw.js), and no number can be on the icon before that worker exists.
 */

/** The message sw.js answers by setting the count back to zero. */
export const CLEAR_BADGE = Object.freeze({ type: 'CLEAR_BADGE' });

/**
 * Tell the service worker that the app is being looked at.
 *
 * Only where the browser offers the Badging API — on iOS, an app added to the Home Screen;
 * on a computer, Chrome and Edge, a plain tab included (sw.js, countUnseen). Elsewhere the
 * worker counts nothing, and is left asleep.
 *
 * @param {Navigator} [nav] - The page's navigator; a seam for the tests.
 */
export function clearAppBadge(nav = navigator) {
    if (!('setAppBadge' in nav)) return;
    nav.serviceWorker?.controller?.postMessage(CLEAR_BADGE);
}

/**
 * Clear the number now, and again each time the app comes back to the foreground —
 * which is how an installed app is reopened more often than not: the page that was
 * left resumes, nothing starts again.
 *
 * @param {{nav?: Navigator, doc?: Document}} [seams] - For the tests.
 */
export function watchAppBadge({ nav = navigator, doc = document } = {}) {
    clearAppBadge(nav);
    doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'visible') clearAppBadge(nav);
    });
}
