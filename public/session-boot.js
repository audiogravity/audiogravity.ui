/**
 * @file Send a launch with no session straight to the sign-in page, before the app's page
 * paints anything.
 *
 * Without it, the app's page painted its splash screen, then js/common.js — once the
 * modules had loaded — found no session and left for login.html, whose own splash screen
 * started over: on a phone, the screen was cut short and its entrance played twice
 * (measured 2026-10-08: shown 1.5 s, then cut, on the dev instance). Run here, in <head>,
 * before the body is parsed, the app's page never shows a splash it is about to leave.
 *
 * Reads the session where js/auth.js's initAuth() does — localStorage, else
 * sessionStorage, the same three keys, the expiry, a user it can read — and leaves the
 * way requireAuth() does, saving where to come back. js/session-boot.test.js holds the
 * two together.
 *
 * A plain script, not a module: it has to run before the first paint, and the page's CSP
 * forbids inline scripts (the same reasons as theme-boot.js). Served from the cache
 * (sw.js) for the same reason: a round trip in front of it is one in front of every paint.
 */
(function () {
    var KEYS = { TOKEN: 'jwt_token', USER: 'jwt_user', EXPIRY: 'jwt_expiry' };

    /**
     * The session a storage holds, as initAuth() reads it: the token decides which one.
     * @param {Storage} storage
     * @returns {{user: (string|null), expiry: (string|null)}|null} Null without a token.
     */
    function sessionIn(storage) {
        if (!storage.getItem(KEYS.TOKEN)) return null;
        return { user: storage.getItem(KEYS.USER), expiry: storage.getItem(KEYS.EXPIRY) };
    }

    /**
     * Whether the stored user can be read: initAuth() drops a session whose user is not
     * JSON, and the app would then leave for the sign-in page itself, once loaded.
     * @param {string} text
     * @returns {boolean}
     */
    function readable(text) {
        try {
            JSON.parse(text);
            return true;
        } catch (e) {
            return false;
        }
    }

    try {
        var session = sessionIn(localStorage) || sessionIn(sessionStorage);
        var valid = session && session.user && readable(session.user) && session.expiry
            && new Date(session.expiry) > new Date();
        if (!valid) {
            localStorage.setItem('redirect_after_login', location.pathname);
            // replace, not href: Back must not land on a page that leaves at once.
            location.replace('login.html');
        }
    } catch (e) {
        // Storage refused (a private mode): js/common.js decides once loaded, as before.
    }
})();
