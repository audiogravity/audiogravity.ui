/**
 * Unit tests for auth.js — pure auth state checkers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isNetworkError } from './net-errors.js';
import { login } from './auth.js';
import {
    AuthState, isAuthenticated, getCurrentUser, isAdmin, isGuest, getAuthToken,
    afterLoginDestination, takeRedirectAfterLogin, initAuth, logout, redirectIfAuthenticated,
    tabAllowed, applyRoleClass,
} from './auth.js';

describe('Auth state checkers', () => {
    beforeEach(() => {
        // Reset AuthState to unauthenticated
        AuthState.token = null;
        AuthState.user = null;
        AuthState.isAuthenticated = false;
        AuthState.tokenExpiry = null;
    });

    describe('isAuthenticated', () => {
        it('returns false when not authenticated', () => {
            expect(isAuthenticated()).toBe(false);
        });

        it('returns true when authenticated with valid token', () => {
            AuthState.isAuthenticated = true;
            AuthState.token = 'valid-jwt';
            AuthState.tokenExpiry = new Date(Date.now() + 3600000); // 1h from now
            expect(isAuthenticated()).toBe(true);
        });

        it('returns false when token is expired', () => {
            AuthState.isAuthenticated = true;
            AuthState.token = 'expired-jwt';
            AuthState.tokenExpiry = new Date(Date.now() - 1000); // expired
            expect(isAuthenticated()).toBe(false);
        });

        it('returns false when no token', () => {
            AuthState.isAuthenticated = true;
            AuthState.token = null;
            expect(isAuthenticated()).toBe(false);
        });
    });

    describe('getCurrentUser', () => {
        it('returns null when not authenticated', () => {
            expect(getCurrentUser()).toBeNull();
        });

        it('returns user when authenticated', () => {
            AuthState.isAuthenticated = true;
            AuthState.user = { username: 'admin', role: 'admin' };
            expect(getCurrentUser()).toEqual({ username: 'admin', role: 'admin' });
        });
    });

    describe('isAdmin', () => {
        it('returns false when not authenticated', () => {
            expect(isAdmin()).toBe(false);
        });

        it('returns true for admin role', () => {
            AuthState.isAuthenticated = true;
            AuthState.user = { role: 'admin' };
            expect(isAdmin()).toBe(true);
        });

        it('returns false for user role', () => {
            AuthState.isAuthenticated = true;
            AuthState.user = { role: 'user' };
            expect(isAdmin()).toBe(false);
        });
    });

    describe('isGuest', () => {
        it('returns false when not authenticated', () => {
            expect(isGuest()).toBe(false);
        });

        it('returns true for guest role', () => {
            AuthState.isAuthenticated = true;
            AuthState.user = { role: 'guest' };
            expect(isGuest()).toBe(true);
        });

        it('returns false for admin role', () => {
            AuthState.isAuthenticated = true;
            AuthState.user = { role: 'admin' };
            expect(isGuest()).toBe(false);
        });
    });

    describe('getAuthToken', () => {
        it('returns null when not authenticated', () => {
            expect(getAuthToken()).toBeNull();
        });

        it('returns token when authenticated', () => {
            AuthState.isAuthenticated = true;
            AuthState.token = 'my-jwt-token';
            expect(getAuthToken()).toBe('my-jwt-token');
        });
    });
});

describe('login() — the shape of a failure, which every sign-in message depends on', () => {
    // Only the failure paths: success reaches saveAuth, which needs a browser. What matters here
    // is the contract the login screen reads — status, string-or-null detail, transport tag.
    afterEach(() => vi.unstubAllGlobals());

    it('refused password: 401 with the core\'s detail', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'Invalid credentials' }) }));
        const err = await login('admin', 'wrong').catch(e => e);
        expect(err.status).toBe(401);
        expect(err.detail).toBe('Invalid credentials');
        expect(isNetworkError(err)).toBe(false);
    });

    it('core stopped behind server.py: 502 with an HTML body, detail null', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new SyntaxError('<html>'); } }));
        const err = await login('admin', 'x').catch(e => e);
        expect(err.status).toBe(502);
        expect(err.detail).toBeNull();
    });

    it('core crashed: Starlette\'s plain-text 500, detail null, not a network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError('Internal Server Error'); } }));
        const err = await login('admin', 'x').catch(e => e);
        expect(err.status).toBe(500);
        expect(err.detail).toBeNull();
        expect(isNetworkError(err)).toBe(false);
    });

    it('a field the core refused: 422 array joined into one line, kept raw underneath', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ detail: [{ loc: ['body', 'username'], msg: 'string too short' }] }) }));
        const err = await login('ab', 'x').catch(e => e);
        expect(err.status).toBe(422);
        expect(err.detail).toBe('username: string too short');
        expect(err.validationErrors).toHaveLength(1);
        expect(String(err.message)).not.toContain('[object Object]');
    });

    it('nothing answered: tagged, no status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Load failed')));
        const err = await login('admin', 'x').catch(e => e);
        expect(isNetworkError(err)).toBe(true);
        expect(err.status).toBeUndefined();
    });
});

describe('back where the session was lost, once signed in', () => {
    // requireAuth() and public/session-boot.js wrote the page in localStorage; the sign-in
    // page read sessionStorage, where nothing wrote it, and the view (#…) was not kept.
    beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

    it.each([
        ['/#systemd', '/#systemd'],
        ['/', '/'],
        ['/index.html#services', '/#services'],
        ['/index.html', '/'],
        ['/login.html', '/'],
        ['/login.html#x', '/'],
        ['/?a=1#config', '/?a=1#config'],
    ])('goes to %s → %s', (saved, expected) => {
        expect(afterLoginDestination(saved)).toBe(expected);
    });

    it.each([
        ['another host', '//evil.example/x'],
        ['another host, backslashed', '/\\evil.example'],
        ['another host, behind a tab the parser drops', '/\t/evil.example'],
        ['another host, behind a line break the parser drops', '/\n/evil.example'],
        ['a scheme', 'https://evil.example'],
        ['a relative path', 'login.html'],
        ['nothing saved', null],
        ['not a string', 42],
    ])('follows nothing outside this box: %s', (_name, saved) => {
        expect(afterLoginDestination(saved)).toBe('/');
    });

    it('reads it where it is written, and forgets it', () => {
        localStorage.setItem('redirect_after_login', '/#systemd');
        expect(takeRedirectAfterLogin()).toBe('/#systemd');
        expect(localStorage.getItem('redirect_after_login')).toBeNull();
        expect(takeRedirectAfterLogin()).toBe('/');
    });

    it('survives a session that expired — dropped by initAuth() on the sign-in page', () => {
        // The common case: the app kept the session 12 h, the reader came back later.
        localStorage.setItem('jwt_token', 'old');
        localStorage.setItem('jwt_user', JSON.stringify({ username: 'admin', role: 'admin' }));
        localStorage.setItem('jwt_expiry', new Date(Date.now() - 1000).toISOString());
        localStorage.setItem('redirect_after_login', '/#systemd');
        expect(initAuth()).toBe(false);
        expect(localStorage.getItem('jwt_token')).toBeNull();
        expect(takeRedirectAfterLogin()).toBe('/#systemd');
    });

    it('is forgotten by a sign-out, which leaves on purpose', async () => {
        localStorage.setItem('redirect_after_login', '/#systemd');
        await logout();
        expect(localStorage.getItem('redirect_after_login')).toBeNull();
    });

    it('is taken by a sign-in page that finds the reader signed in already', () => {
        // Another tab signed in meanwhile: left behind, the key would serve the next
        // sign-in of whichever tab comes next.
        localStorage.setItem('redirect_after_login', '/#systemd');
        Object.assign(AuthState, { isAuthenticated: true, token: 't', tokenExpiry: new Date(Date.now() + 60_000) });
        try {
            expect(redirectIfAuthenticated()).toBe(true);
        } finally {
            Object.assign(AuthState, { isAuthenticated: false, token: null, tokenExpiry: null });
        }
        expect(localStorage.getItem('redirect_after_login')).toBeNull();
    });
});

describe('the tab an address may open', () => {
    // The app opened whatever /#… named: a guest at /#admin landed on a tab hidden for
    // their role, whose calls are refused — and the page to come back to after signing in
    // now brings an admin turned guest back there.
    const KNOWN = ['profiles', 'services', 'systemd', 'admin'];
    const signedInAs = (role) => Object.assign(AuthState, {
        isAuthenticated: true, token: 't', user: { username: 'u', role }, tokenExpiry: new Date(Date.now() + 60_000),
    });
    afterEach(() => Object.assign(AuthState, { isAuthenticated: false, token: null, user: null, tokenExpiry: null }));

    it.each([
        ['admin', 'admin', true],
        ['admin', 'guest', false],
        ['systemd', 'guest', true],
        ['systemd', 'admin', true],
        ['nowhere', 'admin', false],
    ])('%s for a %s: %s', (tab, role, allowed) => {
        signedInAs(role);
        expect(tabAllowed(tab, KNOWN)).toBe(allowed);
    });

    it('sends a reader who lost the admin role off the Admin tab', async () => {
        // It called agTabs._selectTab, which never existed: it threw, and the reader stayed.
        const selected = [];
        if (!customElements.get('ag-tabs')) {
            customElements.define('ag-tabs', class extends HTMLElement {
                toggleTabVisibility() {}
                selectTab(id) { selected.push(id); }
            });
        }
        document.body.appendChild(document.createElement('ag-tabs'));
        window.AppState = { currentTab: 'admin' };
        try {
            signedInAs('guest');
            applyRoleClass();
            await customElements.whenDefined('ag-tabs');
            await Promise.resolve();
            expect(selected).toEqual(['profiles']);
        } finally {
            delete window.AppState;
            document.querySelector('ag-tabs')?.remove();
        }
    });
});
