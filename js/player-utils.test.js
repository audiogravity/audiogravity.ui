/**
 * Unit tests for player-utils.js — player helper functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { TRANSITION_GUARD_MS, inTransition, isDsd, isSelfManagedDriver } from './player-utils.js';

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

describe('isSelfManagedDriver', () => {
    it('true for the HQPlayer driver (control_id)', () => {
        expect(isSelfManagedDriver({ control_id: 'src_hqplayer', source_id: 'src_hqplayer' })).toBe(true);
    });

    it('true for a renderer cast even when re-badged (display != routing)', () => {
        // Phase 2/3 model: displayed as content (origin qobuz/library), driven
        // by a self-managed device — the routing identity decides.
        expect(isSelfManagedDriver({ control_id: 'upnp_renderer', source_id: 'upnp_renderer', origin: 'qobuz' })).toBe(true);
    });

    it('false for local MPD playback', () => {
        expect(isSelfManagedDriver({ control_id: 'src_mpd', source_id: 'src_mpd' })).toBe(false);
    });

    it('falls back to source_id when control_id is absent (legacy state)', () => {
        expect(isSelfManagedDriver({ source_id: 'src_hqplayer' })).toBe(true);
        expect(isSelfManagedDriver({ source_id: 'src_mpd' })).toBe(false);
    });

    it('false for null/empty', () => {
        expect(isSelfManagedDriver(null)).toBe(false);
        expect(isSelfManagedDriver({})).toBe(false);
    });
});
