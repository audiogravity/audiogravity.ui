/**
 * Unit tests for ag-now-playing-fullscreen.js — auto-follow source logic.
 *
 * Tests the _applyState / _switchSource auto-follow state machine in isolation,
 * without instantiating the full LitElement component (DOM side-effects in jsdom).
 *
 * Covers:
 * - Default: _targetSourceId tracks the backend-active source automatically
 * - _followSource is called (SSE reconnects) when auto-switching
 * - User override: _switchSource suspends auto-follow
 * - Override lifted: when user-chosen source stops playing, auto-follow resumes
 * - _switchSource is a no-op when already on the target source
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Simulate the _applyState auto-follow logic from ag-now-playing-fullscreen.js
// ---------------------------------------------------------------------------

/**
 * Replicate the exact auto-follow block from AgNowPlayingFullscreen._applyState
 * and the _switchSource / _followSource helpers.
 *
 * @param {object} fs - Simulated component state (mutated in-place).
 * @param {object} state - Incoming SSE state.
 */
function applyState(fs, state) {
    const playing = state.sources?.filter(s => s.playing);
    if (playing?.length) fs.sources = playing;

    if (fs.userOverride && !fs.sources.find(s => s.source_id === fs.targetSourceId)) {
        fs.userOverride = false;
        // Immediately follow the new active source. The current SSE tick comes
        // from the dead source (state.playing may be false), so we cannot rely
        // on the condition below — use _sources directly instead.
        const next = fs.sources.find(s => s.playing);
        if (next) followSource(fs, next.source_id);
    }

    if (!fs.userOverride && state.source_id && state.playing && state.source_id !== fs.targetSourceId) {
        followSource(fs, state.source_id);
    }
}

/** Mirrors AgNowPlayingFullscreen._followSource (no state reset, SSE reconnects). */
function followSource(fs, sourceId) {
    if (sourceId === fs.targetSourceId) return;
    fs.targetSourceId = sourceId;
    fs.connectSseCalls++;
}

/** Mirrors AgNowPlayingFullscreen._switchSource (user-initiated, resets state). */
function switchSource(fs, sourceId) {
    if (sourceId === fs.targetSourceId) return;
    fs.userOverride = true;
    fs.targetSourceId = sourceId;
    fs.connectSseCalls++;
}

/** Build a minimal playing SourceInfo entry. */
const src = (id, playing = true) => ({ source_id: id, playing });

/** Build a minimal SSE PlayerState. */
const state = (sourceId, playing, sources = []) => ({
    source_id: sourceId,
    playing,
    title: playing ? 'Track' : null,
    sources,
    elapsed: 0,
});

// ---------------------------------------------------------------------------

describe('AgNowPlayingFullscreen — auto-follow (_applyState)', () => {
    let fs;

    beforeEach(() => {
        fs = { targetSourceId: 'src_mpd', sources: [], userOverride: false, connectSseCalls: 0 };
    });

    // --- default auto-follow ---

    it('auto-follows when the backend switches to a new active source', () => {
        applyState(fs, state('src_roon', true, [src('src_mpd'), src('src_roon')]));
        expect(fs.targetSourceId).toBe('src_roon');
        expect(fs.connectSseCalls).toBe(1);
    });

    it('does not reconnect SSE when source_id already matches targetSourceId', () => {
        applyState(fs, state('src_mpd', true, [src('src_mpd')]));
        expect(fs.connectSseCalls).toBe(0);
    });

    it('does not auto-follow when playing is false', () => {
        applyState(fs, state('src_roon', false, [src('src_roon')]));
        expect(fs.targetSourceId).toBe('src_mpd');
        expect(fs.connectSseCalls).toBe(0);
    });

    it('auto-follows across multiple source changes', () => {
        applyState(fs, state('src_roon', true,      [src('src_roon')]));
        expect(fs.targetSourceId).toBe('src_roon');
        applyState(fs, state('src_librespot', true, [src('src_librespot')]));
        expect(fs.targetSourceId).toBe('src_librespot');
        expect(fs.connectSseCalls).toBe(2);
    });

    // --- user override (_switchSource) ---

    it('_switchSource sets userOverride and updates targetSourceId', () => {
        switchSource(fs, 'src_roon');
        expect(fs.userOverride).toBe(true);
        expect(fs.targetSourceId).toBe('src_roon');
        expect(fs.connectSseCalls).toBe(1);
    });

    it('_switchSource is a no-op when already on the target source', () => {
        switchSource(fs, 'src_mpd');
        expect(fs.connectSseCalls).toBe(0);
        expect(fs.userOverride).toBe(false);  // unchanged
    });

    it('respects override — does not auto-follow after manual navigation', () => {
        switchSource(fs, 'src_roon');          // user navigates to Roon
        fs.sources = [src('src_mpd'), src('src_roon')];
        // Backend reports MPD as active
        applyState(fs, state('src_mpd', true, [src('src_mpd'), src('src_roon')]));
        expect(fs.targetSourceId).toBe('src_roon');  // stays on user's choice
        expect(fs.connectSseCalls).toBe(1);          // no extra reconnect
    });

    it('override is not lifted while user-chosen source is still playing', () => {
        switchSource(fs, 'src_roon');
        fs.sources = [src('src_mpd'), src('src_roon')];
        applyState(fs, state('src_mpd', true, [src('src_mpd'), src('src_roon')]));
        expect(fs.userOverride).toBe(true);
    });

    // --- override lifted ---

    it('lifts override and auto-follows when user-chosen source stops playing', () => {
        switchSource(fs, 'src_roon');
        fs.sources = [src('src_mpd'), src('src_roon')];
        // Roon stops — only MPD in sources
        applyState(fs, state('src_mpd', true, [src('src_mpd')]));
        expect(fs.userOverride).toBe(false);
        expect(fs.targetSourceId).toBe('src_mpd');
    });

    it('lifts override and follows new active after chosen source stops', () => {
        switchSource(fs, 'src_roon');
        fs.sources = [src('src_mpd'), src('src_roon')];
        // Roon stops; Spotify becomes active
        applyState(fs, state('src_librespot', true, [src('src_mpd'), src('src_librespot')]));
        expect(fs.userOverride).toBe(false);
        expect(fs.targetSourceId).toBe('src_librespot');
    });

    it('SSE reconnects once when override is lifted and source switches', () => {
        switchSource(fs, 'src_roon');    // 1 reconnect (manual switch)
        fs.sources = [src('src_mpd'), src('src_roon')];
        applyState(fs, state('src_mpd', true, [src('src_mpd')]));  // override lifted + auto-follow
        expect(fs.connectSseCalls).toBe(2);
    });

    // --- regression: override lifted on playing:false tick must still auto-follow ---
    // Bug: when the dead source's final tick has state.playing=false, the condition
    // "state.playing && ..." never fires → fullscreen stuck on dead source forever.
    // Fix: immediately follow _sources.find(s => s.playing) inside the override-lift block.

    it('immediately follows new source when override is lifted on a playing:false tick', () => {
        switchSource(fs, 'src_roon');
        fs.sources = [src('src_mpd'), src('src_roon')];
        // Final tick from dead Roon source: playing=false, but MPD is in sources
        applyState(fs, state('src_roon', false, [src('src_mpd')]));
        expect(fs.userOverride).toBe(false);
        expect(fs.targetSourceId).toBe('src_mpd');  // must have followed MPD
        expect(fs.connectSseCalls).toBe(2);         // 1 manual + 1 auto
    });

    it('does not crash when override lifts and no source is playing', () => {
        switchSource(fs, 'src_roon');
        // Roon stops, nothing else playing
        applyState(fs, state('src_roon', false, []));
        expect(fs.userOverride).toBe(false);
        expect(fs.targetSourceId).toBe('src_roon'); // no source to follow, stays
        expect(fs.connectSseCalls).toBe(1);         // only the manual switch
    });
});

// ---------------------------------------------------------------------------
// AgNowPlayingFullscreen — _rendererActive predicate + signal path visibility
// ---------------------------------------------------------------------------

/**
 * Simulate the _rendererActive getter.
 * @param {object|null} rendererStatus
 * @returns {boolean}
 */
function rendererActive(rendererStatus) {
    return !!(rendererStatus?.connected && !rendererStatus?.bypassed);
}

/**
 * Simulate the hasSignal condition used in _renderMeta.
 * @param {Array|null} signalPath
 * @param {string|null} outputLabel
 * @returns {boolean}
 */
function hasSignal(signalPath, outputLabel) {
    return !!(signalPath?.length || outputLabel);
}

describe('AgNowPlayingFullscreen — _rendererActive + signal path', () => {
    it('rendererActive: true when connected and not bypassed', () => {
        expect(rendererActive({ connected: true, bypassed: false })).toBe(true);
    });

    it('rendererActive: false when bypassed', () => {
        expect(rendererActive({ connected: true, bypassed: true })).toBe(false);
    });

    it('rendererActive: false when disconnected', () => {
        expect(rendererActive({ connected: false, bypassed: false })).toBe(false);
    });

    it('rendererActive: false when no renderer status', () => {
        expect(rendererActive(null)).toBe(false);
    });

    it('hasSignal: true with non-empty signal_path', () => {
        expect(hasSignal([{ label: 'MPD' }, { label: 'Heed Abacus' }], null)).toBe(true);
    });

    it('hasSignal: true with output_label only', () => {
        expect(hasSignal([], 'Heed Abacus')).toBe(true);
    });

    it('hasSignal: false with empty path and no label', () => {
        expect(hasSignal([], null)).toBe(false);
        expect(hasSignal(null, null)).toBe(false);
    });

    it('signal path shown when renderer bypassed and signal present', () => {
        const rs = { connected: true, bypassed: true };
        const sp = [{ label: 'MPD' }, { label: 'Heed Abacus' }];
        // signal_path from backend already includes complete chain
        expect(hasSignal(sp, null)).toBe(true);
        expect(rendererActive(rs)).toBe(false);
    });

    it('signal path shown when no renderer and signal present', () => {
        expect(hasSignal([{ label: 'MPD' }], 'Heed Abacus')).toBe(true);
        expect(rendererActive(null)).toBe(false);
    });

    it('renderer step present in signal_path when renderer active (backend enrichment)', () => {
        // Backend prepends renderer step — signal_path carries the full chain.
        const sp = [
            { label: 'Qobuz' },
            { label: 'music.#1' },
            { label: 'MPD' },
            { label: 'USB' },
            { label: 'Heed Abacus' },
        ];
        expect(hasSignal(sp, null)).toBe(true);
        expect(sp[0].label).toBe('Qobuz');
        expect(sp[1].label).toBe('music.#1');
    });

    it('idle renderer badge shown when renderer active but signal_path is empty', () => {
        // When active is None on the backend, signal_path is empty — the renderer
        // badge must still appear so the user can see the renderer is routed.
        const rs = { connected: true, bypassed: false, renderer_name: 'music.#1' };
        expect(rendererActive(rs)).toBe(true);
        expect(hasSignal(null, null)).toBe(false);
        // The source row condition: hasSignal || rendererActive → must be shown
        expect(hasSignal(null, null) || rendererActive(rs)).toBe(true);
    });

    it('idle renderer badge NOT shown when renderer disconnected and no signal', () => {
        const rs = { connected: false, bypassed: false };
        expect(rendererActive(rs)).toBe(false);
        expect(hasSignal(null, null) || rendererActive(rs)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// AgNowPlayingFullscreen — _nextTrack cleared on renderer disconnect
// ---------------------------------------------------------------------------

/**
 * Simulate the renderer_status SSE callback logic.
 * @param {object} fs - Component state with _nextTrack property (mutated in-place).
 * @param {object|null} data - renderer_status SSE payload.
 */
function applyRendererStatus(fs, data) {
    fs.rendererStatus = data;
    if (data?.connected && !data.bypassed && data.queue_total != null) {
        fs.nextTrack = data.queue_next_title != null
            ? { title: data.queue_next_title, artist: data.queue_next_artist ?? null,
                album: data.queue_next_album ?? null, cover_token: data.queue_next_cover_token ?? null }
            : null;
    } else if (!data?.connected || data?.bypassed) {
        fs.nextTrack = null;
    }
}

describe('AgNowPlayingFullscreen — _nextTrack cleared on renderer disconnect', () => {
    it('_nextTrack set from renderer queue when connected', () => {
        const fs = { nextTrack: null, rendererStatus: null };
        applyRendererStatus(fs, {
            connected: true, bypassed: false, queue_total: 5,
            queue_next_title: 'Track 2', queue_next_artist: 'Artist', queue_next_album: 'Album', queue_next_cover_token: 'tok',
        });
        expect(fs.nextTrack).toEqual({ title: 'Track 2', artist: 'Artist', album: 'Album', cover_token: 'tok' });
    });

    it('_nextTrack set to null when queue_next_title is null', () => {
        const fs = { nextTrack: { title: 'Old' }, rendererStatus: null };
        applyRendererStatus(fs, { connected: true, bypassed: false, queue_total: 3, queue_next_title: null });
        expect(fs.nextTrack).toBeNull();
    });

    it('_nextTrack cleared when renderer disconnects', () => {
        const fs = { nextTrack: { title: 'Stale Track' }, rendererStatus: null };
        applyRendererStatus(fs, { connected: false, bypassed: false, queue_total: null });
        expect(fs.nextTrack).toBeNull();
    });

    it('_nextTrack cleared when renderer is bypassed', () => {
        const fs = { nextTrack: { title: 'Stale Track' }, rendererStatus: null };
        applyRendererStatus(fs, { connected: true, bypassed: true, queue_total: null });
        expect(fs.nextTrack).toBeNull();
    });

    it('_nextTrack not touched when renderer is connected but queue_total is null', () => {
        // queue_total=null means no queue — we don't enter either branch.
        const fs = { nextTrack: { title: 'Some Track' }, rendererStatus: null };
        applyRendererStatus(fs, { connected: true, bypassed: false, queue_total: null });
        // Neither branch fires — _nextTrack unchanged.
        expect(fs.nextTrack).toEqual({ title: 'Some Track' });
    });
});

// ---------------------------------------------------------------------------
// AgNowPlayingFullscreen — _coverErrorToken cleared on track change
// ---------------------------------------------------------------------------

/**
 * Simulate the _applyState cover-error reset logic.
 * Returns the new coverErrorToken after applying the state change.
 */
function applyCoverReset(prevTitle, prevSourceId, newTitle, newSourceId, prevErrorToken) {
    const trackChanged  = newTitle     !== prevTitle;
    const sourceChanged = newSourceId  !== prevSourceId;
    let coverErrorToken = prevErrorToken;
    if (trackChanged || sourceChanged) coverErrorToken = null;
    return coverErrorToken;
}

describe('AgNowPlayingFullscreen — _coverErrorToken reset on track/source change', () => {
    it('cover error token cleared when track title changes', () => {
        expect(applyCoverReset('Track A', 'src_mpd', 'Track B', 'src_mpd', 'tok-123')).toBeNull();
    });

    it('cover error token cleared when source changes', () => {
        expect(applyCoverReset('Track A', 'src_mpd', 'Track A', 'src_qobuz', 'tok-123')).toBeNull();
    });

    it('cover error token preserved when same track and source', () => {
        expect(applyCoverReset('Track A', 'src_mpd', 'Track A', 'src_mpd', 'tok-123')).toBe('tok-123');
    });

    it('cover error token null when no error was set', () => {
        expect(applyCoverReset('Track A', 'src_mpd', 'Track B', 'src_mpd', null)).toBeNull();
    });

    it('cover error token cleared when title changes to null (track ends)', () => {
        expect(applyCoverReset('Track A', 'src_mpd', null, 'src_mpd', 'tok-abc')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Track number badge — tnLabel computation
// Mirrors the exact expression in AgNowPlayingFullscreen._renderCoverArt.
// ---------------------------------------------------------------------------

/**
 * @param {object|null} s - NowPlayingItem state (or null when nothing is playing).
 * @returns {string|null} formatted badge label or null.
 */
function computeTnLabel(s) {
    const tn = s?.track_number;
    return tn
        ? `A${Math.ceil(parseInt(tn) / 10)} · TRACK ${tn.toString().padStart(2, '0')}`
        : null;
}

describe('AgNowPlayingFullscreen — track number badge (tnLabel)', () => {
    it('formats track 5 as A1 · TRACK 05', () => {
        expect(computeTnLabel({ track_number: '5' })).toBe('A1 · TRACK 05');
    });

    it('formats track 10 as A1 · TRACK 10 (ceiling boundary: last track of side A)', () => {
        expect(computeTnLabel({ track_number: '10' })).toBe('A1 · TRACK 10');
    });

    it('formats track 11 as A2 · TRACK 11 (next vinyl side)', () => {
        expect(computeTnLabel({ track_number: '11' })).toBe('A2 · TRACK 11');
    });

    it('returns null when track_number is null (backend did not populate it)', () => {
        expect(computeTnLabel({ track_number: null })).toBeNull();
    });

    it('returns null when track_number is absent from the state object', () => {
        expect(computeTnLabel({})).toBeNull();
    });

    it('returns null when state is null (nothing playing)', () => {
        expect(computeTnLabel(null)).toBeNull();
    });
});
