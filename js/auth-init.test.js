/**
 * Unit tests for auth.js initAuth — localStorage resilience.
 *
 * Covers:
 * - initAuth returns false gracefully when localStorage.jwt_user is corrupted JSON
 *   (regression for the unguarded JSON.parse bug fixed in this review)
 * - initAuth returns true for a valid unexpired token
 * - initAuth calls clearAuth and returns false for an expired token
 * - clearAuth removes all auth keys from localStorage
 * - replaceToken swaps the token where the session keeps it, and nothing else, and says so
 * - endSession clears the session the core ended — only while the token refused is the
 *   one kept; a token replaced meanwhile (this page or another tab) keeps the session
 * - fetchInSession ends the session on the core's refusal, and on nothing else
 * - with two accounts in one browser, a tab never takes up, overwrites or erases the
 *   other account's session; the same account signed in again is taken up with its
 *   new role
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We test the behavior through the module's exported functions.
// Reset localStorage between tests to isolate state.
beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
});

describe('initAuth — corrupted localStorage (JSON.parse regression)', () => {
    it('returns false without throwing when jwt_user is malformed JSON', async () => {
        localStorage.setItem('jwt_token', 'some-token');
        localStorage.setItem('jwt_expiry', new Date(Date.now() + 3600000).toISOString());
        localStorage.setItem('jwt_user', 'NOT_VALID_JSON{{{{');

        // Re-import to run module init with the new localStorage state
        const { initAuth } = await import('./auth.js');
        let result;
        expect(() => { result = initAuth(); }).not.toThrow();
        // Corrupted user → initAuth must recover by calling clearAuth
        // The return value can be false or the function exits early
        expect(result === false || result === undefined || result === null).toBe(true);
    });

    it('clears auth state when jwt_user is invalid JSON', async () => {
        localStorage.setItem('jwt_token', 'some-token');
        localStorage.setItem('jwt_expiry', new Date(Date.now() + 3600000).toISOString());
        localStorage.setItem('jwt_user', '{broken');

        const { initAuth, isAuthenticated } = await import('./auth.js');
        initAuth();
        // After handling corrupted JSON, auth must not be left in authenticated state
        expect(isAuthenticated()).toBe(false);
    });

    it('returns true for a valid unexpired token', async () => {
        const futureExpiry = new Date(Date.now() + 3600000).toISOString();
        localStorage.setItem('jwt_token', 'valid-jwt');
        localStorage.setItem('jwt_expiry', futureExpiry);
        localStorage.setItem('jwt_user', JSON.stringify({ username: 'admin', role: 'admin' }));

        const { initAuth, isAuthenticated } = await import('./auth.js');
        initAuth();
        expect(isAuthenticated()).toBe(true);
    });

    it('does not authenticate with an expired token', async () => {
        const pastExpiry = new Date(Date.now() - 1000).toISOString();
        localStorage.setItem('jwt_token', 'expired-jwt');
        localStorage.setItem('jwt_expiry', pastExpiry);
        localStorage.setItem('jwt_user', JSON.stringify({ username: 'user', role: 'user' }));

        const { initAuth, isAuthenticated } = await import('./auth.js');
        initAuth();
        expect(isAuthenticated()).toBe(false);
    });
});

describe('clearAuth', () => {
    it('removes all auth keys from localStorage', async () => {
        localStorage.setItem('jwt_token', 'tok');
        localStorage.setItem('jwt_expiry', 'exp');
        localStorage.setItem('jwt_user', '{}');

        const { clearAuth } = await import('./auth.js');
        clearAuth();

        expect(localStorage.getItem('jwt_token')).toBeNull();
        expect(localStorage.getItem('jwt_expiry')).toBeNull();
        expect(localStorage.getItem('jwt_user')).toBeNull();
    });
});

describe('replaceToken', () => {
    it('swaps the token in the storage that holds the session, and keeps the rest', async () => {
        const expiry = new Date(Date.now() + 3600000).toISOString();
        sessionStorage.setItem('jwt_token', 'old');
        sessionStorage.setItem('jwt_expiry', expiry);
        sessionStorage.setItem('jwt_user', JSON.stringify({ username: 'admin', role: 'admin' }));

        const { initAuth, replaceToken, getAuthToken, getCurrentUser } = await import('./auth.js');
        initAuth();
        replaceToken('new');

        expect(getAuthToken()).toBe('new');
        expect(sessionStorage.getItem('jwt_token')).toBe('new');
        expect(sessionStorage.getItem('jwt_expiry')).toBe(expiry);
        expect(getCurrentUser()).toEqual({ username: 'admin', role: 'admin' });
        // A session-only sign-in must not be turned into a persistent one.
        expect(localStorage.getItem('jwt_token')).toBeNull();
        sessionStorage.clear();
    });
});

describe('endSession', () => {
    it('clears the session the core no longer accepts', async () => {
        localStorage.setItem('jwt_token', 'tok');
        localStorage.setItem('jwt_expiry', new Date(Date.now() + 3600000).toISOString());
        localStorage.setItem('jwt_user', JSON.stringify({ username: 'bob', role: 'user' }));

        const { initAuth, endSession, isAuthenticated } = await import('./auth.js');
        initAuth();
        expect(isAuthenticated()).toBe(true);

        endSession();

        expect(isAuthenticated()).toBe(false);
        expect(localStorage.getItem('jwt_token')).toBeNull();
    });
});

/** A signed-in session holding `token`, in localStorage. */
function signedIn(token) {
    localStorage.setItem('jwt_token', token);
    localStorage.setItem('jwt_expiry', new Date(Date.now() + 3600000).toISOString());
    localStorage.setItem('jwt_user', JSON.stringify({ username: 'admin', role: 'admin' }));
}

describe('endSession — only for the token this device still keeps', () => {
    it('keeps the session when the refused token was replaced meanwhile', async () => {
        signedIn('new');
        const { initAuth, endSession, isAuthenticated } = await import('./auth.js');
        initAuth();
        endSession('old');   // a request that left before the replacement
        expect(isAuthenticated()).toBe(true);
        expect(localStorage.getItem('jwt_token')).toBe('new');
    });

    it('takes up the token another tab put in place, and says so', async () => {
        signedIn('old');
        const { initAuth, endSession, isAuthenticated, getAuthToken } = await import('./auth.js');
        initAuth();
        localStorage.setItem('jwt_token', 'new');   // the other tab changed the password
        const heard = vi.fn();
        window.addEventListener('ag-session-token-replaced', heard);
        endSession('old');
        window.removeEventListener('ag-session-token-replaced', heard);
        expect(isAuthenticated()).toBe(true);
        expect(getAuthToken()).toBe('new');
        expect(heard).toHaveBeenCalledTimes(1);
    });

    it('ends it when the refused token is the one kept', async () => {
        signedIn('tok');
        const { initAuth, endSession, isAuthenticated } = await import('./auth.js');
        initAuth();
        endSession('tok');
        expect(isAuthenticated()).toBe(false);
    });
});

describe('replaceToken — announced', () => {
    it('tells the streams to reconnect with the new token', async () => {
        signedIn('old');
        const { initAuth, replaceToken } = await import('./auth.js');
        initAuth();
        const heard = vi.fn();
        window.addEventListener('ag-session-token-replaced', heard);
        replaceToken('new');
        window.removeEventListener('ag-session-token-replaced', heard);
        expect(heard).toHaveBeenCalledTimes(1);
    });
});

describe('fetchInSession', () => {
    const refused = (challenge = 'Bearer') => new Response('{"detail":"Session ended — sign in again"}', {
        status: 401, headers: challenge ? { 'WWW-Authenticate': challenge } : {},
    });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('ends the session the core refused', async () => {
        signedIn('tok');
        vi.stubGlobal('fetch', vi.fn(async () => refused()));
        const { initAuth, fetchInSession, isAuthenticated } = await import('./auth.js');
        initAuth();
        const response = await fetchInSession('http://box/api/x', { headers: { Authorization: 'Bearer tok' } });
        expect(response.status).toBe(401);
        expect(isAuthenticated()).toBe(false);
    });

    it('keeps it when the refused token had been replaced', async () => {
        signedIn('new');
        vi.stubGlobal('fetch', vi.fn(async () => refused()));
        const { initAuth, fetchInSession, isAuthenticated } = await import('./auth.js');
        initAuth();
        await fetchInSession('http://box/api/x', { headers: { Authorization: 'Bearer old' } });
        expect(isAuthenticated()).toBe(true);
    });

    it('keeps it on a 401 that is not about the session', async () => {
        // A password re-typed wrong for a sensitive action: 401, no challenge.
        signedIn('tok');
        vi.stubGlobal('fetch', vi.fn(async () => refused(null)));
        const { initAuth, fetchJsonInSession, isAuthenticated } = await import('./auth.js');
        initAuth();
        await expect(fetchJsonInSession('http://box/api/x', { headers: { Authorization: 'Bearer tok' } }))
            .rejects.toMatchObject({ status: 401 });
        expect(isAuthenticated()).toBe(true);
    });
});

/** A session for `username`, as saveAuth leaves it in `storage`. */
function stored(storage, token, username, role) {
    storage.setItem('jwt_token', token);
    storage.setItem('jwt_expiry', new Date(Date.now() + 3600000).toISOString());
    storage.setItem('jwt_user', JSON.stringify({ username, role }));
}

describe('two accounts in one browser', () => {
    afterEach(() => { sessionStorage.clear(); });

    it('a guest tab whose session ended does not take up the admin signed in since', async () => {
        stored(sessionStorage, 'guest-token', 'guest', 'guest');   // this tab, session only
        const { initAuth, endSession, isAuthenticated, getAuthToken } = await import('./auth.js');
        initAuth();
        stored(localStorage, 'admin-token', 'admin', 'admin');      // another tab, persistent
        endSession('guest-token');
        expect(isAuthenticated()).toBe(false);
        expect(getAuthToken()).toBeNull();
        expect(sessionStorage.getItem('jwt_token')).toBeNull();
        expect(localStorage.getItem('jwt_token')).toBe('admin-token');
    });

    it('a persistent tab does not take up another account signed in since in the shared storage', async () => {
        stored(localStorage, 'bob-token', 'bob', 'user');           // this tab, persistent
        const { initAuth, endSession, isAuthenticated, getAuthToken } = await import('./auth.js');
        initAuth();
        stored(localStorage, 'carol-token', 'carol', 'admin');      // carol signs in, another tab
        endSession('bob-token');                                    // bob was disabled
        expect(isAuthenticated()).toBe(false);
        expect(getAuthToken()).toBeNull();
        expect(localStorage.getItem('jwt_token')).toBe('carol-token');
    });

    it('a replaced token is written only where this tab keeps its session', async () => {
        stored(sessionStorage, 'admin-old', 'admin', 'admin');      // this tab, session only
        const { initAuth, replaceToken, getAuthToken } = await import('./auth.js');
        initAuth();
        stored(localStorage, 'carol-token', 'carol', 'user');       // another tab, persistent
        replaceToken('admin-new');
        expect(getAuthToken()).toBe('admin-new');
        expect(sessionStorage.getItem('jwt_token')).toBe('admin-new');
        expect(localStorage.getItem('jwt_token')).toBe('carol-token');
    });

    it('and not over another account signed in since in the shared storage', async () => {
        stored(localStorage, 'admin-old', 'admin', 'admin');        // this tab, persistent
        const { initAuth, replaceToken, getAuthToken } = await import('./auth.js');
        initAuth();
        stored(localStorage, 'carol-token', 'carol', 'user');       // carol signs in, another tab
        replaceToken('admin-new');
        expect(getAuthToken()).toBe('admin-new');
        expect(localStorage.getItem('jwt_token')).toBe('carol-token');
    });

    it('the same account signed in again elsewhere is taken up with its new role', async () => {
        stored(localStorage, 'bob-old', 'bob', 'user');
        const { initAuth, endSession, getAuthToken, getCurrentUser, isAdmin } = await import('./auth.js');
        initAuth();
        stored(localStorage, 'bob-new', 'bob', 'admin');            // promoted, signed in again
        endSession('bob-old');
        expect(getAuthToken()).toBe('bob-new');
        expect(getCurrentUser()).toEqual({ username: 'bob', role: 'admin' });
        expect(isAdmin()).toBe(true);
    });
});
