/**
 * Unit tests for auth.js — pure auth state checkers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi as v } from 'vitest';
import { isNetworkError } from './net-errors.js';
import { login } from './auth.js';
import {
    AuthState, isAuthenticated, getCurrentUser, isAdmin, isGuest, getAuthToken,
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

    it('refused password: 401 with the core\'s detail', async () => {
        v.stubGlobal('fetch', v.fn().mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'Invalid credentials' }) }));
        const err = await login('admin', 'wrong').catch(e => e);
        v.unstubAllGlobals();
        expect(err.status).toBe(401);
        expect(err.detail).toBe('Invalid credentials');
        expect(isNetworkError(err)).toBe(false);
    });

    it('core stopped behind server.py: 502 with an HTML body, detail null', async () => {
        v.stubGlobal('fetch', v.fn().mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new SyntaxError('<html>'); } }));
        const err = await login('admin', 'x').catch(e => e);
        v.unstubAllGlobals();
        expect(err.status).toBe(502);
        expect(err.detail).toBeNull();
    });

    it('core crashed: Starlette\'s plain-text 500, detail null, not a network error', async () => {
        v.stubGlobal('fetch', v.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError('Internal Server Error'); } }));
        const err = await login('admin', 'x').catch(e => e);
        v.unstubAllGlobals();
        expect(err.status).toBe(500);
        expect(err.detail).toBeNull();
        expect(isNetworkError(err)).toBe(false);
    });

    it('a field the core refused: 422 array joined into one line, kept raw underneath', async () => {
        v.stubGlobal('fetch', v.fn().mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ detail: [{ loc: ['body', 'username'], msg: 'string too short' }] }) }));
        const err = await login('ab', 'x').catch(e => e);
        v.unstubAllGlobals();
        expect(err.status).toBe(422);
        expect(err.detail).toBe('username: string too short');
        expect(err.validationErrors).toHaveLength(1);
        expect(String(err.message)).not.toContain('[object Object]');
    });

    it('nothing answered: tagged, no status', async () => {
        v.stubGlobal('fetch', v.fn().mockRejectedValueOnce(new TypeError('Load failed')));
        const err = await login('admin', 'x').catch(e => e);
        v.unstubAllGlobals();
        expect(isNetworkError(err)).toBe(true);
        expect(err.status).toBeUndefined();
    });
});
