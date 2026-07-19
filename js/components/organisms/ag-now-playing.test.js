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
        applyOnState(s, [src('src_mpd', false), src('src_roon', true), src('src_librespot', false)]);
        s.activeIdx = 1; // user on Roon
        s.userOverride = true;
        // Roon stops; Spotify becomes active
        applyOnState(s, [src('src_mpd', false), src('src_librespot', true)]);
        expect(s.userOverride).toBe(false);
        expect(s.activeIdx).toBe(1); // src_librespot is now index 1
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
 * Simulate the _rendererActive getter.
 * @param {object|null} rendererStatus
 * @returns {boolean}
 */
function rendererActive(rendererStatus) {
    return !!(rendererStatus?.connected && !rendererStatus?.bypassed);
}

/**
 * Simulate the connector badge visibility condition.
 * Badge is visible when there is a connector AND either no active renderer OR
 * an active renderer is always native (its own DAC stack), so the local
 * physical connector is out of the audio chain whenever a renderer is active.
 * @param {string|null} outputConnector
 * @param {object|null} rendererStatus
 * @returns {boolean}
 */
function connectorVisible(outputConnector, rendererStatus) {
    const active = rendererActive(rendererStatus);
    return !!(outputConnector && !active);
}

describe('AgNowPlaying — _rendererActive + connector badge', () => {
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
        expect(rendererActive(undefined)).toBe(false);
    });

    it('connector badge hidden when a renderer is active (renderer = own DAC stack)', () => {
        expect(connectorVisible('usb', { connected: true, bypassed: false })).toBe(false);
    });

    it('connector badge visible when renderer bypassed', () => {
        expect(connectorVisible('usb', { connected: true, bypassed: true })).toBe(true);
    });

    it('connector badge visible when no renderer', () => {
        expect(connectorVisible('usb', null)).toBe(true);
    });

    it('connector badge hidden when output_connector absent (no renderer)', () => {
        expect(connectorVisible(null, null)).toBe(false);
    });

    it('connector badge hidden when output_connector absent (renderer active)', () => {
        expect(connectorVisible(null, { connected: true, bypassed: false })).toBe(false);
    });

    it('connector badge visible with TOSLINK when bypassed', () => {
        expect(connectorVisible('toslink', { connected: true, bypassed: true })).toBe(true);
    });

    it('connector badge visible with TOSLINK when renderer disconnected', () => {
        expect(connectorVisible('toslink', { connected: false, bypassed: false })).toBe(true);
    });
});
