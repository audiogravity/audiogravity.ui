/**
 * Unit tests for FavoritesController — the shared streaming-album ★ controller.
 * The store + toast layers are mocked; a fake ReactiveControllerHost captures
 * registration and update requests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getFavoriteAlbumIds = vi.fn();
const setAlbumFavorited   = vi.fn();
const subscribeFavorites  = vi.fn(() => () => {});   // returns an unsubscribe fn
const showToast           = vi.fn();

vi.mock('../library-store.js', () => ({
    getFavoriteAlbumIds: (...a) => getFavoriteAlbumIds(...a),
    setAlbumFavorited:   (...a) => setAlbumFavorited(...a),
    subscribeFavorites:  (...a) => subscribeFavorites(...a),
}));
vi.mock('../ui-helpers.js', () => ({ showToast: (...a) => showToast(...a) }));

import { FavoritesController } from './FavoritesController.js';

const makeHost = () => ({ addController: vi.fn(), requestUpdate: vi.fn() });

describe('FavoritesController', () => {
    beforeEach(() => {
        getFavoriteAlbumIds.mockReset().mockResolvedValue(new Set());
        setAlbumFavorited.mockReset();
        subscribeFavorites.mockReset().mockReturnValue(() => {});
        showToast.mockReset();
    });

    it('registers with the host', () => {
        const h = makeHost();
        const c = new FavoritesController(h);
        expect(h.addController).toHaveBeenCalledWith(c);
    });

    it('load() subscribes, fills the id set, and requests an update', async () => {
        getFavoriteAlbumIds.mockResolvedValue(new Set(['a', 'b']));
        const h = makeHost();
        const c = new FavoritesController(h);
        await c.load('src_qobuz');
        expect(subscribeFavorites).toHaveBeenCalledWith('src_qobuz', expect.any(Function));
        expect(getFavoriteAlbumIds).toHaveBeenCalledWith('src_qobuz');
        expect(c.has('a')).toBe(true);
        expect(c.has('z')).toBe(false);
        expect(h.requestUpdate).toHaveBeenCalled();
    });

    it('load() re-subscribes when the source changes (unsubscribing the previous one)', async () => {
        const unsub = vi.fn();
        subscribeFavorites.mockReturnValue(unsub);
        const c = new FavoritesController(makeHost());
        await c.load('src_qobuz');
        await c.load('src_tidal');
        expect(unsub).toHaveBeenCalled();                 // previous subscription torn down
        expect(subscribeFavorites).toHaveBeenCalledTimes(2);
    });

    it('a favorites notification re-syncs from the cache', async () => {
        let notify;
        subscribeFavorites.mockImplementation((_src, cb) => { notify = cb; return () => {}; });
        getFavoriteAlbumIds.mockResolvedValue(new Set());
        const c = new FavoritesController(makeHost());
        await c.load('src_tidal');
        getFavoriteAlbumIds.mockResolvedValue(new Set(['x']));   // another view favorited x
        await notify();                                          // subscription fires
        expect(c.has('x')).toBe(true);
    });

    it('hostDisconnected unsubscribes', async () => {
        const unsub = vi.fn();
        subscribeFavorites.mockReturnValue(unsub);
        const c = new FavoritesController(makeHost());
        await c.load('src_qobuz');
        c.hostDisconnected();
        expect(unsub).toHaveBeenCalled();
    });

    it('toggle(add) optimistically adds and persists', async () => {
        setAlbumFavorited.mockResolvedValue(true);
        const c = new FavoritesController(makeHost());
        await c.toggle('src_tidal', 'x', true);
        expect(c.has('x')).toBe(true);
        expect(setAlbumFavorited).toHaveBeenCalledWith('src_tidal', 'x', true);
    });

    it('toggle(remove) optimistically removes and persists', async () => {
        getFavoriteAlbumIds.mockResolvedValue(new Set(['x']));
        setAlbumFavorited.mockResolvedValue(false);
        const c = new FavoritesController(makeHost());
        await c.load('src_tidal');
        await c.toggle('src_tidal', 'x', false);
        expect(c.has('x')).toBe(false);
        expect(setAlbumFavorited).toHaveBeenCalledWith('src_tidal', 'x', false);
    });

    it('reverts the optimistic change and toasts when persistence fails', async () => {
        setAlbumFavorited.mockRejectedValue(new Error('500'));
        const c = new FavoritesController(makeHost());
        await c.toggle('src_qobuz', 'x', true);   // add → fails
        expect(c.has('x')).toBe(false);            // reverted
        expect(showToast).toHaveBeenCalled();
    });
});
