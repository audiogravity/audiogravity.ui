/**
 * Applies the stored appearance before the first paint.
 *
 * data-theme is in the markup, so a page is never unstyled. The dark-mode class
 * was not: js/common.js and js/login.js add it once their bundle evaluates, so
 * anyone on the dark theme was shown their theme's LIGHT palette until then —
 * a white flash on every cold load, on a device people listen to in the dark.
 * The browser chrome flashed with it, the theme-color meta being a fixed value
 * belonging to no light theme.
 *
 * This is the standard remedy — read the preference and stamp the root element
 * before anything is drawn — with one twist: it cannot be an inline script,
 * because the Content-Security-Policy of both pages allows 'self' and no inline
 * source. A separate same-origin file loaded synchronously in <head> does the
 * same job and stays within the policy. It lives in public/ so it is served at a
 * stable /theme-boot.js rather than fingerprinted into assets/, which is what
 * lets the pages reference it by a fixed path.
 *
 * Only <html> is stamped: <body> does not exist yet at this point. Custom
 * properties inherit, so the body and everything under it resolve their colours
 * from the root; common.js mirrors the attribute and the class onto <body> when
 * it runs, which is what the theme rules scoped to `body.dark-mode` need.
 *
 * The theme list and the chrome colours are duplicated from js/core/config.js
 * and js/common.js. They have to be: this file runs before any module and can
 * import nothing. js/theme-boot.test.js fails the build if the copies drift.
 */
(function () {
    'use strict';

    var THEMES = ['minimal', 'slate', 'gravity'];
    var DEFAULT_THEME = 'minimal';

    /** Browser chrome colour per theme, mirroring updateThemeColorMeta(). */
    var CHROME = {
        minimal: { light: '#FFFFFF', dark: '#000000' },
        slate: { light: '#FFFFFF', dark: '#1E293B' },
        gravity: { light: '#FFFFFF', dark: '#12141C' }
    };

    /**
     * Read a preference the way MemoryCache wrote it: a raw string when it is
     * one, JSON otherwise. Storage can be unavailable — Safari in private mode
     * throws on access — in which case the defaults stand.
     * @param {string} key
     * @returns {*} the stored value, or null
     */
    function stored(key) {
        try {
            var raw = localStorage.getItem(key);
            if (raw === null) return null;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return raw;
            }
        } catch (e) {
            return null;
        }
    }

    var theme = String(stored('theme') || DEFAULT_THEME).toLowerCase().trim();
    if (THEMES.indexOf(theme) === -1) theme = DEFAULT_THEME;

    var dark = stored('darkMode') === true;

    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark-mode', dark);

    // Removed and recreated rather than updated in place. Safari ignores
    // setAttribute on this tag in standalone mode, which is the one place the
    // browser chrome is actually visible — updateThemeColorMeta() in common.js
    // carries the same note and does the same thing. index.html ships a static
    // tag that would otherwise survive untouched on an iPhone's home screen;
    // login.html has none, and gets one here.
    var existing = document.querySelector('meta[name="theme-color"]');
    if (existing) existing.parentNode.removeChild(existing);
    var meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', CHROME[theme][dark ? 'dark' : 'light']);
    document.head.appendChild(meta);
})();
