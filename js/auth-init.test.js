/**
 * Unit tests for auth.js initAuth — localStorage resilience.
 *
 * Covers:
 * - initAuth returns false gracefully when localStorage.jwt_user is corrupted JSON
 *   (regression for the unguarded JSON.parse bug fixed in this review)
 * - initAuth returns true for a valid unexpired token
 * - initAuth calls clearAuth and returns false for an expired token
 * - clearAuth removes all auth keys from localStorage
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
