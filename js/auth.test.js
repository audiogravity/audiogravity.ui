/**
 * Unit tests for auth.js — pure auth state checkers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
