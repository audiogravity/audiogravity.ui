/**
 * @module stale-chunk-reload
 * @description Reload the page when a screen's on-demand code is missing because the box
 * now serves another version — and only then.
 *
 * The installer keeps the files of two versions of the interface (audiogravity.ops,
 * build-ui-package.sh — retire_old_files): the new one and the one it replaces. A page
 * still open on the version before that — a tablet left on a box served without a
 * service worker, in plain HTTP, through two updates — asks for files that are gone, and
 * the screen it opens stays empty. With a service worker the page reloads itself after
 * an update (common.js); without one, nothing did.
 *
 * Vite reports the failure as a `vite:preloadError` event: its preload helper wraps every
 * dynamic import. The error is left to go on — the screen's own handling says it — and
 * the box's index.html is asked for again: if its start bundle is not this page's, a
 * newer version is in place, and the page is reloaded onto it. A failure with the same
 * version in place is a network blip, or the box restarting its server during an update:
 * reloading then could land on an error page, and would lose what was typed elsewhere.
 * Once a minute at most, so that nothing can make it loop (reload-guard.js).
 */

import { reloadAllowed, claimReload } from './reload-guard.js';

/** Where the time of the last such reload is kept, for the page's session. */
const RELOADED_AT = 'stale-chunk-reload-at';

/** How long after such a reload no other one is made, in ms. */
export const RELOAD_WINDOW_MS = 60_000;

/**
 * The query that marks the question to the box. The service worker leaves a request
 * carrying it to the network, and stores nothing of it (sw.js, which names it too).
 */
export const VERSION_CHECK_PARAM = 'version-check';

/**
 * The start bundle a page loads: the src of its module script.
 *
 * @param {Document} doc - The page.
 * @returns {?string} The script's src, or null when there is none.
 */
function startBundleOf(doc) {
    return doc.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null;
}

/**
 * The start bundle a page's HTML loads — read as the page itself is, whatever the order
 * of the attributes or the quotes around them.
 *
 * @param {string} html - A page's HTML.
 * @returns {?string} The module script's src, or null when there is none.
 */
export function startBundle(html) {
    return startBundleOf(new DOMParser().parseFromString(html, 'text/html'));
}

/**
 * Reload the page if the box now serves another version; otherwise leave things be.
 *
 * @param {{fetchFn?: Function, page?: Document, location?: Location, storage?: Storage,
 *   now?: number}} [env] - Seams for the tests.
 * @returns {Promise<boolean>} Whether the page is being reloaded.
 */
export async function reloadIfStale({
    fetchFn = window.fetch.bind(window),
    page = document,
    location = window.location,
    storage = window.sessionStorage,
    now = Date.now(),
} = {}) {
    // Asked first, so that the box is not asked in vain.
    if (!reloadAllowed(RELOADED_AT, RELOAD_WINDOW_MS, { storage, now })) return false;
    const ours = startBundleOf(page);
    let theirs = null;
    try {
        // The box's page, never a cached one. A query no cache entry carries keeps a
        // service worker from older versions — network-first, falling back on its cache —
        // from answering with the page it stored, when the box is down.
        const response = await fetchFn(`/index.html?${VERSION_CHECK_PARAM}=${now}`, { cache: 'no-store' });
        if (response.ok) theirs = startBundle(await response.text());
    } catch {
        return false;   // the box is not answering: nothing to reload onto
    }
    if (!ours || !theirs || ours === theirs) return false;
    if (!claimReload(RELOADED_AT, RELOAD_WINDOW_MS, { storage, now })) return false;
    location.reload();
    return true;
}

/**
 * Start watching for missing on-demand code. Called once, at startup (main.js).
 *
 * Several imports can fail at once — the Performance tab loads two components that need
 * the same library — and one question to the box answers them all: no other is asked
 * while it is pending.
 *
 * @param {EventTarget} [win=window] - Where Vite dispatches its event.
 * @param {Function} [check=reloadIfStale] - The question to the box (a seam for the tests).
 */
export function watchStaleChunks(win = window, check = reloadIfStale) {
    let pending = null;
    win.addEventListener('vite:preloadError', () => {
        pending ??= check().finally(() => { pending = null; });
    });
}
