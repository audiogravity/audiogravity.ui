/**
 * Unit tests for player-utils.js — player helper functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { TRANSITION_GUARD_MS, inTransition, isDsd } from './player-utils.js';

describe('TRANSITION_GUARD_MS', () => {
    it('is 8 seconds', () => {
        expect(TRANSITION_GUARD_MS).toBe(8000);
    });
});

describe('inTransition', () => {
    it('returns false for null', () => {
        expect(inTransition(null)).toBe(false);
    });
    it('returns true when within guard window', () => {
        expect(inTransition(Date.now() - 1000)).toBe(true);
    });
    it('returns false when outside guard window', () => {
        expect(inTransition(Date.now() - 10000)).toBe(false);
    });
});

describe('isDsd', () => {
    it('detects DSD in string', () => {
        expect(isDsd('DSD | DSD128')).toBe(true);
        expect(isDsd('dsd64')).toBe(true);
    });
    it('returns false for PCM', () => {
        expect(isDsd('PCM | 24bit | 192kHz')).toBe(false);
    });
    it('detects DSD in format object', () => {
        expect(isDsd({ format: 'DSD128' })).toBe(true);
        expect(isDsd({ codec: 'SDM (DSD)' })).toBe(true);
    });
    it('returns false for PCM object', () => {
        expect(isDsd({ format: 'FLAC', codec: 'PCM' })).toBe(false);
    });
    it('handles null/undefined', () => {
        expect(isDsd(null)).toBe(false);
        expect(isDsd(undefined)).toBe(false);
        expect(isDsd('')).toBe(false);
    });
});
