/**
 * @file Decide, before the first paint, whether this page shows the splash screen.
 *
 * Shown once per opening of the installed app (user's choice, 2026-10-08): at its launch,
 * and not on the pages the app then moves to — the sign-in page after a sign-out, the app
 * after a sign-in — nor on a reload. Never in a browser tab, where the screen used to be
 * painted for ~0.1 s before js/splash-screen.js removed it (measured 2026-10-08).
 *
 * Says so with the `splash-on` class on <html>, which the screen needs to be displayed at
 * all (css/components/splash-screen.css) and which js/splash-screen.js reads: one decision,
 * taken here. Should this file fail to load, no splash screen — never a stuck one.
 *
 * A page that leaves for the other one says so beforehand, through skipNextSplash()
 * (js/splash-screen.js): the key below, stamped with the time, read once and removed here.
 * Stamped so that a mark left behind by a navigation that never happened cannot hide the
 * screen of a later launch. js/splash-boot.test.js holds the two files together.
 *
 * A plain script, not a module, for the reasons theme-boot.js gives: it has to run before
 * the first paint, and the page's CSP forbids inline scripts.
 */
(function () {
    var SKIP_KEY = 'ag-splash-skip';
    var SKIP_WINDOW = 10000;

    /** Whether the page before this one asked for no splash screen, forgetting it at once. */
    function sentOn() {
        try {
            var at = Number(sessionStorage.getItem(SKIP_KEY));
            sessionStorage.removeItem(SKIP_KEY);
            return at > 0 && Date.now() - at < SKIP_WINDOW;
        } catch (e) {
            return false;
        }
    }

    /** navigator.standalone: an iOS home-screen app; display-mode: standalone: the others. */
    function installed() {
        return navigator.standalone === true
            || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
    }

    /** A reload of a page already open — the app's own after an update, or the user's. */
    function reloaded() {
        try {
            var entry = performance.getEntriesByType('navigation')[0];
            return !!entry && entry.type === 'reload';
        } catch (e) {
            return false;
        }
    }

    // Read first, whatever else decides: the mark is for this page only.
    var sent = sentOn();
    if (installed() && !reloaded() && !sent) {
        document.documentElement.classList.add('splash-on');
    }
})();
