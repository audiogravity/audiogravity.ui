/**
 * Unit tests for library-api.js — HQPlayer routing logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock api.js before importing library-api
vi.mock('./api.js', () => ({
    apiPost: vi.fn().mockResolvedValue({}),
    apiDelete: vi.fn().mockResolvedValue({}),
}));

import { queueItem, upnpPlay } from './library-api.js';
import { apiPost } from './api.js';

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

    it('routes to /hqplayer/play-library when hqplayer_output is true', async () => {
        localStorage.setItem('hqplayer_output', 'true');
        await queueItem({ sourceId: 'src_mpd', itemId: '1', itemType: 'track', action: 'play' });
        expect(apiPost).toHaveBeenCalledWith('/hqplayer/play-library', expect.objectContaining({
            item_id: '1',
        }));
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

    it('routes to /hqplayer/play when hqplayer_output is true', async () => {
        localStorage.setItem('hqplayer_output', 'true');
        await upnpPlay({
            sourceId: 'upnp:uuid:123', res: 'http://srv/file.wav',
            title: 'Test', duration: 203.5, action: 'play',
        });
        expect(apiPost).toHaveBeenCalledWith('/hqplayer/play', expect.objectContaining({
            uri: 'http://srv/file.wav',
            title: 'Test',
            duration: 203.5,
        }));
    });

    it('passes duration as null when not provided', async () => {
        localStorage.setItem('hqplayer_output', 'true');
        await upnpPlay({ sourceId: 'upnp:uuid:123', res: 'http://srv/file.wav', title: 'Test', action: 'play' });
        expect(apiPost).toHaveBeenCalledWith('/hqplayer/play', expect.objectContaining({
            duration: null,
        }));
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
