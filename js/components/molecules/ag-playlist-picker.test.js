/**
 * Unit tests for ag-playlist-picker.js — the "Add to playlist" dialog.
 *
 * Mounted for real; only the network and the toasts are replaced. What is held here:
 * what each answer of the core is turned into, and that neither write is retried
 * behind the person's back (a lost answer to a creation would make a second
 * playlist). A playlist created a moment ago is kept listed by the core, until the
 * service lists it itself — tested there, not here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Whole-module mocks: the real api.js pulls in common.js, which redirects an
// unauthenticated page to the login screen as soon as it is imported.
const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet, apiPost }));
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showToast }));

import { requestPlaylistAdd, describeAdd } from './ag-playlist-picker.js';

const TRACK = {
    sourceId: 'src_highresaudio', itemType: 'track', itemId: 't1_a1',
    title: 'Tukuman', subtitle: 'Enzo Favata · Ritornare', coverToken: '',
};
const ALBUM = {
    sourceId: 'src_highresaudio', itemType: 'album', itemId: 'a1',
    title: 'Ritornare', subtitle: 'Enzo Favata', coverToken: '',
};
const TEST_PLAYLIST = { id: 'mine:5549', title: 'Audiogravity test', artist: 'For the integration' };

/** Let pending promises and the resulting renders land. */
async function settle(el) {
    for (let i = 0; i < 3; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
        await el.updateComplete;
    }
}

async function mount() {
    const el = document.createElement('ag-playlist-picker');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

const modal = (el) => el.querySelector('ag-modal');
const isShown = (el) => modal(el)?.classList.contains('show') ?? false;
const rows = (el) => [...el.querySelectorAll('.ag-plp-row')];
const rowTitles = (el) => rows(el).map((b) => b.querySelector('.ag-plp-t')?.textContent.trim());
const footerButton = (el, text) => [...el.querySelectorAll('.modal-footer button')]
    .find((b) => b.textContent.trim() === text);

/** Type a name in the new-playlist field. */
async function typeName(el, name) {
    const input = el.querySelector('#ag-plp-name');
    input.value = name;
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
}

beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    showToast.mockReset();
});

afterEach(() => { document.body.innerHTML = ''; });

describe('ag-playlist-picker — the list', () => {
    it('opens on request and lists the account playlists of the item\'s source', async () => {
        apiGet.mockResolvedValue([TEST_PLAYLIST]);
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        expect(apiGet).toHaveBeenCalledWith('/library/playlists?source_id=src_highresaudio');
        expect(isShown(el)).toBe(true);
        expect(rowTitles(el)).toEqual(['New playlist', 'Audiogravity test']);
        expect(el.textContent).toContain('Your HIGHRESAUDIO playlists');
        expect(el.textContent).toContain('Tukuman');
    });

    it('says when the account has no playlist yet', async () => {
        apiGet.mockResolvedValue([]);
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        expect(el.textContent).toContain('No playlist yet');
        expect(rowTitles(el)).toEqual(['New playlist']);
    });

    it('says why the list could not be read, and reads it again on Retry', async () => {
        apiGet.mockRejectedValueOnce(Object.assign(new Error('x'), { detail: 'HIGHRESAUDIO took too long to answer.' }));
        apiGet.mockResolvedValueOnce([TEST_PLAYLIST]);
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        expect(el.querySelector('.ag-plp-error').textContent).toContain('HIGHRESAUDIO took too long to answer.');
        [...el.querySelectorAll('.ag-plp-error button')][0].click();
        await settle(el);
        expect(apiGet).toHaveBeenCalledTimes(2);
        expect(rowTitles(el)).toContain('Audiogravity test');
    });

    it('never shows the list answered for a previous item', async () => {
        let answerFirst;
        apiGet.mockReturnValueOnce(new Promise((r) => { answerFirst = r; }));
        apiGet.mockResolvedValueOnce([{ id: 'mine:2', title: 'Second' }]);
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        el._close();
        requestPlaylistAdd(ALBUM);
        await settle(el);
        answerFirst([{ id: 'mine:1', title: 'First' }]);
        await settle(el);
        expect(rowTitles(el)).toEqual(['New playlist', 'Second']);
    });
});

describe('ag-playlist-picker — adding', () => {
    it('adds to the playlist picked, never retried behind the person\'s back, and says so', async () => {
        apiGet.mockResolvedValue([TEST_PLAYLIST]);
        apiPost.mockResolvedValue({ added: 1, already: 0 });
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        rows(el)[1].click();
        await settle(el);
        expect(apiPost).toHaveBeenCalledWith('/library/playlists/add', {
            source_id: 'src_highresaudio', playlist_id: 'mine:5549',
            item_id: 't1_a1', item_type: 'track',
        }, false);
        expect(showToast).toHaveBeenCalledWith('success', 'Added', 'Tukuman was added to Audiogravity test.');
        expect(isShown(el)).toBe(false);
    });

    it('says when the track was already there', async () => {
        apiGet.mockResolvedValue([TEST_PLAYLIST]);
        apiPost.mockResolvedValue({ added: 0, already: 1 });
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        rows(el)[1].click();
        await settle(el);
        expect(showToast).toHaveBeenCalledWith('info', 'Already in this playlist',
            'Tukuman is already in Audiogravity test. Nothing was added.');
    });

    it('announces an add that changed the playlist, and only that one', async () => {
        const heard = [];
        const listener = (e) => heard.push(e.detail);
        window.addEventListener('ag-playlists-changed', listener);
        try {
            apiGet.mockResolvedValue([TEST_PLAYLIST]);
            apiPost.mockResolvedValueOnce({ added: 1, already: 0 });
            apiPost.mockResolvedValueOnce({ added: 0, already: 1 });
            const el = await mount();
            requestPlaylistAdd(TRACK);
            await settle(el);
            rows(el)[1].click();
            await settle(el);
            requestPlaylistAdd(TRACK);
            await settle(el);
            rows(el)[1].click();
            await settle(el);
            expect(heard).toEqual([{ sourceId: 'src_highresaudio', playlistId: 'mine:5549' }]);
        } finally {
            window.removeEventListener('ag-playlists-changed', listener);
        }
    });

    it('keeps the dialog open on a failure, with the core\'s reason', async () => {
        apiGet.mockResolvedValue([TEST_PLAYLIST]);
        apiPost.mockRejectedValue(Object.assign(new Error('HTTP 503'), {
            detail: 'HIGHRESAUDIO refused user/AddTitleToUserPlaylist: NO SUBSCRIPTION',
        }));
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        rows(el)[1].click();
        await settle(el);
        expect(showToast).toHaveBeenCalledWith('error', 'Not added',
            'HIGHRESAUDIO refused user/AddTitleToUserPlaylist: NO SUBSCRIPTION');
        expect(isShown(el)).toBe(true);
        expect(rows(el).every((b) => !b.disabled)).toBe(true);
    });

    it('belongs to its item until the service has answered', async () => {
        apiGet.mockResolvedValue([TEST_PLAYLIST]);
        let answer;
        apiPost.mockReturnValue(new Promise((r) => { answer = r; }));
        const el = await mount();
        requestPlaylistAdd(TRACK);
        await settle(el);
        rows(el)[1].click();
        await settle(el);
        expect(rows(el).every((b) => b.disabled)).toBe(true);
        requestPlaylistAdd(ALBUM);            // a second tap elsewhere, meanwhile
        await settle(el);
        expect(el.textContent).toContain('Tukuman');
        expect(el.textContent).not.toContain('Ritornare</span>');
        answer({ added: 1, already: 0 });
        await settle(el);
        expect(apiPost).toHaveBeenCalledTimes(1);
    });
});

describe('ag-playlist-picker — a new playlist', () => {
    async function openCreate(el) {
        requestPlaylistAdd(TRACK);
        await settle(el);
        rows(el)[0].click();
        await settle(el);
    }

    it('offers "Create and add" only once a name is typed', async () => {
        apiGet.mockResolvedValue([]);
        const el = await mount();
        await openCreate(el);
        expect(footerButton(el, 'Create and add').disabled).toBe(true);
        await typeName(el, '   ');
        expect(footerButton(el, 'Create and add').disabled).toBe(true);
        await typeName(el, 'Late evening');
        expect(footerButton(el, 'Create and add').disabled).toBe(false);
    });

    it('creates the playlist, then adds the item to it — neither retried automatically', async () => {
        apiGet.mockResolvedValue([]);
        apiPost.mockResolvedValueOnce({ id: 'mine:5650', title: 'Late evening' });
        apiPost.mockResolvedValueOnce({ added: 1, already: 0 });
        const el = await mount();
        await openCreate(el);
        await typeName(el, '  Late evening ');
        footerButton(el, 'Create and add').click();
        await settle(el);
        expect(apiPost.mock.calls).toEqual([
            ['/library/playlists', {
                source_id: 'src_highresaudio', title: 'Late evening', description: '',
            }, false],
            ['/library/playlists/add', {
                source_id: 'src_highresaudio', playlist_id: 'mine:5650',
                item_id: 't1_a1', item_type: 'track',
            }, false],
        ]);
        expect(showToast).toHaveBeenCalledWith('success', 'Added', 'Tukuman was added to Late evening.');
        expect(isShown(el)).toBe(false);
    });

    it('shows the core\'s list as it is, in its order — no copy of its own', async () => {
        apiGet.mockResolvedValue([TEST_PLAYLIST, { id: 'mine:5650', title: 'Late evening' }]);
        const el = await mount();
        requestPlaylistAdd(ALBUM);
        await settle(el);
        expect(rowTitles(el)).toEqual(['New playlist', 'Audiogravity test', 'Late evening']);
    });

    it('writes nothing else when the creation fails', async () => {
        apiGet.mockResolvedValue([]);
        apiPost.mockRejectedValueOnce(Object.assign(new Error('x'), { detail: 'A playlist needs a name' }));
        const el = await mount();
        await openCreate(el);
        await typeName(el, 'X');
        footerButton(el, 'Create and add').click();
        await settle(el);
        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith('error', 'Not created', 'A playlist needs a name');
        expect(el.querySelector('#ag-plp-name')).not.toBeNull();
    });

    it('lists the new playlist when the add after it fails, so one tap retries', async () => {
        apiGet.mockResolvedValue([]);
        apiPost.mockResolvedValueOnce({ id: 'mine:5650', title: 'Late evening' });
        apiPost.mockRejectedValueOnce(Object.assign(new Error('x'), { detail: 'HIGHRESAUDIO took too long to answer.' }));
        const el = await mount();
        await openCreate(el);
        await typeName(el, 'Late evening');
        footerButton(el, 'Create and add').click();
        await settle(el);
        expect(showToast).toHaveBeenCalledWith('error', 'Not added', 'HIGHRESAUDIO took too long to answer.');
        expect(isShown(el)).toBe(true);
        expect(rowTitles(el)).toEqual(['New playlist', 'Late evening']);
    });
});

describe('describeAdd — the words for what the core answered', () => {
    it.each([
        ['track', { added: 1, already: 0 }, 'success', 'Tukuman was added to P.'],
        ['track', { added: 0, already: 1 }, 'info', 'Tukuman is already in P. Nothing was added.'],
        ['album', { added: 8, already: 0 }, 'success', '8 tracks of Tukuman were added to P.'],
        ['album', { added: 5, already: 3 }, 'success',
            '5 tracks of Tukuman were added to P. The other 3 were already there.'],
        ['album', { added: 1, already: 1 }, 'success',
            '1 track of Tukuman was added to P. The other 1 was already there.'],
        ['album', { added: 0, already: 8 }, 'info', 'Every track of Tukuman is already in P. Nothing was added.'],
    ])('%s %o → %s', (itemType, result, type, message) => {
        const toast = describeAdd(itemType, 'Tukuman', 'P', result);
        expect(toast.type).toBe(type);
        expect(toast.message).toBe(message);
    });
});
