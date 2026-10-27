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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStylesheet, cssRuleBody, mediaBlock } from '../../test-utils.js';

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
        applyState(fs, state('src_shairport-sync', true, [src('src_shairport-sync')]));
        expect(fs.targetSourceId).toBe('src_shairport-sync');
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
        applyState(fs, state('src_shairport-sync', true, [src('src_mpd'), src('src_shairport-sync')]));
        expect(fs.userOverride).toBe(false);
        expect(fs.targetSourceId).toBe('src_shairport-sync');
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
 * Simulate the _rendererOut/_rendererActive getters — driven by
 * PlayerState.outputs[] (renderer_status SSE no longer feeds the player).
 * @param {Array|null} outputs
 * @returns {boolean}
 */
function rendererActive(outputs) {
    return !!(outputs ?? []).find(o => o.type === 'upnp_renderer' && o.active);
}

const FS_LOCAL_OUT    = { id: 'local', type: 'local', name: 'Heed Abacus', active: true, transport_state: 'PLAYING' };
const FS_RENDERER_OUT = { id: 'uuid:m', type: 'upnp_renderer', name: 'Marantz', active: true, transport_state: 'PLAYING' };

/**
 * Simulate the hasSignal condition used in _renderMeta.
 * @param {Array|null} signalPath
 * @param {string|null} outputLabel
 * @returns {boolean}
 */
function hasSignal(signalPath, outputLabel) {
    return !!(signalPath?.length || outputLabel);
}

describe('AgNowPlayingFullscreen — _rendererActive + signal path (outputs[]-based)', () => {
    it('rendererActive: true when an active renderer output is present', () => {
        expect(rendererActive([{ ...FS_LOCAL_OUT, active: false }, FS_RENDERER_OUT])).toBe(true);
    });

    it('rendererActive: false when the renderer entry is inactive (unreachable)', () => {
        expect(rendererActive([FS_LOCAL_OUT, { ...FS_RENDERER_OUT, active: false, transport_state: null }])).toBe(false);
    });

    it('rendererActive: false with local-only outputs', () => {
        expect(rendererActive([FS_LOCAL_OUT])).toBe(false);
    });

    it('rendererActive: false when no outputs yet', () => {
        expect(rendererActive([])).toBe(false);
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

    it('signal path shown when renderer inactive and signal present', () => {
        const outs = [FS_LOCAL_OUT, { ...FS_RENDERER_OUT, active: false }];
        const sp = [{ label: 'MPD' }, { label: 'Heed Abacus' }];
        // signal_path from backend already includes complete chain
        expect(hasSignal(sp, null)).toBe(true);
        expect(rendererActive(outs)).toBe(false);
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
        const outs = [{ ...FS_LOCAL_OUT, active: false }, FS_RENDERER_OUT];
        expect(rendererActive(outs)).toBe(true);
        expect(hasSignal(null, null)).toBe(false);
        // The source row condition: hasSignal || rendererActive → must be shown
        expect(hasSignal(null, null) || rendererActive(outs)).toBe(true);
    });

    it('idle renderer badge NOT shown when renderer inactive and no signal', () => {
        const outs = [FS_LOCAL_OUT, { ...FS_RENDERER_OUT, active: false }];
        expect(rendererActive(outs)).toBe(false);
        expect(hasSignal(null, null) || rendererActive(outs)).toBe(false);
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


// ---------------------------------------------------------------------------
// AgNowPlayingFullscreen — "Up next" from PlayerState.queue_next (spec dec. #2)
// ---------------------------------------------------------------------------

/**
 * Replicate the _applyState "Up next" resolution: an item playing on a network
 * output reads state.queue_next (pushed live over SSE); the local path falls
 * back to the MPD queue fetch.
 *
 * Keyed on played_on — the output the audio comes out of — not on the internal
 * routing handle, which the UI must never test against.
 * @param {object} state - PlayerState-like object.
 * @returns {{nextTrack: object|null, needsFetch: boolean}}
 */
function resolveUpNext(state) {
    const playsOnNetworkOutput = !!state.played_on && state.played_on !== 'local';
    if (playsOnNetworkOutput) return { nextTrack: state.queue_next ?? null, needsFetch: false };
    return { nextTrack: undefined, needsFetch: true };
}

describe('AgNowPlayingFullscreen — Up next from PlayerState.queue_next', () => {
    it('renderer cast: up-next comes from state.queue_next, no fetch', () => {
        const r = resolveUpNext({
            played_on: 'uuid:m',
            queue_next: { title: 'So What', artist: 'Miles Davis' },
        });
        expect(r.needsFetch).toBe(false);
        expect(r.nextTrack.title).toBe('So What');
    });

    it('renderer cast at end of queue: up-next cleared, no fetch', () => {
        const r = resolveUpNext({ played_on: 'uuid:m', queue_next: null });
        expect(r.needsFetch).toBe(false);
        expect(r.nextTrack).toBe(null);
    });

    it('local playback: falls back to the queue fetch', () => {
        const r = resolveUpNext({ played_on: 'local', queue_next: null });
        expect(r.needsFetch).toBe(true);
    });

    it('a local item shown while a cast runs elsewhere keeps its own queue', () => {
        // state.queue_next travels on every state, including a source-pinned
        // one: testing "is some renderer active" made the AirPlay view show the
        // renderer's queue. The item on screen decides.
        const r = resolveUpNext({
            played_on: 'local',
            outputs: [FS_RENDERER_OUT],
            queue_next: { title: 'Track from the cast' },
        });
        expect(r.needsFetch).toBe(true);
        expect(r.nextTrack).toBeUndefined();
    });

    it('a state without played_on falls back to the local path', () => {
        const r = resolveUpNext({ queue_next: { title: 'x' } });
        expect(r.needsFetch).toBe(true);
    });
});


// ---------------------------------------------------------------------------
// AgNowPlayingFullscreen — control payload carries the routing handle (spec §3)
// ---------------------------------------------------------------------------

/**
 * Replicate the _control body construction (routing part only).
 * @param {string} action
 * @param {*} value
 * @param {string|null} targetSourceId
 * @param {object|null} state - Displayed PlayerState.
 * @returns {object} POST body
 */
function buildFsControlBody(action, value, targetSourceId, state) {
    const body = { action };
    if (value !== undefined) body.value = value;
    if (targetSourceId) body.source_id = targetSourceId;
    if (state?.control_id && (!targetSourceId || state.source_id === targetSourceId)) {
        body.control_id = state.control_id;
    }
    return body;
}

describe('AgNowPlayingFullscreen — control body routing handle', () => {
    it('sends the displayed state control_id when it matches the target', () => {
        const body = buildFsControlBody('toggle', undefined, 'upnp_renderer',
            { source_id: 'upnp_renderer', control_id: 'upnp_renderer' });
        expect(body.control_id).toBe('upnp_renderer');
        expect(body.source_id).toBe('upnp_renderer');
    });

    it('does not send a mismatched handle after a source switch', () => {
        // Target switched to src_mpd but displayed state still the renderer cast.
        const body = buildFsControlBody('toggle', undefined, 'src_mpd',
            { source_id: 'upnp_renderer', control_id: 'upnp_renderer' });
        expect(body.control_id).toBeUndefined();
        expect(body.source_id).toBe('src_mpd');
    });

    it('sends control_id with no explicit target (active-source control)', () => {
        const body = buildFsControlBody('next', undefined, null,
            { source_id: 'src_mpd', control_id: 'src_mpd' });
        expect(body.control_id).toBe('src_mpd');
        expect(body.source_id).toBeUndefined();
    });
});


// ---------------------------------------------------------------------------
// Output error surfacing (spec §8.1.3 step 1)
// ---------------------------------------------------------------------------
// The exclusive DAC held by another local service made playback fail silently.
// The active output entry now carries the engine's reason; the player shows a
// plain-language line (raw message kept as the tooltip).

/** Replicate the _outputError / _outputErrorLabel getters. */
function outputError(state) {
    return (state?.outputs ?? []).find(o => o.active)?.error ?? null;
}
function outputErrorLabel(state) {
    const raw = outputError(state) ?? '';
    return /busy/i.test(raw)
        ? 'Output in use by another player — stop it to play here'
        : 'Output unavailable';
}

describe('AgNowPlayingFullscreen — output error', () => {
    const BUSY = 'Failed to open ALSA device "hw:0,0": Device or resource busy';

    it('reads the error from the ACTIVE output entry', () => {
        const state = { outputs: [{ ...FS_LOCAL_OUT, active: true, error: BUSY }] };
        expect(outputError(state)).toBe(BUSY);
    });

    it('ignores an error on an inactive output', () => {
        const state = { outputs: [
            { ...FS_LOCAL_OUT, active: false, error: BUSY },
            { ...FS_RENDERER_OUT, active: true },
        ] };
        expect(outputError(state)).toBe(null);
    });

    it('no error in the normal case', () => {
        expect(outputError({ outputs: [FS_LOCAL_OUT] })).toBe(null);
        expect(outputError({ outputs: [] })).toBe(null);
        expect(outputError(null)).toBe(null);
    });

    it('a busy device gets an actionable plain-language label', () => {
        const state = { outputs: [{ ...FS_LOCAL_OUT, active: true, error: BUSY }] };
        expect(outputErrorLabel(state)).toMatch(/in use by another player/);
    });

    it('any other failure falls back to a generic label', () => {
        const state = { outputs: [{ ...FS_LOCAL_OUT, active: true, error: 'snd_pcm_open failed' }] };
        expect(outputErrorLabel(state)).toBe('Output unavailable');
    });
});


// ---------------------------------------------------------------------------
// "Up next" belongs to the item on screen, not to whatever renderer is active
// ---------------------------------------------------------------------------
// Code review 2026-07-20: the routing test read the GLOBAL outputs[] list, so
// with a cast running and the user switched (via the dots) to another
// concurrently playing source, the AirPlay view showed the RENDERER's queue —
// state.queue_next travels on every state, including a source-pinned one.

/** Replicate the Up-next routing decision from _applyState. */
function upNextComesFromRendererQueue(state) {
    return (state.control_id ?? state.source_id) === 'upnp_renderer';
}

describe('fullscreen — Up next source selection', () => {
    const RENDERER_OUTPUTS = [
        { id: 'local', type: 'local', active: false },
        { id: 'uuid:m', type: 'upnp_renderer', active: true },
    ];

    it('uses the renderer queue when the displayed item IS the cast', () => {
        expect(upNextComesFromRendererQueue({
            control_id: 'upnp_renderer', source_id: 'upnp_renderer',
            outputs: RENDERER_OUTPUTS,
        })).toBe(true);
    });

    it('does NOT use it for another source while a cast runs elsewhere', () => {
        // The old global test returned true here and overwrote the AirPlay
        // view's Up-next with the renderer queue on every tick.
        expect(upNextComesFromRendererQueue({
            control_id: 'src_shairport-sync', source_id: 'src_shairport-sync',
            outputs: RENDERER_OUTPUTS,
        })).toBe(false);
    });

    it('falls back to source_id when control_id is absent', () => {
        expect(upNextComesFromRendererQueue({
            source_id: 'upnp_renderer', outputs: RENDERER_OUTPUTS,
        })).toBe(true);
    });

    it('is false for a plain local source with no outputs listed', () => {
        expect(upNextComesFromRendererQueue({ source_id: 'src_mpd' })).toBe(false);
    });
});




// ---------------------------------------------------------------------------
// Volume — the slider must not fall back to a level the finger already left
// ---------------------------------------------------------------------------
// Measured on a running box: a twelve-command drag is answered 1.26 s after its
// last command, while the popover only masks 1.5 s — correct by a quarter of a
// second of margin rather than by construction.
//
// These drive the REAL _control and _applyState. An earlier version replicated
// their wiring in local helpers, which passed while three defects sat in the
// shipped code: a rollback on any error rather than on a refusal, and two
// stale-command hazards during a drag.

import { AgNowPlayingFullscreen } from './ag-now-playing-fullscreen.js';
import { apiPost } from '../../api.js';

vi.mock('../../api.js', () => ({
    apiGet: vi.fn(async () => ({})),
    apiPost: vi.fn(async () => ({})),
}));

describe('AgNowPlayingFullscreen — volume in flight (real _control)', () => {
    const BASE = { source_id: 'src_mpd', control_id: 'src_mpd', volume: 26, title: 'A' };

    /** A component instance without the DOM lifecycle. */
    function fs(state = { ...BASE }) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        // _state is a Lit reactive property: its accessor expects a live
        // element. Shadow it with a plain field so the component's own logic
        // runs untouched without the DOM lifecycle.
        Object.defineProperty(el, '_state',
            { value: state, writable: true, configurable: true });
        el._targetSourceId = null;
        el._volumePending = undefined;
        el._seekPending = null;
        el._controlRecentTime = null;
        el.requestUpdate = () => {};
        return el;
    }

    beforeEach(() => { apiPost.mockReset(); apiPost.mockResolvedValue({}); });

    it('shows the level asked for at once, and remembers what to hold', async () => {
        const el = fs();
        await el._control('set_volume', 60);
        expect(el._state.volume).toBe(60);
        expect(el._volumePending.target).toBe(60);
        expect(apiPost).toHaveBeenCalledWith('/player/control',
            expect.objectContaining({ action: 'set_volume', value: 60 }));
    });

    it('ignores a level the finger already left, then releases on the target', () => {
        const el = fs();
        el._volumePending = { target: 60, at: Date.now(), sourceId: 'src_mpd' };
        // A state from the drag's own trail.
        expect(el._applyVolumeGuard({ ...BASE, volume: 47 }).volume).toBe(60);
        expect(el._applyVolumeGuard({ ...BASE, volume: 60 }).volume).toBe(60);
        expect(el._volumePending).toBeNull();
    });

    it('restores the previous level when the output REFUSES it', async () => {
        const el = fs();
        const refusal = Object.assign(new Error('refused'), { status: 503 });
        apiPost.mockRejectedValueOnce(refusal);
        await el._control('set_volume', 60);
        expect(el._state.volume).toBe(26);
        expect(el._volumePending).toBeNull();
    });

    it('does NOT roll back on a network error — the level may well have taken', async () => {
        const el = fs();
        apiPost.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await el._control('set_volume', 60);
        expect(el._state.volume).toBe(60);
        expect(el._volumePending.target).toBe(60);
    });

    it('an older command failing does not undo a newer one', async () => {
        // A drag fires overlapping commands: the first can answer last.
        const el = fs();
        let releaseFirst;
        apiPost.mockImplementationOnce(() => new Promise((_r, rej) => {
            releaseFirst = () => rej(Object.assign(new Error('refused'), { status: 503 }));
        }));
        const first = el._control('set_volume', 40);
        await el._control('set_volume', 60);      // the newer one lands first
        releaseFirst();
        await first;
        expect(el._state.volume).toBe(60);
        expect(el._volumePending.target).toBe(60);
    });
});

/**
 * The fullscreen player is one tap from the mini player, and both badge the
 * same stream. This screen resolved its badge with the name hard-wired to
 * `null`, which went unnoticed while no caller passed a name at all — the
 * moment the mini player started passing one, the same stream read
 * "MinimServer" in one and "UPnP" in the other.
 */
describe('the badge agrees with the mini player it is opened from', () => {
    const SOURCE = readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-now-playing-fullscreen.js'),
        'utf8',
    );

    it('never resolves a badge with the name thrown away', () => {
        expect(SOURCE).not.toMatch(/originBadge\([^)]*,\s*null\s*\)/);
    });

    it('uses the shared resolver, so both screens answer from one rule', () => {
        // Other names may share the import (canAddToPlaylist does): what matters is
        // that the badge helpers come from the shared module, not a copy.
        expect(SOURCE).toMatch(/import \{[^}]*\boriginBadge, originBadgeName\b[^}]*\} from '\.\.\/library-constants\.js'/);
        expect(SOURCE).toMatch(/originBadge\(s\.origin, originBadgeName\(s\)\)/);
    });
});

// ---------------------------------------------------------------------------
// "Add to playlist" — offered for the track playing now, when the box can name it
// ---------------------------------------------------------------------------

import { render as litRender } from 'lit';
import { PLAYLIST_ADD_EVENT } from '../molecules/ag-playlist-picker.js';

describe('AgNowPlayingFullscreen — "Add to playlist" for the track playing now', () => {
    const HRA = {
        title: 'Tukuman', artist: 'Enzo Favata', album: 'Ritornare', cover_token: 'url:x',
        content_source_id: 'src_highresaudio', content_item_id: 't1_a1',
    };

    /** Render the title block of a state into a detached host. */
    function titleBlock(state) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        // A getter on the prototype: shadowed, as `_state` is above.
        Object.defineProperty(el, '_rendererActive', { value: false });
        const host = document.createElement('div');
        litRender(el._renderMeta(state), host);
        return { el, host };
    }

    it('is offered for a HIGHRESAUDIO track the box can name', () => {
        const { host } = titleBlock(HRA);
        expect(host.querySelector('ag-library-playlist-btn[variant="player"]')).not.toBeNull();
    });

    it('is offered for a Qobuz track the box can name', () => {
        const { host } = titleBlock({ ...HRA, content_source_id: 'src_qobuz', content_item_id: '55635245' });
        expect(host.querySelector('ag-library-playlist-btn[variant="player"]')).not.toBeNull();
    });

    it.each([
        ['a purchase', { content_item_id: 'vault:t1_a1_tx' }],
        ['a track the box cannot name', { content_item_id: null }],
        ['another service', { content_source_id: 'src_tidal', content_item_id: '555' }],
        ['the music on the box', { content_source_id: 'src_mpd', content_item_id: null }],
    ])('is not offered for %s', (_, over) => {
        const { host } = titleBlock({ ...HRA, ...over });
        expect(host.querySelector('ag-library-playlist-btn')).toBeNull();
    });

    it('keeps the title lines stacked beside the button', () => {
        // Seen on screen on 2026-09-23, not in a test: ag-track-meta is
        // `display: contents`, so put straight into the row its title, artist and
        // album became three columns side by side. jsdom lays nothing out — hence the
        // markup contract here, and the layout contract read out of the stylesheet.
        const { host } = titleBlock(HRA);
        expect(host.querySelector('.npfs-title-row > ag-track-meta')).toBeNull();
        expect(host.querySelector('.npfs-title-row > .npfs-title-col > ag-track-meta')).not.toBeNull();
        const css = readStylesheet('css', 'components', 'now-playing-fullscreen.css');
        const col = cssRuleBody(css, '.npfs-title-col') ?? '';
        expect(col).toMatch(/display:\s*flex/);
        expect(col).toMatch(/flex-direction:\s*column/);
    });

    it('hands the picker the track on screen, id included', () => {
        const { el } = titleBlock(HRA);
        let detail = null;
        const listen = (e) => { detail = e.detail; };
        window.addEventListener(PLAYLIST_ADD_EVENT, listen);
        el._addPlayingToPlaylist(HRA);
        window.removeEventListener(PLAYLIST_ADD_EVENT, listen);
        expect(detail).toEqual({
            sourceId: 'src_highresaudio', itemType: 'track', itemId: 't1_a1',
            title: 'Tukuman', subtitle: 'Enzo Favata · Ritornare', coverToken: 'url:x',
        });
    });
});

// ---------------------------------------------------------------------------
// A wide, landscape screen: the cover on the left, everything else beside it
// ---------------------------------------------------------------------------

describe('AgNowPlayingFullscreen — two columns on a wide screen', () => {
    // On a computer the single column scattered: a small cover centred, the title flush
    // left, the signal path flush right, the format cells stretched across. jsdom lays
    // nothing out, so the layout contract is read from the stylesheet.

    /** The two-column block of the stylesheet. */
    const wideBlock = () => mediaBlock(readStylesheet('css', 'components', 'now-playing-fullscreen.css'),
        /@media\s*\(width\s*>=\s*900px\)\s*and\s*\(orientation:\s*landscape\)/);

    it('lays the player out as a grid of a cover column and a column beside it', () => {
        const scroll = cssRuleBody(wideBlock(), '.npfs-scroll');
        expect(scroll).toMatch(/display:\s*grid/);
        expect(scroll).toMatch(/grid-template-columns:/);
    });

    it('gives the cover the left column, centred on the height', () => {
        const block = wideBlock();
        expect(cssRuleBody(block, '.npfs-scroll > .npfs-cover-wrap')).toMatch(/grid-column:\s*1/);
        expect(cssRuleBody(block, '.npfs-scroll')).toMatch(/align-items:\s*center/);
    });

    it('puts everything else in one block in the right column, the format strip included', () => {
        const block = wideBlock();
        const info = cssRuleBody(block, '.npfs-info');
        expect(info).toMatch(/grid-column:\s*2/);
        expect(info).toMatch(/display:\s*flex/);
        expect(info).toMatch(/flex-direction:\s*column/);
        // A display: contents element makes no flex item.
        expect(cssRuleBody(block, '.npfs-info > ag-format-strip')).toMatch(/display:\s*block/);
        // The column's full width, over the phone's caps: `.npfs-info > ag-progress-bar`
        // weighs more than `.npfs-info > *`, and kept the bar to 340px of 520 (measured).
        expect(cssRuleBody(block, '.npfs-scroll > .npfs-info > *')).toMatch(/max-width:\s*none/);
    });

    it('centres that column on the cover whatever it holds — no count of rows', () => {
        // Six rows between two empty ones: a seventh part fell below the bottom one, and
        // the column rose off-centre (measured in Chromium, review 2026-10-04).
        const block = wideBlock();
        expect(cssRuleBody(block, '.npfs-scroll')).toMatch(/grid-template-rows:\s*1fr;/);
        expect(block).not.toMatch(/repeat\(/);
        expect(block).not.toMatch(/::before|::after/);
    });

    it('leaves a phone held upright as it was: the block is no box', () => {
        const sheet = readStylesheet('css', 'components', 'now-playing-fullscreen.css');
        expect(cssRuleBody(sheet, '.npfs-info')).toMatch(/display:\s*contents/);
    });

    it('holds every part beside the cover in that block, and not the cover', () => {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        for (const [name, value] of Object.entries({
            _open: true, _state: { source_id: 'src_mpd', title: 'So What', artist: 'Miles Davis',
                playing: true, elapsed: 120, duration: 545, can_seek: true },
            _rendererActive: false, _nextTrack: { title: 'Freddie Freeloader', artist: 'Miles Davis' },
            _sources: [],
        })) {
            Object.defineProperty(el, name, { value, writable: true, configurable: true });
        }
        const host = document.createElement('div');
        litRender(el.render(), host);
        const scroll = host.querySelector('.npfs-scroll');
        const info = scroll.querySelector(':scope > .npfs-info');
        expect([...scroll.children].map((c) => c.className.split(' ')[0])).toEqual(
            ['npfs-cover-wrap', 'npfs-info']);
        for (const part of ['.npfs-meta', 'ag-format-strip', '.npfs-controls-row', 'ag-progress-bar']) {
            expect(info.querySelector(`:scope > ${part}`), part).not.toBeNull();
        }
    });
});

// ---------------------------------------------------------------------------
// A station plays live: the progress bar gives way to a "Live" marker
// ---------------------------------------------------------------------------

describe('AgNowPlayingFullscreen — a live station has no progress to show', () => {
    /** Render the progress block of a state and return its bar. */
    function progressBar(state) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        const host = document.createElement('div');
        litRender(el._renderProgress(state), host);
        return host.querySelector('ag-progress-bar');
    }

    it('turns the bar into a Live marker for a radio station', () => {
        // The bar showed its knob stuck at the start, the time listened on one side
        // and "−0:00" on the other.
        const bar = progressBar({ origin: 'radio', duration: 0, title: 'Ma Benz', playing: true });
        expect(bar.hasAttribute('live')).toBe(true);
    });

    it('keeps the bar for a track', () => {
        const bar = progressBar({ origin: 'qobuz', duration: 545, title: 'So What', playing: true });
        expect(bar.hasAttribute('live')).toBe(false);
    });

    /** Render the whole player for a state and return its transport controls. */
    function controls(state) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        for (const [name, value] of Object.entries({
            _open: true, _state: { source_id: 'src_mpd', playing: true, ...state },
            _rendererActive: false, _nextTrack: null, _sources: [],
        })) {
            Object.defineProperty(el, name, { value, writable: true, configurable: true });
        }
        const host = document.createElement('div');
        litRender(el.render(), host);
        return host.querySelector('ag-playback-controls');
    }

    it('tells the transport controls a station plays live', () => {
        // They offered Repeat and Shuffle there, and a Next that stopped playback.
        expect(controls({ origin: 'radio', duration: 0, title: 'FIP' }).live).toBe(true);
    });

    it('leaves the transport controls as they were for a track', () => {
        expect(controls({ origin: 'qobuz', duration: 545, title: 'So What' }).live).toBe(false);
    });

    it('does not tell them a stopped station is live', () => {
        // Stopped, the core reads both skips impossible whatever the queue holds (MPD
        // refuses them): a station with tracks behind it would have looked alone, its
        // Repeat and Shuffle greyed although they act on those tracks.
        const stopped = { origin: 'radio', duration: 0, title: 'FIP', playback_status: 'Stopped' };
        expect(controls(stopped).live).toBe(false);
        expect(controls({ ...stopped, playback_status: 'Paused' }).live).toBe(true);
    });
});

describe('AgNowPlayingFullscreen — a play/pause tap sends the intent (real _control)', () => {
    function fs(state) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        Object.defineProperty(el, '_state', { value: state, writable: true, configurable: true });
        el._targetSourceId = 'src_mpd';
        el._volumePending = undefined;
        el._seekPending = null;
        el._controlRecentTime = null;
        el.requestUpdate = () => {};
        return el;
    }

    beforeEach(() => { apiPost.mockReset(); apiPost.mockResolvedValue({}); });

    it.each([
        [true, 'pause'],
        [false, 'play'],
    ])('the screen showing playing=%s sends %s, then flips', async (playing, sent) => {
        const el = fs({ source_id: 'src_mpd', control_id: 'src_mpd', playing, title: 'A' });
        await el._control('toggle');
        expect(apiPost).toHaveBeenCalledWith('/player/control',
            expect.objectContaining({ action: sent, source_id: 'src_mpd' }));
        expect(el._state.playing).toBe(!playing);
    });

    it('sends play when nothing is shown at all', async () => {
        const el = fs(null);
        await el._control('toggle');
        expect(apiPost).toHaveBeenCalledWith('/player/control', expect.objectContaining({ action: 'play' }));
    });

    it('still undoes the flip when the core refuses', async () => {
        const el = fs({ source_id: 'src_mpd', control_id: 'src_mpd', playing: false, title: 'A' });
        apiPost.mockRejectedValueOnce(Object.assign(new Error('refused'), { status: 503 }));
        await el._control('toggle');
        expect(el._state.playing).toBe(false);
    });
});

describe('AgNowPlayingFullscreen — opened from the bar, it keeps the core\'s word on a broadcast', () => {
    // Opened on a webradio another app started (origin 'upnp', live from the core),
    // the screen drew a bar at "−0:00" with Repeat and Shuffle offered until the first
    // live state arrived: the state it starts from had no `live`, and isLiveStream fell
    // back on origin 'radio'.
    function seeded(item) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        Object.defineProperty(el, '_state', { value: null, writable: true, configurable: true });
        el._seedStateFromItem({ source_id: 'src_mpd', playback_status: 'Playing', title: 'Swiss Jazz', ...item });
        return el._state;
    }

    it.each([[true], [false]])('carries live=%s from the item', (live) => {
        expect(seeded({ origin: 'upnp', live }).live).toBe(live);
    });

    it('leaves it unknown when the item says nothing', () => {
        expect(seeded({ origin: 'radio' }).live).toBeNull();
    });
});

describe('AgNowPlayingFullscreen — on each edition', () => {
    const STARTER = { status: 'starter', pro: false };
    const PRO = { status: 'lifetime', pro: true };
    const LIBRARY = { source_id: 'src_mpd', control_id: 'src_mpd', pro: false, title: 'A', volume: 20 };
    const HQPLAYER = { source_id: 'src_hqplayer', control_id: 'src_hqplayer', pro: true, title: 'B' };

    function fs(state, license) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        Object.defineProperty(el, '_state', { value: state, writable: true, configurable: true });
        Object.assign(el, {
            _license: license, _targetSourceId: null, _volumePending: undefined,
            _seekPending: null, _controlRecentTime: null,
        });
        el.requestUpdate = () => {};
        return el;
    }

    beforeEach(() => { apiPost.mockReset(); apiPost.mockResolvedValue({}); });

    it('opens on a Starter box: the player is no Pro feature', () => {
        const el = fs(LIBRARY, STARTER);
        el._connectSse = vi.fn();
        Object.defineProperty(el, 'updateComplete', { value: Promise.resolve(), configurable: true });
        el.querySelector = () => null;
        el._openPlayer('src_mpd');
        expect(el._open).toBe(true);
        expect(el._connectSse).toHaveBeenCalled();
        document.body.classList.remove('npfs-open');
    });

    it('plays the box\'s music on a Starter box', async () => {
        await fs({ ...LIBRARY }, STARTER)._control('next');
        expect(apiPost).toHaveBeenCalledWith('/player/control', expect.objectContaining({ action: 'next' }));
    });

    it('leads to the licence panel for HQPlayer on a Starter box, and sends nothing', async () => {
        const selectTab = vi.fn();
        const original = document.querySelector;
        document.querySelector = (sel) => (sel === 'ag-tabs' ? { selectTab } : null);
        try {
            await fs({ ...HQPLAYER }, STARTER)._control('next');
            expect(apiPost).not.toHaveBeenCalled();
            expect(selectTab).toHaveBeenCalledWith('admin', { keepOpen: false });
        } finally {
            document.querySelector = original;
        }
    });

    it('controls HQPlayer with Pro', async () => {
        await fs({ ...HQPLAYER }, PRO)._control('next');
        expect(apiPost).toHaveBeenCalledOnce();
    });

    it('does not ask a Roon zone\'s queue of a Starter box', async () => {
        const { apiGet } = await import('../../api.js');
        apiGet.mockClear();
        const roon = { source_id: 'src_mono-sgen', control_id: 'src_mono-sgen', zone_id: 'z', pro: true };
        await fs(roon, STARTER)._fetchNextTrack(roon);
        expect(apiGet).not.toHaveBeenCalled();
        await fs(roon, PRO)._fetchNextTrack(roon);
        expect(apiGet).toHaveBeenCalledOnce();
    });
});

describe('AgNowPlayingFullscreen — "Add to playlist" on a Starter box', () => {
    it('carries the padlock and leads to the licence panel, not to the picker', () => {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        Object.defineProperty(el, '_rendererActive', { value: false });
        el._license = { status: 'starter', pro: false };
        const host = document.createElement('div');
        litRender(el._renderMeta({
            title: 'Tukuman', content_source_id: 'src_highresaudio', content_item_id: 't1_a1',
        }), host);
        const btn = host.querySelector('ag-library-playlist-btn');
        expect(btn.classList.contains('pro-locked')).toBe(true);

        let asked = null;
        const listen = (e) => { asked = e.detail; };
        const selectTab = vi.fn();
        const original = document.querySelector;
        document.querySelector = (sel) => (sel === 'ag-tabs' ? { selectTab } : null);
        window.addEventListener(PLAYLIST_ADD_EVENT, listen);
        try {
            btn.dispatchEvent(new CustomEvent('playlist-add'));
            expect(asked).toBeNull();
            expect(selectTab).toHaveBeenCalledWith('admin', { keepOpen: false });
        } finally {
            document.querySelector = original;
            window.removeEventListener(PLAYLIST_ADD_EVENT, listen);
        }
    });
});

describe('AgNowPlayingFullscreen — a Play the core refuses for want of Pro', () => {
    // A queue of streaming tracks alone, or the box's own HQPlayer holding the DAC, on a box
    // without Pro: the core refuses the Play (403) before sending anything, with what to do.
    // The screen says it, as it says the output's own failures; a device that declined
    // (503) stays silent, as decided.
    const WORDS = 'Only streaming tracks are left in the queue, and streaming services are part '
        + 'of the Pro edition. Add music from the box or a station, or activate a license.';
    const DAC_HELD = 'HQPlayer Embedded runs on this box and holds its DAC, and HQPlayer is part '
        + 'of the Pro edition. Stop HQPlayer Embedded from Services to play here, or activate a license.';
    const STOPPED = { source_id: 'src_mpd', control_id: 'src_mpd', playing: false,
        playback_status: 'Stopped', title: 'So What' };

    function fs(state) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        Object.defineProperty(el, '_state', { value: state, writable: true, configurable: true });
        Object.assign(el, { _targetSourceId: 'src_mpd', _volumePending: undefined,
            _seekPending: null, _controlRecentTime: null });
        el.requestUpdate = () => {};
        return el;
    }

    /** The toasts shown, as ui-helpers puts them in the page. */
    const toasts = () => [...document.querySelectorAll('#toastContainer ag-toast-notification')];

    beforeEach(() => {
        apiPost.mockReset();
        document.body.append(Object.assign(document.createElement('div'), { id: 'toastContainer' }));
    });

    afterEach(() => {
        document.getElementById('toastContainer')?.remove();
    });

    it.each([
        ['a queue of streaming tracks alone', WORDS],
        ["the box's own HQPlayer holding the DAC", DAC_HELD],
    ])('shows its words for %s, and the button returns to Play', async (_, words) => {
        apiPost.mockRejectedValueOnce(Object.assign(new Error(words), { status: 403, detail: words }));
        const el = fs({ ...STOPPED });
        await el._control('toggle');
        expect(apiPost).toHaveBeenCalledWith('/player/control', expect.objectContaining({ action: 'play' }));
        expect(el._state.playing).toBe(false);
        expect(toasts().map((t) => [t.type, t.title, t.message]))
            .toEqual([['error', 'Playback blocked', words]]);
    });

    it('says nothing of a refusal met by another control than Play', async () => {
        // A volume drag posts one command per movement: one toast each, stacked (review,
        // 2026-10-16). The licence is read again all the same (api.js), padlocks follow.
        apiPost.mockRejectedValueOnce(Object.assign(new Error(WORDS), { status: 403, detail: WORDS }));
        const el = fs({ ...STOPPED, volume: 20 });
        await el._control('set_volume', 30);
        expect(toasts()).toEqual([]);
    });

    it('keeps a device that declined silent', async () => {
        apiPost.mockRejectedValueOnce(Object.assign(new Error('declined'),
            { status: 503, detail: 'The device refused the command or no source could take it' }));
        const el = fs({ ...STOPPED });
        await el._control('toggle');
        expect(el._state.playing).toBe(false);
        expect(toasts()).toEqual([]);
    });
});

describe('AgNowPlayingFullscreen — a next track the box will skip', () => {
    // On a box without Pro the relays refuse a streaming service's track, and the player
    // skips it: "Next" says so as the queue view does, from the core's `pro` on the item.
    const STARTER = { status: 'starter', pro: false };
    const PRO = { status: 'lifetime', pro: true };
    const QOBUZ = { title: 'So What', artist: 'Miles Davis', origin: 'qobuz', pro: true };

    /** Render "Next" for a track and a licence; return the line. */
    function upNext(next, license) {
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        Object.defineProperty(el, '_nextTrack', { value: next, writable: true, configurable: true });
        el._license = license;
        const host = document.createElement('div');
        litRender(el._renderUpNext(), host);
        return host.querySelector('.npfs-up-next');
    }

    it('wears the Pro tint and the padlock, a real button, on a box without Pro', () => {
        const line = upNext(QOBUZ, STARTER);
        expect(line.classList.contains('npfs-up-next--locked')).toBe(true);
        expect(line.querySelector('button.plain-btn.pro-lock-btn > ag-pro-lock')).not.toBeNull();
    });

    it.each([
        ['with Pro', QOBUZ, PRO],
        ['while the licence is not read yet', QOBUZ, null],
        ['for what a Starter box plays', { title: 'A', origin: 'library', pro: false }, STARTER],
        // A core older than the mark sends a speaker's next track without it.
        ['from a core that does not mark it', { title: 'A', artist: 'B' }, STARTER],
    ])('is a track like any other %s', (_, next, license) => {
        const line = upNext(next, license);
        expect(line.classList.contains('npfs-up-next--locked')).toBe(false);
        expect(line.querySelector('ag-pro-lock')).toBeNull();
    });

    it("marks a network speaker's next track as the core marks it", () => {
        // The speaker's queue is the box's own, and its next track travels on the state
        // (queue_next), with the core's `pro` — through the real _applyState.
        const el = Object.create(AgNowPlayingFullscreen.prototype);
        for (const [name, value] of Object.entries({ _state: null, _nextTrack: null, _sources: [],
            _open: true, _coverSwapped: false, _coverErrorToken: null })) {
            Object.defineProperty(el, name, { value, writable: true, configurable: true });
        }
        Object.assign(el, { _license: STARTER, _userSourceOverride: false,
            _targetSourceId: 'src_qobuz', _seekPending: null, _volumePending: undefined,
            _controlRecentTime: null, _setPrimaryCover: () => {} });
        el._applyState({ source_id: 'src_qobuz', control_id: 'upnp_renderer', played_on: 'uuid:speaker',
            title: 'So What', playing: true,
            queue_next: { title: 'Freddie Freeloader', artist: 'Miles Davis', pro: true } });
        const host = document.createElement('div');
        litRender(el._renderUpNext(), host);
        expect(host.querySelector('.npfs-up-next--locked > button.pro-lock-btn > ag-pro-lock')).not.toBeNull();
    });

    it('leads its padlock to the licence panel', () => {
        const selectTab = vi.fn();
        const original = document.querySelector;
        document.querySelector = (sel) => (sel === 'ag-tabs' ? { selectTab } : null);
        try {
            upNext(QOBUZ, STARTER).querySelector('button').click();
            expect(selectTab).toHaveBeenCalledWith('admin', { keepOpen: false });
        } finally {
            document.querySelector = original;
        }
    });

});

describe('AgNowPlayingFullscreen — follows the box\'s licence', () => {
    // Built for real, so its own LicenseController is what is tested.
    it('starts from the licence already read, and takes each new reading', async () => {
        const { setLicense } = await import('../../license-tiers.js');
        setLicense({ status: 'lifetime', pro: true });
        try {
            const el = document.createElement('ag-now-playing-fullscreen');
            expect(el._license).toEqual({ status: 'lifetime', pro: true });
            el._licenseCtl.handleEvent({ detail: { status: 'starter', pro: false } });
            expect(el._license).toEqual({ status: 'starter', pro: false });
        } finally {
            setLicense(null);
        }
    });
});

/**
 * A touch on the panel writes its inline style (the swipe handlers: `animation: none`, a
 * transition, a transform), and so does the tint the cover gives the background. Tapping
 * a station's inset cover changes the tint: bound as the whole attribute, it wiped what
 * the touch had written, and the entry slide-in played again — the panel left the screen
 * and came back (measured in Chromium, touch emulated, 2026-10-27). The slide-in also
 * stayed on the panel once played, its fill above any inline transform, and a drag the
 * system cancelled left the panel where the finger had taken it (code review, same day).
 * Built for real: the touches go through the listeners _openPlayer attaches. The inset
 * cover is drawn only with a core to address (coverUrl): its click handler is run instead.
 */
describe('AgNowPlayingFullscreen — the panel stays in place once open', () => {
    const TRACK = 'mbs:Wyatt:Youtube (2014)';
    const STATION = 'url:http://station.example/logo.png';
    const RADIO = {
        source_id: 'src_mpd', control_id: 'src_mpd', origin: 'radio', live: true,
        title: 'Youtube (2014)', artist: 'Wyatt', cover_token: TRACK, station_logo_token: STATION,
        playing: true, playback_status: 'Playing', played_on: 'local',
        sources: [{ source_id: 'src_mpd', playing: true }],
    };
    let el;

    /** A touch event at height `y`, shaped as the panel's listeners read it. */
    function touch(target, type, y) {
        const list = type === 'touchend' || type === 'touchcancel' ? 'changedTouches' : 'touches';
        target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }),
            { [list]: [{ clientX: 40, clientY: y }] }));
    }

    /** A finger put down on `target` and lifted where it was, as a tap sends it. */
    const tap = (target) => { touch(target, 'touchstart', 40); touch(target, 'touchend', 40); };

    /** An animation's end, bubbling from `target`. */
    const animationEnd = (target, animationName) => target.dispatchEvent(
        Object.assign(new Event('animationend', { bubbles: true }), { animationName }));

    /** The panel's inline properties the swipe handlers write. */
    const touchStyle = (panel) => ['animation', 'transition', 'transform']
        .map((name) => panel.style.getPropertyValue(name));

    beforeEach(async () => {
        el = document.createElement('ag-now-playing-fullscreen');
        el._connectSse = () => {};      // no live state here: the states are applied by hand
        // The tints the covers would give (jsdom draws no canvas).
        el._tintByToken.set(TRACK, 'rgb(200 20 10)');
        el._tintByToken.set(STATION, 'rgb(10 40 200)');
        document.body.append(el);
        el._openPlayer('src_mpd');
        el._applyState({ ...RADIO });
        await el.updateComplete;
    });

    afterEach(() => {
        el.remove();
        document.body.classList.remove('npfs-open');
    });

    it('does not play the entry slide-in again when the inset cover swaps the covers', async () => {
        const panel = el.querySelector('.npfs-panel');
        tap(el.querySelector('.npfs-cover'));
        const written = touchStyle(panel);
        expect(written[0]).toBe('none');
        el._toggleCoverSwap();          // what the inset cover's click runs
        await el.updateComplete;
        expect(el._coverSwapped).toBe(true);
        expect(el.querySelector('.npfs-panel')).toBe(panel);
        expect(panel.style.getPropertyValue('--npfs-bg')).toBe('rgb(10 40 200)');
        expect(touchStyle(panel)).toEqual(written);
    });

    it('does not either when a new track brings another cover after a touch', async () => {
        const panel = el.querySelector('.npfs-panel');
        tap(el.querySelector('.npfs-title'));
        const written = touchStyle(panel);
        el._tintByToken.set('mbs:Other:Song', 'rgb(10 200 40)');
        el._applyState({ ...RADIO, title: 'Song', artist: 'Other', cover_token: 'mbs:Other:Song' });
        await el.updateComplete;
        expect(panel.style.getPropertyValue('--npfs-bg')).toBe('rgb(10 200 40)');
        expect(touchStyle(panel)).toEqual(written);
    });

    it('still tints the panel from its cover, and drops the tint for another source', async () => {
        const panel = el.querySelector('.npfs-panel');
        expect(panel.style.getPropertyValue('--npfs-bg')).toBe('rgb(200 20 10)');
        el._switchSource('src_airplay');
        await el.updateComplete;
        expect(panel.style.getPropertyValue('--npfs-bg')).toBe('');
    });

    it('drops the entry slide-in once played, and a new render does not bring it back', async () => {
        const panel = el.querySelector('.npfs-panel');
        expect(panel.classList.contains('npfs-panel--enter')).toBe(true);
        animationEnd(panel, 'npfsSlideIn');
        expect(panel.classList.contains('npfs-panel--enter')).toBe(false);
        el._applyState({ ...RADIO, title: 'Song', artist: 'Other' });
        await el.updateComplete;
        expect(el.querySelector('.npfs-panel')).toBe(panel);
        expect(panel.classList.contains('npfs-panel--enter')).toBe(false);
    });

    it("keeps it at another animation's end: one inside the panel, or another name", () => {
        const panel = el.querySelector('.npfs-panel');
        animationEnd(el.querySelector('.npfs-header'), 'npfsSlideIn');
        animationEnd(panel, 'pulse');
        expect(panel.classList.contains('npfs-panel--enter')).toBe(true);
    });

    it('puts the panel back when the system cancels a drag, and closes nothing', () => {
        const panel = el.querySelector('.npfs-panel');
        touch(panel, 'touchstart', 300);
        touch(panel, 'touchmove', 520);   // 220 px down: released here, it would close
        expect(panel.style.transform).toContain('translateY(220px)');
        touch(panel, 'touchcancel', 520);
        expect(panel.style.transform).toBe('translateX(0) translateY(0) scale(1)');
        expect(panel.style.opacity).toBe('');
        expect(panel.style.borderRadius).toBe('');
        expect(el._open).toBe(true);
    });
});

/**
 * The volume slider or the DSD padlock: decided by the shared helpers of player-utils,
 * which read whether the core says the volume acts on DSD (`volume_on_dsd`) — on a box
 * where MPD turns DSD into PCM before its volume, the slider stays. The mini player
 * asks them the same question; their own tests are in player-utils.test.js.
 */
describe('the slider or the DSD padlock comes from the shared helpers', () => {
    const SOURCE = readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-now-playing-fullscreen.js'),
        'utf8',
    );

    it('shows them as showsVolumeControl and showsDsdLock say', () => {
        expect(SOURCE).toMatch(/\$\{showsVolumeControl\(s, s\?\.format\) \? html`\s*<div class="npfs-controls-vol">/);
        expect(SOURCE).toMatch(/\$\{showsDsdLock\(s, s\?\.format\) \? html`<ag-dsd-lock class="npfs-dsd-lock">/);
    });

    it('decides nothing of its own about DSD and the volume', () => {
        expect(SOURCE).not.toMatch(/isSelfManagedDriver|isDsd\(/);
    });
});
