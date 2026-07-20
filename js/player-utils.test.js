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

// ---------------------------------------------------------------------------
// applySeekGuard — the progress bar must not rewind after a seek
// ---------------------------------------------------------------------------
// Code review 2026-07-20: a state event emitted while the seek was still in
// flight carries the pre-seek position. Applying it rewound the bar for a tick
// before it jumped forward, which reads as "the seek did not work" and prompts
// the user to seek again.

import { applySeekGuard, SEEK_GUARD_MS } from './player-utils.js';

describe('applySeekGuard', () => {
    const NOW = 1_000_000;
    const pending = (over = {}) => ({ target: 180, at: NOW, title: 'A', ...over });

    it('passes the state through when no seek is pending', () => {
        const state = { elapsed: 31, title: 'A' };
        const out = applySeekGuard(state, null, NOW);
        expect(out.state).toBe(state);
        expect(out.pending).toBeNull();
    });

    it('holds the target while a stale position arrives', () => {
        const out = applySeekGuard({ elapsed: 31, title: 'A' }, pending(), NOW);
        expect(out.state.elapsed).toBe(180);
        expect(out.pending).not.toBeNull();
    });

    it('releases as soon as the backend position reaches the target', () => {
        const out = applySeekGuard({ elapsed: 182, title: 'A' }, pending(), NOW);
        expect(out.state.elapsed).toBe(182);
        expect(out.pending).toBeNull();
    });

    it('expires so a refused seek cannot freeze the bar', () => {
        const out = applySeekGuard(
            { elapsed: 31, title: 'A' }, pending(), NOW + SEEK_GUARD_MS + 1);
        expect(out.state.elapsed).toBe(31);
        expect(out.pending).toBeNull();
    });

    it('releases on a track change instead of holding the old target', () => {
        // A new track resets the position to 0, which would otherwise look like
        // "not arrived yet" and pin the previous track's target on screen.
        const out = applySeekGuard({ elapsed: 0, title: 'B' }, pending(), NOW);
        expect(out.state.elapsed).toBe(0);
        expect(out.pending).toBeNull();
    });

    it('treats a missing elapsed as position zero, not as arrival', () => {
        const out = applySeekGuard({ title: 'A' }, pending(), NOW);
        expect(out.state.elapsed).toBe(180);
    });

    it('does not mutate the incoming state object', () => {
        const state = { elapsed: 31, title: 'A' };
        applySeekGuard(state, pending(), NOW);
        expect(state.elapsed).toBe(31);
    });

    it('tolerates a small drift as arrival rather than fighting the backend', () => {
        const out = applySeekGuard({ elapsed: 178, title: 'A' }, pending(), NOW);
        expect(out.pending).toBeNull();
    });
});
