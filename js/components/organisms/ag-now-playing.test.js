/**
 * Unit tests for ag-now-playing.js — auto-follow source logic.
 *
 * Tests the _onState auto-follow state machine in isolation, without
 * instantiating the full LitElement component (auth/DOM side-effects in jsdom).
 *
 * Covers:
 * - Default: _activeSourceIdx tracks the backend-active source automatically
 * - User override: manual swipe/navigation suspends auto-follow
 * - Override lifted: when user's chosen source stops playing, auto-follow resumes
 * - Index clamping: _activeSourceIdx is clamped when items shrink
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Simulate the _onState auto-follow logic from ag-now-playing.js
// ---------------------------------------------------------------------------

/**
 * Replicate the exact auto-follow block from AgNowPlaying._onState so tests
 * stay decoupled from the component's DOM/Lit rendering lifecycle.
 *
 * @param {object} state - Simulated component state (mutated in-place).
 * @param {Array}  items - New list of playing sources (already filtered).
 */
function applyOnState(state, items) {
    const prevShownId = state.items[state.activeIdx]?.source_id;

    state.items = items;

    if (state.activeIdx >= items.length) state.activeIdx = 0;

    if (state.userOverride) {
        if (!prevShownId || !items.find(s => s.source_id === prevShownId)) {
            state.userOverride = false;
        }
    }

    if (!state.userOverride) {
        const activeIdx = items.findIndex(s => s.active);
        if (activeIdx !== -1 && activeIdx !== state.activeIdx) {
            state.activeIdx = activeIdx;
        }
    }
}

/** Build a minimal playing SourceInfo. */
const src = (id, active = false) => ({ source_id: id, active, playing: true });

// ---------------------------------------------------------------------------

describe('AgNowPlaying — auto-follow (_onState)', () => {
    let s;

    beforeEach(() => {
        s = { items: [], activeIdx: 0, userOverride: false };
    });

    // --- default auto-follow ---

    it('follows the active source on first state', () => {
        applyOnState(s, [src('src_mpd', false), src('src_roon', true)]);
        expect(s.activeIdx).toBe(1);
    });

    it('auto-switches when the active source changes', () => {
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        expect(s.activeIdx).toBe(0);
        applyOnState(s, [src('src_mpd', false), src('src_roon', true)]);
        expect(s.activeIdx).toBe(1);
    });

    it('stays on active source when it remains active across ticks', () => {
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        expect(s.activeIdx).toBe(0);
    });

    it('clamps index to 0 when item count shrinks (no override)', () => {
        s.activeIdx = 2;
        applyOnState(s, [src('src_mpd', true)]);
        expect(s.activeIdx).toBe(0);
    });

    it('shows first item when no source is flagged active', () => {
        applyOnState(s, [src('src_mpd', false), src('src_roon', false)]);
        expect(s.activeIdx).toBe(0);
    });

    // --- user override ---

    it('respects override — does not auto-switch after manual navigation', () => {
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        // User swipes to Roon
        s.activeIdx = 1;
        s.userOverride = true;
        // Backend still reports MPD as active
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        expect(s.activeIdx).toBe(1);  // stays on user's choice
        expect(s.userOverride).toBe(true);
    });

    it('override is not lifted while user-chosen source is still playing', () => {
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        s.activeIdx = 1;
        s.userOverride = true;
        // Both sources still playing
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        expect(s.userOverride).toBe(true);
    });

    // --- override lifted ---

    it('lifts override and auto-follows when user-chosen source stops playing', () => {
        // Set up: user watching Roon (index 1)
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        s.activeIdx = 1;
        s.userOverride = true;
        // Roon disappears from playing sources
        applyOnState(s, [src('src_mpd', true)]);
        expect(s.userOverride).toBe(false);
        expect(s.activeIdx).toBe(0);  // auto-followed MPD
    });

    it('lifts override and follows new active source after chosen source stops', () => {
        applyOnState(s, [src('src_mpd', false), src('src_roon', true), src('src_shairport-sync', false)]);
        s.activeIdx = 1; // user on Roon
        s.userOverride = true;
        // Roon stops; Spotify becomes active
        applyOnState(s, [src('src_mpd', false), src('src_shairport-sync', true)]);
        expect(s.userOverride).toBe(false);
        expect(s.activeIdx).toBe(1); // src_shairport-sync is now index 1
    });

    it('clamping also lifts override when items shrink below user index', () => {
        s.items = [src('src_mpd'), src('src_roon')];
        s.activeIdx = 1; // user on Roon
        s.userOverride = true;
        // Roon stops (index 1 gone → clamp to 0 then override lifted)
        applyOnState(s, [src('src_mpd', true)]);
        expect(s.userOverride).toBe(false);
        expect(s.activeIdx).toBe(0);
    });

    // --- regression: prevShownId must be read from OLD items before update ---
    // The production bug read prevShownId AFTER this._items = items, which caused
    // the clamped index to identify the wrong source and keep the override alive.

    it('prevShownId uses old items — override is lifted when chosen source disappears even after clamp', () => {
        // User is watching index 1 (Roon). Roon stops. New list = [MPD].
        // With the old buggy read: prevShownId would be items[0] = MPD (after clamp)
        // → find(MPD) succeeds → override NOT lifted. This test guards against that.
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        s.activeIdx = 1; // user on Roon
        s.userOverride = true;
        applyOnState(s, [src('src_mpd', true)]); // Roon gone, clamp fires
        expect(s.userOverride).toBe(false);      // override must be lifted
        expect(s.activeIdx).toBe(0);             // auto-followed MPD
    });

    it('dot-click sets userOverride — next auto-follow tick respects it', () => {
        // Simulates: user clicks a dot (sets userOverride=true + changes activeIdx)
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        // User clicks dot for Roon (index 1)
        s.activeIdx = 1;
        s.userOverride = true;
        // Backend still reports MPD as active → must NOT switch back
        applyOnState(s, [src('src_mpd', true), src('src_roon', false)]);
        expect(s.activeIdx).toBe(1);
        expect(s.userOverride).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// AgNowPlaying — _rendererActive predicate + connector badge visibility
// ---------------------------------------------------------------------------

/**
 * Simulate the _rendererOut getter — the active network-renderer output entry
 * from PlayerState.outputs[] (renderer_status SSE no longer feeds the player).
 * @param {Array|null} outputs
 * @returns {object|null}
 */
function rendererOut(outputs) {
    return (outputs ?? []).find(o => o.type === 'upnp_renderer' && o.active) ?? null;
}

/**
 * Simulate the _rendererActive getter.
 * @param {Array|null} outputs
 * @returns {boolean}
 */
function rendererActive(outputs) {
    return !!rendererOut(outputs);
}

/**
 * Simulate the connector badge visibility condition.
 * Badge is visible when there is a connector AND no active renderer — an
 * active renderer is always native (its own DAC stack), so the local
 * physical connector is out of the audio chain whenever a renderer is active.
 * @param {string|null} outputConnector
 * @param {Array|null} outputs
 * @returns {boolean}
 */
function connectorVisible(outputConnector, outputs) {
    return !!(outputConnector && !rendererActive(outputs));
}

const LOCAL_OUT    = { id: 'local', type: 'local', name: 'Heed Abacus', active: true, transport_state: 'PLAYING' };
const RENDERER_OUT = { id: 'uuid:m', type: 'upnp_renderer', name: 'Marantz', active: true, transport_state: 'PLAYING' };

describe('AgNowPlaying — _rendererActive + connector badge (outputs[]-based)', () => {
    it('rendererActive: true when an active renderer output is present', () => {
        expect(rendererActive([{ ...LOCAL_OUT, active: false }, RENDERER_OUT])).toBe(true);
    });

    it('rendererActive: false when the renderer entry is inactive (unreachable)', () => {
        expect(rendererActive([LOCAL_OUT, { ...RENDERER_OUT, active: false, transport_state: null }])).toBe(false);
    });

    it('rendererActive: false with local-only outputs', () => {
        expect(rendererActive([LOCAL_OUT])).toBe(false);
    });

    it('rendererActive: false when no outputs yet', () => {
        expect(rendererActive([])).toBe(false);
        expect(rendererActive(null)).toBe(false);
        expect(rendererActive(undefined)).toBe(false);
    });

    it('renderer badge name comes from the outputs entry', () => {
        expect(rendererOut([RENDERER_OUT]).name).toBe('Marantz');
    });

    it('connector badge hidden when a renderer is active (renderer = own DAC stack)', () => {
        expect(connectorVisible('usb', [{ ...LOCAL_OUT, active: false }, RENDERER_OUT])).toBe(false);
    });

    it('connector badge visible when no renderer', () => {
        expect(connectorVisible('usb', [LOCAL_OUT])).toBe(true);
    });

    it('connector badge hidden when output_connector absent (no renderer)', () => {
        expect(connectorVisible(null, null)).toBe(false);
    });

    it('connector badge hidden when output_connector absent (renderer active)', () => {
        expect(connectorVisible(null, [RENDERER_OUT])).toBe(false);
    });

    it('connector badge visible with TOSLINK when renderer entry inactive', () => {
        expect(connectorVisible('toslink', [LOCAL_OUT, { ...RENDERER_OUT, active: false }])).toBe(true);
    });
});


// ---------------------------------------------------------------------------
// AgNowPlaying — control payload carries the routing handle (spec §3)
// ---------------------------------------------------------------------------

/**
 * Replicate the _sendControl body construction (routing part only).
 * @param {string} sourceId
 * @param {string} action
 * @param {number|null} volume
 * @param {object|null} item
 * @returns {object} POST body
 */
function buildControlBody(sourceId, action, volume = null, item = null) {
    const body = { source_id: sourceId, action };
    if (item?.control_id) body.control_id = item.control_id;
    if (action === 'seek' && volume !== null) {
        body.seek_position = volume;
    } else if (volume !== null) {
        body.volume = volume;
    }
    if (item?.zone_id) body.zone_id = item.zone_id;
    if (item?.output_id) body.output_id = item.output_id;
    return body;
}

describe('AgNowPlaying — control body routing handle', () => {
    it('sends control_id from the item alongside source_id', () => {
        const item = { source_id: 'upnp_renderer', control_id: 'upnp_renderer' };
        const body = buildControlBody('upnp_renderer', 'toggle', null, item);
        expect(body.control_id).toBe('upnp_renderer');
        expect(body.source_id).toBe('upnp_renderer');
    });

    it('omits control_id when the item has none (legacy fallback)', () => {
        const body = buildControlBody('src_mpd', 'toggle', null, { source_id: 'src_mpd' });
        expect(body.control_id).toBeUndefined();
        expect(body.source_id).toBe('src_mpd');
    });

    it('seek still maps to seek_position with the handle present', () => {
        const item = { source_id: 'src_mpd', control_id: 'src_mpd' };
        const body = buildControlBody('src_mpd', 'seek', 42, item);
        expect(body.seek_position).toBe(42);
        expect(body.volume).toBeUndefined();
        expect(body.control_id).toBe('src_mpd');
    });
});
