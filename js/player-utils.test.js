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

import { applySeekGuard, SEEK_GUARD_MS, seekRefusalRollback, toggleRefusalRollback } from './player-utils.js';

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


// ---------------------------------------------------------------------------
// The output the audio actually goes to (spec §4/§5)
// ---------------------------------------------------------------------------
// outputs[] is the single source of truth for what the outputs are doing. The
// flat output_label carries a name and nothing else, so a speaker selected but
// stopped was indistinguishable from one playing.

import { activeOutput, outputLabel, isOutputStopped, isOutputUnreachable, activeOutputError } from './player-utils.js';

describe('activeOutput', () => {
    const local = { id: 'local', type: 'local', name: 'Heed Abacus', active: false, transport_state: 'STOPPED' };
    const marantz = { id: 'uuid:m', type: 'upnp_renderer', name: 'Marantz', active: true, transport_state: 'PLAYING' };

    it('picks the entry named by active_output_id', () => {
        const out = activeOutput({ outputs: [local, marantz], active_output_id: 'local' });
        expect(out.id).toBe('local');
    });

    it('falls back to the active flag when no id is given', () => {
        expect(activeOutput({ outputs: [local, marantz] }).id).toBe('uuid:m');
    });

    it('returns null when there are no outputs', () => {
        expect(activeOutput({ outputs: [] })).toBeNull();
        expect(activeOutput(null)).toBeNull();
    });
});

describe('outputLabel', () => {
    it('names the active output', () => {
        const state = { outputs: [{ id: 'uuid:m', name: 'Marantz', active: true }], active_output_id: 'uuid:m' };
        expect(outputLabel(state)).toBe('Marantz');
    });

    it('names a selected output that is stopped, instead of claiming none is selected', () => {
        const state = {
            outputs: [{ id: 'uuid:m', type: 'upnp_renderer', name: 'Marantz', active: true, transport_state: 'STOPPED' }],
            active_output_id: 'uuid:m',
            output_label: null,
        };
        expect(outputLabel(state)).toBe('Marantz');
    });

    it('falls back to the flat label, then to a placeholder', () => {
        expect(outputLabel({ outputs: [], output_label: 'Legacy DAC' })).toBe('Legacy DAC');
        expect(outputLabel({ outputs: [] })).toBe('No output selected');
    });
});

describe('isOutputStopped', () => {
    const out = (transport_state) => ({
        outputs: [{ id: 'uuid:m', name: 'Marantz', active: true, transport_state }],
        active_output_id: 'uuid:m',
    });

    it('is true for a selected output sitting idle', () => {
        expect(isOutputStopped(out('STOPPED'))).toBe(true);
    });

    it('is false while it plays or pauses', () => {
        expect(isOutputStopped(out('PLAYING'))).toBe(false);
        expect(isOutputStopped(out('PAUSED'))).toBe(false);
    });

    it('is false when the state is unknown — never inferred from a missing item', () => {
        expect(isOutputStopped(out(null))).toBe(false);
        expect(isOutputStopped({ outputs: [] })).toBe(false);
    });
});

describe('activeOutputError', () => {
    it('reads the error of the output designated by active_output_id', () => {
        const state = {
            outputs: [
                { id: 'local', name: 'DAC', active: false, error: 'busy' },
                { id: 'uuid:m', name: 'Marantz', active: true, error: null },
            ],
            active_output_id: 'uuid:m',
        };
        // The local DAC's failure must not be attributed to the speaker playing.
        expect(activeOutputError(state)).toBeNull();
    });

    it('returns the message when the active output is the failing one', () => {
        const state = { outputs: [{ id: 'local', name: 'DAC', active: true, error: 'busy' }] };
        expect(activeOutputError(state)).toBe('busy');
    });
});


describe('isOutputUnreachable', () => {
    const out = (reachable) => ({
        outputs: [{ id: 'uuid:m', name: 'Marantz', active: true, reachable, transport_state: null }],
        active_output_id: 'uuid:m',
    });

    it('is true for a selected speaker that cannot be contacted', () => {
        expect(isOutputUnreachable(out(false))).toBe(true);
    });

    it('is false when it answers', () => {
        expect(isOutputUnreachable(out(true))).toBe(false);
    });

    it('is false when the backend does not send the flag', () => {
        // Never inferred from a missing transport state: "cannot reach it" and
        // "reached it, it said nothing" are different answers.
        expect(isOutputUnreachable({ outputs: [{ id: 'local', active: true }] })).toBe(false);
        expect(isOutputUnreachable({ outputs: [] })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// seekRefusalRollback — a refused seek restores the honest position at once
// ---------------------------------------------------------------------------
// The backend answers 503 exactly when MPD declined and the position did not
// move (API.md); leaving the optimistic target on screen for the guard's full
// window reads as a frozen player.

describe('seekRefusalRollback', () => {
    const pending = { target: 120, at: 1000, title: 'Alice' };
    const state = { title: 'Alice', elapsed: 120 };   // already moved optimistically

    it('restores the pre-seek position on a 503 for the same track', () => {
        const rolled = seekRefusalRollback(state, pending, 33, 503);
        expect(rolled).toEqual({ title: 'Alice', elapsed: 33 });
    });

    it('does nothing on other statuses — the seek may in fact have landed', () => {
        expect(seekRefusalRollback(state, pending, 33, 500)).toBeNull();
        expect(seekRefusalRollback(state, pending, 33, undefined)).toBeNull();
    });

    it('does nothing once the track has changed — the anchor belongs to another song', () => {
        const other = { title: 'Kick', elapsed: 4 };
        expect(seekRefusalRollback(other, pending, 33, 503)).toBeNull();
    });

    it('does nothing without a seek in flight or without an anchor', () => {
        expect(seekRefusalRollback(state, null, 33, 503)).toBeNull();
        expect(seekRefusalRollback(state, pending, undefined, 503)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// toggleRefusalRollback — a refused play/pause undoes the optimistic flip
// ---------------------------------------------------------------------------

describe('toggleRefusalRollback', () => {
    const anchor = { playing: true, playback_status: 'Playing', title: 'Alice' };
    const flipped = { title: 'Alice', playing: false, playback_status: 'Paused' };

    it('restores the pre-flip transport state on a 503 for the same track', () => {
        expect(toggleRefusalRollback(flipped, anchor, 503))
            .toEqual({ title: 'Alice', playing: true, playback_status: 'Playing' });
    });

    it('does nothing on other statuses — the toggle may in fact have landed', () => {
        expect(toggleRefusalRollback(flipped, anchor, 500)).toBeNull();
        expect(toggleRefusalRollback(flipped, anchor, undefined)).toBeNull();
    });

    it('does nothing once the track has changed', () => {
        expect(toggleRefusalRollback({ ...flipped, title: 'Kick' }, anchor, 503)).toBeNull();
    });

    it('does nothing without an anchor', () => {
        expect(toggleRefusalRollback(flipped, undefined, 503)).toBeNull();
    });
});
