/**
 * Unit tests for public/session-boot.js — a launch with no session leaves for the sign-in
 * page before the app's page paints.
 *
 * The app's page used to paint its splash screen, then js/common.js — once the modules had
 * loaded — found no session and left for login.html, whose splash screen started over: on
 * a phone the screen was cut short and its entrance played twice (2026-10-08). This plain
 * script runs in <head>, before the first paint, and has to read the session exactly where
 * js/auth.js does; nothing but these tests ties the two together.
 *
 * Covers:
 * 1. leaving: no session, an expired one, one missing a part, one whose user is unreadable
 * 2. staying: a session in localStorage, or in sessionStorage
 * 3. the same keys, the same readable user and the same trace as js/auth.js
 * 4. where it runs: in <head>, after the theme, before the body — and from the cache
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readStylesheet } from './test-utils.js';

const SOURCE = readStylesheet('public', 'session-boot.js');
const DAY = 24 * 3600 * 1000;

/**
 * Run the script against given storages, with a location that records where it went.
 * @returns {{went: string|null}}
 */
function run() {
    const where = { went: null };
    const location = { pathname: '/', replace: (url) => { where.went = url; } };
    // The script reads globals by name: parameters of the same names stand in for them.
    new Function('localStorage', 'sessionStorage', 'location', SOURCE)(localStorage, sessionStorage, location);
    return where;
}

/** Store a session the way js/auth.js saveAuth() does. */
function store(storage, { token = 't', user = '{"username":"admin"}', expiry = new Date(Date.now() + DAY).toISOString() } = {}) {
    if (token !== null) storage.setItem('jwt_token', token);
    if (user !== null) storage.setItem('jwt_user', user);
    if (expiry !== null) storage.setItem('jwt_expiry', expiry);
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('a launch with no session', () => {
    it('leaves for the sign-in page, replacing this one in the history', () => {
        expect(run().went).toBe('login.html');
    });

    it('saves where to come back, as requireAuth() does', () => {
        run();
        expect(localStorage.getItem('redirect_after_login')).toBe('/');
    });

    it('leaves with an expired session too', () => {
        store(localStorage, { expiry: new Date(Date.now() - DAY).toISOString() });
        expect(run().went).toBe('login.html');
    });

    it('leaves with a user it cannot read, as initAuth() drops it — else the app left once loaded', () => {
        store(localStorage, { user: '{not json' });
        expect(run().went).toBe('login.html');
    });

    it('leaves with a session missing its user or its expiry', () => {
        store(localStorage, { user: null });
        expect(run().went).toBe('login.html');
        localStorage.clear();
        store(localStorage, { expiry: null });
        expect(run().went).toBe('login.html');
    });
});

describe('a launch with a session', () => {
    it('stays, the session kept in localStorage ("remember me")', () => {
        store(localStorage);
        expect(run().went).toBeNull();
    });

    it('stays, the session kept in sessionStorage', () => {
        store(sessionStorage);
        expect(run().went).toBeNull();
    });

    it('reads sessionStorage only when localStorage holds no token, as initAuth() does', () => {
        store(localStorage, { expiry: new Date(Date.now() - DAY).toISOString() });
        store(sessionStorage);
        // initAuth() takes localStorage's expired session and ignores sessionStorage's.
        expect(run().went).toBe('login.html');
    });
});

describe('the same session as js/auth.js', () => {
    const AUTH = readStylesheet('js', 'auth.js');

    it('the same three keys', () => {
        const auth = AUTH.match(/const AUTH_STORAGE_KEYS = \{([^}]*)\}/)[1];
        const boot = SOURCE.match(/var KEYS = \{([^}]*)\}/)[1];
        const keys = (text) => Object.fromEntries([...text.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
        expect(keys(boot)).toEqual(keys(auth));
    });

    // Read by nothing yet: js/login.js looks in sessionStorage (BACKLOG.md, redirect_after_login).
    it('the same trace as requireAuth(), where to come back', () => {
        expect(AUTH).toMatch(/localStorage\.setItem\('redirect_after_login', window\.location\.pathname\)/);
        expect(SOURCE).toMatch(/localStorage\.setItem\('redirect_after_login', location\.pathname\)/);
    });
});

describe('where it runs', () => {
    const INDEX = readStylesheet('index.html');

    it('in the app page\'s <head>, after the theme, before the body', () => {
        const at = INDEX.indexOf('<script src="/session-boot.js"></script>');
        expect(at).toBeGreaterThan(INDEX.indexOf('<script src="/theme-boot.js"></script>'));
        expect(at).toBeLessThan(INDEX.indexOf('<body'));
    });

    it('a plain script — a module would run after the first paint', () => {
        expect(SOURCE).not.toMatch(/^\s*(import|export)\b/m);
    });

    it('not on the sign-in page, which it leads to', () => {
        expect(readStylesheet('login.html')).not.toMatch(/<script[^>]*session-boot\.js/);
    });
});
