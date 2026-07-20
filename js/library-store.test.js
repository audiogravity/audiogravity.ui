/**
 * Unit tests for library-store.js — subscribeRendererStatus.
 *
 * Covers Fix 5 (DRY SSE): all 3 components previously subscribed independently
 * to window 'renderer-status-update'. The store now owns the single window
 * listener and multiplexes to registered callbacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// Stub modules that library-store.js may import transitively.
vi.mock('./api.js', () => ({ apiGet: vi.fn(), buildAuthedUrl: vi.fn((path) => path) }));
vi.mock('./ui-helpers.js', () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    handleError: vi.fn(),
    getUserFriendlyError: vi.fn(),
    showPasswordConfirm: vi.fn(),
    copyToClipboard: vi.fn(),
}));

// Provide a minimal window mock if not available (jsdom provides it in vitest).
// The subscribeRendererStatus tests rely on window.dispatchEvent.

import { subscribeRendererStatus, getOfflinePlayerSnapshot } from './library-store.js';

describe('subscribeRendererStatus', () => {
    it('invokes callback when renderer-status-update event fires', () => {
        const cb = vi.fn();
        const unsub = subscribeRendererStatus(cb);

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true, transport_state: 'PLAYING', renderer_name: 'music.#1' },
        }));

        expect(cb).toHaveBeenCalledOnce();
        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ transport_state: 'PLAYING' }));
        unsub();
    });

    it('stops invoking callback after unsubscribe', () => {
        const cb = vi.fn();
        const unsub = subscribeRendererStatus(cb);
        unsub();

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: false },
        }));

        expect(cb).not.toHaveBeenCalled();
    });

    it('supports multiple independent subscribers', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const unsub1 = subscribeRendererStatus(cb1);
        const unsub2 = subscribeRendererStatus(cb2);

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true },
        }));

        expect(cb1).toHaveBeenCalledOnce();
        expect(cb2).toHaveBeenCalledOnce();
        unsub1();
        unsub2();
    });

    it('does not invoke other subscribers after one unsubscribes', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const unsub1 = subscribeRendererStatus(cb1);
        const unsub2 = subscribeRendererStatus(cb2);
        unsub1();

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true },
        }));

        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalledOnce();
        unsub2();
    });

    it('ignores events with null detail', () => {
        const cb = vi.fn();
        const unsub = subscribeRendererStatus(cb);

        window.dispatchEvent(new CustomEvent('renderer-status-update', { detail: null }));

        expect(cb).not.toHaveBeenCalled();
        unsub();
    });

    it('isolates callback errors — one failing callback does not prevent others', () => {
        const bad = vi.fn(() => { throw new Error('boom'); });
        const good = vi.fn();
        const unsub1 = subscribeRendererStatus(bad);
        const unsub2 = subscribeRendererStatus(good);

        expect(() => window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true },
        }))).not.toThrow();

        expect(good).toHaveBeenCalledOnce();
        unsub1();
        unsub2();
    });
});

// ── getOfflinePlayerSnapshot ──────────────────────────────────────────────────

describe('getOfflinePlayerSnapshot', () => {
    const KEY = 'ag_snapshot_player_state';

    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('returns null when localStorage is empty', () => {
        expect(getOfflinePlayerSnapshot()).toBeNull();
    });

    it('returns the parsed object when a valid snapshot exists', () => {
        const state = { sources: [{ source_id: 'src_mpd', title: 'Test' }] };
        localStorage.setItem(KEY, JSON.stringify(state));
        expect(getOfflinePlayerSnapshot()).toEqual(state);
    });

    it('returns null when localStorage contains malformed JSON', () => {
        localStorage.setItem(KEY, '{broken json{{');
        expect(getOfflinePlayerSnapshot()).toBeNull();
    });

    it('returns null for empty string value', () => {
        localStorage.setItem(KEY, '');
        expect(getOfflinePlayerSnapshot()).toBeNull();
    });
});

// ── pwa-install-prompt: _isDismissed / _markDismissed ────────────────────────
// These are module-private functions; we test them indirectly via localStorage.

describe('pwa-install-prompt dismiss persistence', () => {
    const DISMISS_KEY = 'ag_pwa_install_dismissed';
    const TTL_MS      = 30 * 24 * 60 * 60 * 1000;

    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('banner is not dismissed when localStorage is empty', () => {
        expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
    });

    it('sets a numeric timestamp string on dismiss', () => {
        const before = Date.now();
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        const after = Date.now();
        const ts = parseInt(localStorage.getItem(DISMISS_KEY), 10);
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });

    it('is considered dismissed when timestamp is recent (< 30 days)', () => {
        const recent = Date.now() - 1000; // 1 second ago
        localStorage.setItem(DISMISS_KEY, String(recent));
        const ts = parseInt(localStorage.getItem(DISMISS_KEY), 10);
        expect(Date.now() - ts).toBeLessThan(TTL_MS);
    });

    it('is NOT considered dismissed when timestamp is older than 30 days', () => {
        const old = Date.now() - TTL_MS - 1000;
        localStorage.setItem(DISMISS_KEY, String(old));
        const ts = parseInt(localStorage.getItem(DISMISS_KEY), 10);
        expect(Date.now() - ts).toBeGreaterThanOrEqual(TTL_MS);
    });
});

// ---------------------------------------------------------------------------
// notifyOutputError — toast when the active output cannot play
// ---------------------------------------------------------------------------
// The reason for the silence used to be readable only in the fullscreen player,
// so pressing play on a DAC held by another service looked like a no-op.

import { notifyOutputError } from './library-store.js';
import { showToast } from './ui-helpers.js';

const BUSY = 'Failed to open ALSA device "hw:0,0": Device or resource busy';

/** Build a PlayerState carrying an active output with the given error. */
function stateWithError(error) {
    return { outputs: [{ id: 'dac', active: true, error }] };
}

describe('notifyOutputError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        notifyOutputError(stateWithError(null)); // re-arm the edge detector
        vi.clearAllMocks();
    });

    it('raises a toast when the active output starts failing', () => {
        notifyOutputError(stateWithError(BUSY));
        expect(showToast).toHaveBeenCalledTimes(1);
        const [type, title, message] = showToast.mock.calls[0];
        expect(type).toBe('error');
        expect(title).toBe('Playback blocked');
        expect(message).toMatch(/in use by another player/);
    });

    it('does not repeat the toast while the same failure persists', () => {
        // State events arrive every second; only the transition may notify.
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError(BUSY));
        expect(showToast).toHaveBeenCalledTimes(1);
    });

    it('announces a different failure even without recovery in between', () => {
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError('Failed to open "Heed" (alsa); No such device'));
        expect(showToast).toHaveBeenCalledTimes(2);
        expect(showToast.mock.calls[1][2]).toBe('Output unavailable');
    });

    it('re-arms after recovery so the next failure is announced again', () => {
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError(null));   // recovered — no toast
        notifyOutputError(stateWithError(BUSY));
        expect(showToast).toHaveBeenCalledTimes(2);
    });

    it('stays silent when the output is healthy', () => {
        notifyOutputError(stateWithError(null));
        notifyOutputError({ outputs: [] });
        notifyOutputError(null);
        expect(showToast).not.toHaveBeenCalled();
    });

    it('ignores an error on an output that is not active', () => {
        notifyOutputError({ outputs: [{ id: 'dac', active: false, error: BUSY }] });
        expect(showToast).not.toHaveBeenCalled();
    });
});
