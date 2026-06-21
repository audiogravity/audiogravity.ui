/**
 * Unit tests for getUserFriendlyError — pure error message mapping.
 */
import { describe, it, expect } from 'vitest';
import { getUserFriendlyError } from './ui-helpers.js';

describe('getUserFriendlyError', () => {
    it('maps "Failed to fetch" to connection error', () => {
        expect(getUserFriendlyError(new Error('Failed to fetch')))
            .toBe('Unable to connect to server. Please check your connection.');
    });

    it('maps "NetworkError" to network error', () => {
        expect(getUserFriendlyError(new Error('NetworkError when attempting...')))
            .toBe('Network error. Please check your internet connection.');
    });

    it('maps HTTP 401', () => {
        expect(getUserFriendlyError(new Error('HTTP 401')))
            .toBe('Invalid API key. Please check your configuration.');
    });

    it('maps HTTP 403', () => {
        expect(getUserFriendlyError(new Error('HTTP 403')))
            .toBe('Access denied. Insufficient permissions.');
    });

    it('maps HTTP 404', () => {
        expect(getUserFriendlyError(new Error('HTTP 404')))
            .toBe('Resource not found.');
    });

    it('maps HTTP 500', () => {
        expect(getUserFriendlyError(new Error('HTTP 500')))
            .toBe('Server error. Please try again later.');
    });

    it('maps HTTP 503', () => {
        expect(getUserFriendlyError(new Error('HTTP 503')))
            .toBe('Service temporarily unavailable. Please try again later.');
    });

    it('returns error.detail when available', () => {
        const err = { message: 'unknown', detail: 'Custom detail message' };
        expect(getUserFriendlyError(err)).toBe('Custom detail message');
    });

    it('returns error.message for unknown errors', () => {
        expect(getUserFriendlyError(new Error('Something weird')))
            .toBe('Something weird');
    });

    it('returns default for empty error', () => {
        expect(getUserFriendlyError({}))
            .toBe('An unexpected error occurred. Please try again.');
    });
});
