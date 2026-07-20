/**
 * Unit tests for library-api.js — HQPlayer routing logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock api.js before importing library-api
vi.mock('./api.js', () => ({
    apiPost: vi.fn().mockResolvedValue({}),
    apiDelete: vi.fn().mockResolvedValue({}),
}));
vi.mock('./ui-helpers.js', () => ({ showToast: vi.fn() }));

import { queueItem, upnpPlay, playWithFeedback } from './library-api.js';
import { apiPost } from './api.js';
import { showToast } from './ui-helpers.js';

describe('queueItem', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('routes to /library/queue by default', async () => {
        await queueItem({ sourceId: 'src_mpd', itemId: '1', itemType: 'track', action: 'play' });
        expect(apiPost).toHaveBeenCalledWith('/library/queue', expect.objectContaining({
            source_id: 'src_mpd',
        }));
    });

    it('always posts to /library/queue — HQPlayer routing is the backend\'s call', async () => {
        // The "use HQPlayer as output" setting is server-side (spec §8.1.3 step 2).
        // The UI must not branch on it: it used to read a per-browser localStorage
        // flag, so a phone and a laptop could route the same play differently.
        localStorage.setItem('hqplayer_output', 'true');   // stale legacy value
        await queueItem({ sourceId: 'src_mpd', itemId: '1', itemType: 'track', action: 'play' });
        expect(apiPost).toHaveBeenCalledWith('/library/queue', expect.objectContaining({
            source_id: 'src_mpd',
        }));
        expect(apiPost).not.toHaveBeenCalledWith('/hqplayer/play-library', expect.anything());
    });
});

describe('upnpPlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('routes to /library/upnp-play by default', async () => {
        await upnpPlay({ sourceId: 'upnp:uuid:123', res: 'http://srv/file.wav', title: 'Test', action: 'play' });
        expect(apiPost).toHaveBeenCalledWith('/library/upnp-play', expect.objectContaining({
            source_id: 'upnp:uuid:123',
            res: 'http://srv/file.wav',
        }));
    });

    it('always posts to /library/upnp-play — HQPlayer routing is the backend\'s call', async () => {
        localStorage.setItem('hqplayer_output', 'true');   // stale legacy value
        await upnpPlay({
            sourceId: 'upnp:uuid:123', res: 'http://srv/file.wav',
            title: 'Test', duration: 203.5, action: 'play',
        });
        expect(apiPost).toHaveBeenCalledWith('/library/upnp-play', expect.objectContaining({
            res: 'http://srv/file.wav',
        }));
        expect(apiPost).not.toHaveBeenCalledWith('/hqplayer/play', expect.anything());
    });
});

describe('queueWithFeedback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls queueFn and shows success toast on success', async () => {
        const { queueWithFeedback } = await import('./library-api.js');
        const showToast = vi.fn();
        vi.doMock('./ui-helpers.js', () => ({ showToast }));

        const queueFn = vi.fn().mockResolvedValue({});
        await queueWithFeedback(queueFn, 'My Track');

        expect(queueFn).toHaveBeenCalledOnce();
    });

    it('shows error toast when queueFn throws', async () => {
        // Re-import to pick up fresh module state
        const mod = await import('./library-api.js');
        const queueFn = vi.fn().mockRejectedValue(new Error('Network error'));

        // Should not throw — error is caught internally
        await expect(mod.queueWithFeedback(queueFn, 'Track')).resolves.toBeUndefined();
    });

    it('uses fallback label when label is empty', async () => {
        const mod = await import('./library-api.js');
        const queueFn = vi.fn().mockResolvedValue({});
        // Should not throw regardless of empty label
        await expect(mod.queueWithFeedback(queueFn, '')).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// playWithFeedback — a refused play must not look like a click that did nothing
// ---------------------------------------------------------------------------
// The backend explains why it refused (expired stream, unreachable server, a
// source that cannot reach the current output). Every play entry point used to
// drop that explanation into console.error, leaving the user with silence.

describe('playWithFeedback', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns true and stays silent when the play is accepted', async () => {
        const playFn = vi.fn().mockResolvedValue({});
        await expect(playWithFeedback(playFn)).resolves.toBe(true);
        expect(playFn).toHaveBeenCalledOnce();
        // Success needs no toast: the music starting is the feedback.
        expect(showToast).not.toHaveBeenCalled();
    });

    it('relays the server message verbatim rather than a generic one', async () => {
        const detail = 'This source cannot be played through HQPlayer yet — '
                     + 'only the local library can.';
        await playWithFeedback(vi.fn().mockRejectedValue(new Error(detail)));
        expect(showToast).toHaveBeenCalledTimes(1);
        const [type, title, message] = showToast.mock.calls[0];
        expect(type).toBe('error');
        expect(title).toBe('Playback failed');
        expect(message).toBe(detail);
    });

    it('returns false on failure so the caller can skip opening the player', async () => {
        const res = await playWithFeedback(vi.fn().mockRejectedValue(new Error('nope')));
        expect(res).toBe(false);
    });

    it('never rethrows — the caller must not need its own catch', async () => {
        await expect(playWithFeedback(vi.fn().mockRejectedValue(new Error('boom'))))
            .resolves.toBe(false);
    });

    it('falls back to a readable message when the error carries none', async () => {
        await playWithFeedback(vi.fn().mockRejectedValue(new Error('')));
        expect(showToast.mock.calls[0][2]).toBe('Could not start playback');
    });

    it('survives a rejection that is not an Error object', async () => {
        await expect(playWithFeedback(vi.fn().mockRejectedValue(undefined)))
            .resolves.toBe(false);
        expect(showToast.mock.calls[0][2]).toBe('Could not start playback');
    });
});
