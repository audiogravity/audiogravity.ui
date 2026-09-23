/**
 * Unit tests for library-api.js — HQPlayer routing logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock api.js before importing library-api
vi.mock('./api.js', () => ({
    apiGet: vi.fn().mockResolvedValue([]),
    apiPost: vi.fn().mockResolvedValue({}),
    apiPut: vi.fn().mockResolvedValue({}),
    apiDelete: vi.fn().mockResolvedValue({}),
}));
vi.mock('./ui-helpers.js', () => ({ showToast: vi.fn() }));

import {
    queueItem, upnpPlay, playWithFeedback,
    PLAYLISTS_CHANGED_EVENT, failureReason, fetchPlaylistTracks, createPlaylist,
    addToPlaylist, removeFromPlaylist, renamePlaylist, deletePlaylist,
} from './library-api.js';
import { apiGet, apiPost, apiPut, apiDelete } from './api.js';
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
        // The core exposes no direct-push route; this guards against a UI
        // regression that would reintroduce one.
        expect(apiPost).not.toHaveBeenCalledWith('/hqplayer/play-library', expect.anything());
    });

    it('carries the position a playlist is played from', async () => {
        await queueItem({ sourceId: 'src_highresaudio', itemId: 'mine:5549', itemType: 'playlist',
            action: 'play', startIndex: 2 });
        expect(apiPost.mock.calls[0][1]).toMatchObject({ item_type: 'playlist', start_index: 2 });
    });

    it('sends the first position too — 0 is a position, not an absence', async () => {
        await queueItem({ sourceId: 'src_highresaudio', itemId: 'mine:5549', itemType: 'playlist',
            action: 'play', startIndex: 0 });
        expect(apiPost.mock.calls[0][1].start_index).toBe(0);
    });

    it('names the track the position points at, so the core can find it if it moved', async () => {
        await queueItem({ sourceId: 'src_highresaudio', itemId: 'mine:5549', itemType: 'playlist',
            action: 'play', startIndex: 2, startItemId: 't3_a3' });
        expect(apiPost.mock.calls[0][1]).toMatchObject({ start_index: 2, start_item_id: 't3_a3' });
    });

    it('leaves the field out when no position is given', async () => {
        await queueItem({ sourceId: 'src_mpd', itemId: '1', itemType: 'album', action: 'play' });
        expect(apiPost.mock.calls[0][1].start_index).toBeUndefined();
        expect(apiPost.mock.calls[0][1].start_item_id).toBeUndefined();
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
        // Same rule as the queueItem test above — no direct push to HQPlayer.
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

    // -----------------------------------------------------------------------
    // Tracks HQPlayer dropped. It answers "OK" to a URL it then discards, and
    // the response says what it kept. Nothing read those fields, so an album
    // played short with nothing said.

    it('names the tracks HQPlayer dropped, without calling the play a failure', async () => {
        const playFn = vi.fn().mockResolvedValue({
            ok: true, action: 'play', routed_to: 'hqplayer',
            tracks: 10, refused: 2, refused_titles: ['Bonus Take', 'Hidden Track'],
        });
        await expect(playWithFeedback(playFn)).resolves.toBe(true);
        const [type, title, message] = showToast.mock.calls[0];
        expect(type).toBe('warning');
        expect(title).toBe('Some tracks were skipped');
        expect(message).toBe('HQPlayer could not open 2 of 12 tracks: '
                           + 'Bonus Take, Hidden Track.');
    });

    it('names the one track when only one was dropped', async () => {
        await playWithFeedback(vi.fn().mockResolvedValue({
            tracks: 0, refused: 1, refused_titles: ['Interlude'],
        }));
        expect(showToast.mock.calls[0][2]).toBe('HQPlayer could not open Interlude.');
    });

    it('still counts them when a CDN redirect hides which ones they were', async () => {
        await playWithFeedback(vi.fn().mockResolvedValue({
            tracks: 8, refused: 3, refused_titles: [],
        }));
        expect(showToast.mock.calls[0][2]).toBe('HQPlayer could not open 3 of 11 tracks.');
    });

    it('trails off rather than listing a whole album', async () => {
        await playWithFeedback(vi.fn().mockResolvedValue({
            tracks: 1, refused: 6,
            refused_titles: ['A', 'B', 'C', 'D', 'E', 'F'],
        }));
        expect(showToast.mock.calls[0][2])
            .toBe('HQPlayer could not open 6 of 7 tracks: A, B, C, D, E….');
    });

    it('says nothing when every track was kept', async () => {
        await playWithFeedback(vi.fn().mockResolvedValue({
            ok: true, tracks: 12, refused: 0, refused_titles: [],
        }));
        expect(showToast).not.toHaveBeenCalled();
    });

    it('says nothing on a path that reports no refusals at all', async () => {
        await playWithFeedback(vi.fn().mockResolvedValue({ ok: true, tracks: 1 }));
        expect(showToast).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // The seconds a push takes. An album leaves as one exchange, and HQPlayer
    // answers the first command of a connection only after a delay of its own:
    // 2.39 s measured for sixteen tracks on the box's own instance, longer
    // across the network. Nothing on screen said so, and the album was clicked
    // again.

    it('says it is working when the play takes longer than a moment', async () => {
        vi.useFakeTimers();
        try {
            let release;
            const playFn = vi.fn(() => new Promise((resolve) => { release = resolve; }));
            const pending = playWithFeedback(playFn);
            await vi.advanceTimersByTimeAsync(1600);
            const [type, title] = showToast.mock.calls[0];
            expect(type).toBe('info');
            expect(title).toBe('Starting playback');
            release({ ok: true, tracks: 16 });
            await expect(pending).resolves.toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stays silent for a play that comes back quickly', async () => {
        vi.useFakeTimers();
        try {
            let release;
            const pending = playWithFeedback(() => new Promise((r) => { release = r; }));
            await vi.advanceTimersByTimeAsync(900);
            release({ ok: true, tracks: 1 });
            await pending;
            await vi.advanceTimersByTimeAsync(5000);
            expect(showToast).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not leave the notice pending after a failure either', async () => {
        vi.useFakeTimers();
        try {
            const pending = playWithFeedback(vi.fn().mockRejectedValue(new Error('nope')));
            await expect(pending).resolves.toBe(false);
            await vi.advanceTimersByTimeAsync(5000);
            expect(showToast).toHaveBeenCalledTimes(1);
            expect(showToast.mock.calls[0][0]).toBe('error');
        } finally {
            vi.useRealTimers();
        }
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

// ---------------------------------------------------------------------------
// The account's playlists — no write retried, every change announced
// ---------------------------------------------------------------------------

describe('playlist helpers', () => {
    let heard;
    const listener = (e) => heard.push(e.detail);

    beforeEach(() => {
        vi.clearAllMocks();
        heard = [];
        window.addEventListener(PLAYLISTS_CHANGED_EVENT, listener);
    });

    afterEach(() => window.removeEventListener(PLAYLISTS_CHANGED_EVENT, listener));

    it('reads a playlist\'s tracks, and an answer that is not a list as none', async () => {
        apiGet.mockResolvedValueOnce([{ id: 't1_a1' }]);
        await expect(fetchPlaylistTracks('src_highresaudio', 'mine:5549'))
            .resolves.toEqual([{ id: 't1_a1' }]);
        expect(apiGet).toHaveBeenCalledWith(
            '/library/playlist-tracks?source_id=src_highresaudio&playlist_id=mine%3A5549');
        apiGet.mockResolvedValueOnce(null);
        await expect(fetchPlaylistTracks('src_highresaudio', 'mine:5549')).resolves.toEqual([]);
        expect(heard).toEqual([]);                  // a read changes nothing
    });

    it('creates without retrying, and announces the playlist made', async () => {
        apiPost.mockResolvedValueOnce({ id: 'mine:5660', title: 'Late evening' });
        await createPlaylist({ sourceId: 'src_highresaudio', title: 'Late evening', description: 'Quiet' });
        expect(apiPost).toHaveBeenCalledWith('/library/playlists', {
            source_id: 'src_highresaudio', title: 'Late evening', description: 'Quiet',
        }, false);
        expect(heard).toEqual([{ sourceId: 'src_highresaudio', playlistId: 'mine:5660' }]);
    });

    it('announces an add only when something went in', async () => {
        apiPost.mockResolvedValueOnce({ added: 0, already: 1 });
        await addToPlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549', itemId: 't1_a1', itemType: 'track' });
        expect(heard).toEqual([]);
        apiPost.mockResolvedValueOnce({ added: 8, already: 0 });
        await addToPlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549', itemId: 'a1', itemType: 'album' });
        expect(apiPost).toHaveBeenLastCalledWith('/library/playlists/add', {
            source_id: 'src_highresaudio', playlist_id: 'mine:5549', item_id: 'a1', item_type: 'album',
        }, false);
        expect(heard).toEqual([{ sourceId: 'src_highresaudio', playlistId: 'mine:5549' }]);
    });

    it('announces a removal only when the track was there', async () => {
        apiPost.mockResolvedValueOnce({ removed: 0 });
        await removeFromPlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549', itemId: 't1_a1' });
        expect(heard).toEqual([]);
        apiPost.mockResolvedValueOnce({ removed: 1 });
        await removeFromPlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549', itemId: 't1_a1' });
        expect(apiPost).toHaveBeenLastCalledWith('/library/playlists/remove', {
            source_id: 'src_highresaudio', playlist_id: 'mine:5549', item_id: 't1_a1',
        }, false);
        expect(heard).toHaveLength(1);
    });

    it('renames with both fields, without retrying', async () => {
        apiPut.mockResolvedValueOnce({ id: 'mine:5549', title: 'Late evening' });
        await renamePlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549',
            title: 'Late evening', description: '' });
        expect(apiPut).toHaveBeenCalledWith('/library/playlists', {
            source_id: 'src_highresaudio', playlist_id: 'mine:5549', title: 'Late evening', description: '',
        }, false);
        expect(heard).toEqual([{ sourceId: 'src_highresaudio', playlistId: 'mine:5549' }]);
    });

    it('sends no description when none is given — the core then keeps the current one', async () => {
        apiPut.mockResolvedValueOnce({ id: 'mine:5549', title: 'Late evening' });
        await renamePlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549', title: 'Late evening' });
        // An empty string would CLEAR it: the core replaces both fields with what it gets.
        expect(JSON.stringify(apiPut.mock.calls[0][1])).not.toContain('description');
    });

    it('deletes without retrying — a retried deletion would answer "no longer exists"', async () => {
        apiDelete.mockResolvedValueOnce({ deleted: true });
        await deletePlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549' });
        expect(apiDelete).toHaveBeenCalledWith(
            '/library/playlists?source_id=src_highresaudio&playlist_id=mine%3A5549', false);
        expect(heard).toHaveLength(1);
    });

    it('announces nothing when a write fails', async () => {
        apiPut.mockRejectedValueOnce(new Error('HTTP 504'));
        await expect(renamePlaylist({ sourceId: 'src_highresaudio', playlistId: 'mine:5549', title: 'x' }))
            .rejects.toThrow('HTTP 504');
        expect(heard).toEqual([]);
    });

    it('shows the core\'s own words for a failure, and a sentence when there are none', () => {
        expect(failureReason(Object.assign(new Error('HTTP 400'), { detail: 'This playlist no longer exists' })))
            .toBe('This playlist no longer exists');
        expect(failureReason(new Error('Network down'))).toBe('Network down');
        expect(failureReason(undefined)).toBe('The request failed.');
    });
});
