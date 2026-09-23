/**
 * Unit tests for ag-playlist-page.js — the page of one streaming playlist.
 *
 * Mounted for real; only the network and the toasts are replaced. What is held here:
 * a tap on a track plays the playlist FROM it (the position travels to the core), the
 * header counts what the page lists rather than what the service claims, a removal
 * takes every copy of the track off the page as the service does, and the writes of
 * the account's own playlists are offered on those alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Whole-module mocks: the real api.js pulls in common.js, which redirects an
// unauthenticated page to the login screen as soon as it is imported.
const api = vi.hoisted(() => ({
    apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(),
}));
vi.mock('../../api.js', () => api);
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showToast }));

import { describeTracks, describeDeletion } from './ag-playlist-page.js';

const MINE = { id: 'mine:5549', title: 'Audiogravity test', artist: 'For the integration' };
const EDITORIAL = { id: 'editorial:791', title: 'Songs for Audiophiles', artist: 'Rock' };
const TRACKS = [
    { id: 't1_a1', title: 'Stars', artist: 'Nina Simone', album: 'The Montreux Years', duration: 397 },
    { id: 't2_a2', title: 'I\'d Rather Go Blind', artist: 'Etta James', album: 'The Montreux Years', duration: 563 },
    { id: 't3_a3', title: 'Killing Me Softly', artist: 'Roberta Flack', album: 'Audiogravity test', duration: 365 },
    { id: 't4_a4', title: 'Pressure Down', artist: 'John Farnham', album: 'Whispering Jack', duration: 230 },
];

/** Let pending promises and the resulting renders land. */
async function settle(el) {
    for (let i = 0; i < 4; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
        await el.updateComplete;
    }
}

/**
 * Mount the page on a playlist, its tracks answered by the core.
 * @param {object} playlist
 * @param {Array<object>} [tracks]
 * @returns {Promise<HTMLElement>}
 */
async function mount(playlist = MINE, tracks = TRACKS) {
    api.apiGet.mockResolvedValue(tracks);
    const el = document.createElement('ag-playlist-page');
    el.sourceId = 'src_highresaudio';
    el.backLabel = 'My playlists';
    el.playlist = playlist;
    document.body.appendChild(el);
    await settle(el);
    return el;
}

const rows = (el) => [...el.querySelectorAll('ag-library-list-row')];
const rowButton = (row, label) => row.querySelector(`button[aria-label="${label}"]`);
// The whole document: the dialogs are rendered on <body>, outside the page.
const button = (_el, text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.apiPost.mockResolvedValue({ ok: true });
    showToast.mockReset();
});

afterEach(() => { document.body.innerHTML = ''; });

describe('describeTracks / describeDeletion', () => {
    it('counts the tracks and sums their minutes', () => {
        expect(describeTracks(TRACKS)).toBe('4 tracks · 26 min');
        expect(describeTracks([TRACKS[0]])).toBe('1 track · 7 min');
    });

    it('leaves the duration out when no track carries one, and never says 0 min', () => {
        expect(describeTracks([{ duration: null }, {}])).toBe('2 tracks');
        expect(describeTracks([{ duration: 12 }])).toBe('1 track · 1 min');
        expect(describeTracks([])).toBe('0 tracks');
    });

    it('says what a deletion takes and what it leaves', () => {
        expect(describeDeletion(4)).toBe('Its 4 tracks stay in the catalogue; only the playlist goes. This cannot be undone.');
        expect(describeDeletion(1)).toBe('Its only track stays in the catalogue; only the playlist goes. This cannot be undone.');
        expect(describeDeletion(0)).toBe('It is empty. This cannot be undone.');
        expect(describeDeletion(null)).toBe('Its tracks stay in the catalogue; only the playlist goes. This cannot be undone.');
    });
});

describe('ag-playlist-page — what it shows', () => {
    it('reads the tracks of its playlist and numbers them, with their durations', async () => {
        const el = await mount();
        expect(api.apiGet).toHaveBeenCalledWith(
            '/library/playlist-tracks?source_id=src_highresaudio&playlist_id=mine%3A5549');
        expect(rows(el).map((r) => r.title)).toEqual(TRACKS.map((t) => t.title));
        expect(rows(el).map((r) => r.position)).toEqual([1, 2, 3, 4]);
        expect(rows(el)[0].note).toBe('6:37');
    });

    it('heads the page with the playlist, counted from its tracks', async () => {
        const el = await mount();
        expect(el.querySelector('.ag-pp-kicker').textContent).toBe('Your playlist');
        expect(el.querySelector('.ag-pp-title').textContent).toBe('Audiogravity test');
        expect(el.querySelector('.ag-pp-desc').textContent).toBe('For the integration');
        expect(el.querySelector('.ag-pp-count').textContent).toBe('4 tracks · 26 min');
        expect(el.querySelector('.ag-pp-back').textContent.trim()).toBe('My playlists');
    });

    it('names a track\'s album, unless it is only the playlist\'s own name', async () => {
        const el = await mount();
        expect(rows(el)[0].subtitle).toBe('Nina Simone · The Montreux Years');
        expect(rows(el)[2].subtitle).toBe('Roberta Flack');
    });

    it('says the playlist is being read, then why it could not be, with a retry', async () => {
        api.apiGet.mockRejectedValueOnce(Object.assign(new Error('HTTP 504'), {
            detail: 'Streaming service took too long to answer.',
        }));
        const el = document.createElement('ag-playlist-page');
        el.sourceId = 'src_highresaudio';
        el.playlist = MINE;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(el.textContent).toContain('Reading the playlist…');
        await settle(el);
        expect(el.querySelector('.ag-pp-error').textContent).toContain('took too long to answer');
        api.apiGet.mockResolvedValueOnce(TRACKS);
        button(el, 'Retry').click();
        await settle(el);
        expect(rows(el)).toHaveLength(4);
    });

    it('says an empty playlist is empty, and offers nothing to play', async () => {
        const el = await mount(MINE, []);
        expect(el.textContent).toContain('This playlist is empty.');
        expect(button(el, 'Play').disabled).toBe(true);
        expect(button(el, 'Queue').disabled).toBe(true);
    });

    it('goes back when asked', async () => {
        const el = await mount();
        let back = 0;
        el.addEventListener('playlist-back', () => { back += 1; });
        el.querySelector('.ag-pp-back').click();
        expect(back).toBe(1);
    });
});

describe('ag-playlist-page — playing', () => {
    it('plays the playlist from the track tapped, and opens the player', async () => {
        const el = await mount();
        let opened = 0;
        el.addEventListener('lib-open-np', () => { opened += 1; });
        rows(el)[2].querySelector('.lib-list-row').click();
        await settle(el);
        expect(api.apiPost).toHaveBeenCalledWith('/library/queue', expect.objectContaining({
            source_id: 'src_highresaudio', item_id: 'mine:5549', item_type: 'playlist',
            action: 'play', start_index: 2, start_item_id: 't3_a3',
        }));
        expect(opened).toBe(1);
    });

    it('plays the whole of it from Play, and queues the whole of it from Queue', async () => {
        const el = await mount();
        button(el, 'Play').click();
        await settle(el);
        expect(api.apiPost.mock.calls[0][1]).toMatchObject({ action: 'play' });
        expect(api.apiPost.mock.calls[0][1].start_index).toBeUndefined();
        expect(api.apiPost.mock.calls[0][1].start_item_id).toBeUndefined();
        button(el, 'Queue').click();
        await settle(el);
        expect(api.apiPost.mock.calls[1][1]).toMatchObject({ action: 'add', item_type: 'playlist' });
    });

    it('does not open the player when the play was refused', async () => {
        api.apiPost.mockRejectedValue(new Error('Nothing to play'));
        const el = await mount();
        let opened = 0;
        el.addEventListener('lib-open-np', () => { opened += 1; });
        button(el, 'Play').click();
        await settle(el);
        expect(opened).toBe(0);
        expect(showToast).toHaveBeenCalledWith('error', 'Playback failed', 'Nothing to play');
    });
});

describe('ag-playlist-page — the account\'s own playlist', () => {
    it('renders its dialogs on <body>, where the tab\'s stacking cannot bury them', async () => {
        const el = await mount();
        const dialog = document.querySelector('ag-playlist-details');
        const confirm = document.querySelector('.ag-pp-delete');
        expect(dialog).not.toBeNull();
        expect(el.contains(dialog)).toBe(false);
        expect(el.contains(confirm)).toBe(false);
        el.remove();
        expect(document.querySelector('ag-playlist-details')).toBeNull();
    });

    it('offers Rename, Delete, and a removal on every track', async () => {
        const el = await mount();
        expect(el.querySelector('[aria-label="Rename the playlist"]')).not.toBeNull();
        expect(el.querySelector('[aria-label="Delete the playlist"]')).not.toBeNull();
        expect(rows(el).every((r) => r.removable && !r.playlistable)).toBe(true);
    });

    it('takes a track out at once — every copy of it, as the service does', async () => {
        const doubled = [...TRACKS, { ...TRACKS[0] }];
        const el = await mount(MINE, doubled);
        api.apiPost.mockResolvedValueOnce({ removed: 1 });
        // The reread the change triggers never answers here: what is left on screen is
        // the page's own doing, not a fresh list from the core.
        api.apiGet.mockReturnValue(new Promise(() => {}));
        rowButton(rows(el)[0], 'Remove from the playlist').click();
        await settle(el);
        expect(api.apiPost).toHaveBeenCalledWith('/library/playlists/remove', {
            source_id: 'src_highresaudio', playlist_id: 'mine:5549', item_id: 't1_a1',
        }, false);
        expect(rows(el).map((r) => r.title)).toEqual(TRACKS.slice(1).map((t) => t.title));
        expect(showToast).toHaveBeenCalledWith('success', 'Removed', 'Stars was removed from Audiogravity test.');
    });

    it('says so when the track had already gone, and takes it off the page all the same', async () => {
        const el = await mount();
        api.apiPost.mockResolvedValueOnce({ removed: 0 });
        rowButton(rows(el)[3], 'Remove from the playlist').click();
        await settle(el);
        expect(rows(el)).toHaveLength(3);
        expect(showToast).toHaveBeenCalledWith('info', 'Already removed',
            'Pressure Down was no longer in Audiogravity test.');
    });

    it('keeps the track when the removal failed, and says why', async () => {
        const el = await mount();
        api.apiPost.mockRejectedValueOnce(Object.assign(new Error('HTTP 400'), {
            detail: 'This playlist no longer exists',
        }));
        rowButton(rows(el)[0], 'Remove from the playlist').click();
        await settle(el);
        expect(rows(el)).toHaveLength(4);
        expect(showToast).toHaveBeenCalledWith('error', 'Not removed', 'This playlist no longer exists');
    });

    it('sends one removal for a track tapped twice while the first is on its way', async () => {
        let answer;
        const el = await mount();
        api.apiPost.mockReturnValueOnce(new Promise((r) => { answer = r; }));
        rowButton(rows(el)[0], 'Remove from the playlist').click();
        await el.updateComplete;
        el._remove(TRACKS[0]);
        expect(rows(el)[0].classList.contains('ag-pp-pending')).toBe(true);
        answer({ removed: 1 });
        await settle(el);
        expect(api.apiPost.mock.calls.filter(([url]) => url === '/library/playlists/remove')).toHaveLength(1);
    });

    it('opens the rename dialog on the playlist, and shows the new name once saved', async () => {
        const el = await mount();
        el.querySelector('[aria-label="Rename the playlist"]').click();
        await settle(el);
        const dialog = document.querySelector('ag-playlist-details');
        expect(dialog.show).toBe(true);
        expect(dialog.playlist).toEqual({ id: 'mine:5549', title: 'Audiogravity test', description: 'For the integration' });
        dialog.dispatchEvent(new CustomEvent('playlist-saved', {
            detail: { id: 'mine:5549', title: 'Late evening', description: '' },
        }));
        await settle(el);
        expect(el.querySelector('.ag-pp-title').textContent).toBe('Late evening');
        expect(el.querySelector('.ag-pp-desc')).toBeNull();
        expect(dialog.show).toBe(false);
    });

    it('deletes it once confirmed, never retried, and goes back', async () => {
        const el = await mount();
        const deleted = [];
        el.addEventListener('playlist-deleted', (e) => deleted.push(e.detail));
        el.querySelector('[aria-label="Delete the playlist"]').click();
        await settle(el);
        expect(document.querySelector('.ag-pp-delete').classList.contains('show')).toBe(true);
        expect(document.querySelector('.ag-pp-delete-note').textContent)
            .toBe('Its 4 tracks stay in the catalogue; only the playlist goes. This cannot be undone.');
        api.apiDelete.mockResolvedValueOnce({ deleted: true });
        button(el, 'Delete').click();
        await settle(el);
        expect(api.apiDelete).toHaveBeenCalledWith(
            '/library/playlists?source_id=src_highresaudio&playlist_id=mine%3A5549', false);
        expect(showToast).toHaveBeenCalledWith('success', 'Deleted',
            'Audiogravity test was deleted from your HIGHRESAUDIO account.');
        expect(deleted).toEqual([{ id: 'mine:5549' }]);
    });

    it('stays on the page when the deletion failed, with the reason', async () => {
        const el = await mount();
        const deleted = [];
        el.addEventListener('playlist-deleted', (e) => deleted.push(e.detail));
        el.querySelector('[aria-label="Delete the playlist"]').click();
        await settle(el);
        api.apiDelete.mockRejectedValueOnce(Object.assign(new Error('HTTP 504'), {
            detail: 'Streaming service took too long to answer.',
        }));
        button(el, 'Delete').click();
        await settle(el);
        expect(deleted).toEqual([]);
        expect(showToast).toHaveBeenCalledWith('error', 'Not deleted', 'Streaming service took too long to answer.');
        expect(document.querySelector('.ag-pp-delete').classList.contains('show')).toBe(true);
    });
});

describe('ag-playlist-page — the service\'s own selection', () => {
    it('offers no writes of its own, and each track to one of the account\'s playlists', async () => {
        const el = await mount(EDITORIAL);
        expect(el.querySelector('.ag-pp-kicker').textContent).toBe('Playlist · HIGHRESAUDIO');
        expect(el.querySelector('[aria-label="Rename the playlist"]')).toBeNull();
        expect(el.querySelector('[aria-label="Delete the playlist"]')).toBeNull();
        expect(document.querySelector('ag-playlist-details')).toBeNull();
        expect(rows(el).every((r) => r.playlistable && !r.removable)).toBe(true);
    });

    it('hands a track to the picker, with what it shows', async () => {
        const el = await mount(EDITORIAL);
        const asked = [];
        const listener = (e) => asked.push(e.detail);
        window.addEventListener('ag-playlist-add', listener);
        try {
            rowButton(rows(el)[1], 'Add to playlist').click();
        } finally {
            window.removeEventListener('ag-playlist-add', listener);
        }
        expect(asked).toEqual([{
            sourceId: 'src_highresaudio', itemType: 'track', itemId: 't2_a2',
            title: 'I\'d Rather Go Blind', subtitle: 'Etta James', coverToken: undefined,
        }]);
    });
});

describe('ag-playlist-page — changes made elsewhere', () => {
    const announce = (playlistId, sourceId = 'src_highresaudio') => window.dispatchEvent(
        new CustomEvent('ag-playlists-changed', { detail: { sourceId, playlistId } }));

    it('reads its tracks again, without blanking them, after a change to its playlist', async () => {
        const el = await mount();
        let answer;
        api.apiGet.mockReturnValueOnce(new Promise((r) => { answer = r; }));
        announce('mine:5549');
        await el.updateComplete;
        expect(rows(el)).toHaveLength(4);           // still on screen while it reads
        answer([...TRACKS, { id: 't5_a5', title: 'Tukuman', artist: 'Enzo Favata', duration: 300 }]);
        await settle(el);
        expect(rows(el)).toHaveLength(5);
    });

    it('ignores a change to another playlist, or on another source', async () => {
        const el = await mount();
        api.apiGet.mockClear();
        announce('mine:1');
        announce('mine:5549', 'src_qobuz');
        await settle(el);
        expect(api.apiGet).not.toHaveBeenCalled();
    });

    it('stops listening once it is gone', async () => {
        const el = await mount();
        el.remove();
        api.apiGet.mockClear();
        announce('mine:5549');
        await new Promise((r) => setTimeout(r, 0));
        expect(api.apiGet).not.toHaveBeenCalled();
    });
});
