/**
 * Unit tests for the streaming-favorites cache in library-store: dedup/TTL,
 * copy-on-read, optimistic set + revert, and subscriber notifications.
 * library-api (the REST layer) and api.js are mocked; distinct source ids per
 * test avoid cross-test pollution of the module-singleton cache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchFavoriteIds = vi.fn();
const addFavorite      = vi.fn();
const removeFavorite   = vi.fn();

vi.mock('./library-api.js', () => ({
    fetchFavoriteIds: (...a) => fetchFavoriteIds(...a),
    addFavorite:      (...a) => addFavorite(...a),
    removeFavorite:   (...a) => removeFavorite(...a),
}));
vi.mock('./api.js', () => ({ apiGet: vi.fn(), buildAuthedUrl: vi.fn() }));

import { getFavoriteAlbumIds, setAlbumFavorited, subscribeFavorites } from './library-store.js';

describe('library-store favorites', () => {
    beforeEach(() => {
        fetchFavoriteIds.mockReset();
        addFavorite.mockReset().mockResolvedValue({});
        removeFavorite.mockReset().mockResolvedValue({});
    });

    it('fetches once and serves subsequent reads from the cache (dedup + TTL)', async () => {
        fetchFavoriteIds.mockResolvedValue(['a', 'b']);
        const s1 = await getFavoriteAlbumIds('src_cache');
        const s2 = await getFavoriteAlbumIds('src_cache');
        expect(fetchFavoriteIds).toHaveBeenCalledTimes(1);
        expect([...s1].sort()).toEqual(['a', 'b']);
        expect(s2.has('a')).toBe(true);
    });

    it('returns a copy — mutating the result never leaks into the cache', async () => {
        fetchFavoriteIds.mockResolvedValue(['x']);
        const s1 = await getFavoriteAlbumIds('src_copy');
        s1.add('injected');
        const s2 = await getFavoriteAlbumIds('src_copy');
        expect(s2.has('injected')).toBe(false);
    });

    it('setAlbumFavorited optimistically updates the cache, persists, and notifies', async () => {
        fetchFavoriteIds.mockResolvedValue([]);
        await getFavoriteAlbumIds('src_add');
        const cb = vi.fn();
        subscribeFavorites('src_add', cb);
        await setAlbumFavorited('src_add', 'k', true);
        expect(addFavorite).toHaveBeenCalledWith('src_add', 'k', 'album');
        expect(cb).toHaveBeenCalled();
        expect((await getFavoriteAlbumIds('src_add')).has('k')).toBe(true);
    });

    it('reverts the cache and re-notifies when persistence fails', async () => {
        fetchFavoriteIds.mockResolvedValue([]);
        await getFavoriteAlbumIds('src_fail');
        addFavorite.mockRejectedValue(new Error('500'));
        const cb = vi.fn();
        subscribeFavorites('src_fail', cb);
        await expect(setAlbumFavorited('src_fail', 'k', true)).rejects.toThrow();
        expect(cb).toHaveBeenCalledTimes(2);            // optimistic, then revert
        expect((await getFavoriteAlbumIds('src_fail')).has('k')).toBe(false);
    });

    it('unsubscribe stops notifications', async () => {
        fetchFavoriteIds.mockResolvedValue([]);
        const cb = vi.fn();
        const unsub = subscribeFavorites('src_unsub', cb);
        unsub();
        await setAlbumFavorited('src_unsub', 'k', true);
        expect(cb).not.toHaveBeenCalled();
    });
});
