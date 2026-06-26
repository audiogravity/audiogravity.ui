/**
 * Unit tests for library-store.js — subscribeRendererStatus.
 *
 * Covers Fix 5 (DRY SSE): all 3 components previously subscribed independently
 * to window 'renderer-status-update'. The store now owns the single window
 * listener and multiplexes to registered callbacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub modules that library-store.js may import transitively.
vi.mock('./api.js', () => ({ apiGet: vi.fn(), buildAuthedUrl: vi.fn((path) => path) }));

// Provide a minimal window mock if not available (jsdom provides it in vitest).
// The subscribeRendererStatus tests rely on window.dispatchEvent.

import { subscribeRendererStatus } from './library-store.js';

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
