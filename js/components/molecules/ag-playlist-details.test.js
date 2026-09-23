/**
 * Unit tests for ag-playlist-details.js — the "New playlist" / "Rename playlist" dialog.
 *
 * Mounted for real; only the network and the toasts are replaced. What is held here:
 * the fields start from the playlist each time the dialog opens, both fields travel
 * together (the service replaces the two at once), nothing is written when nothing
 * changed, and no write is retried behind the person's back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Whole-module mocks: the real api.js pulls in common.js, which redirects an
// unauthenticated page to the login screen as soon as it is imported.
const { apiPost, apiPut } = vi.hoisted(() => ({ apiPost: vi.fn(), apiPut: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost, apiPut, apiDelete: vi.fn() }));
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showToast }));

import './ag-playlist-details.js';

const PLAYLIST = { id: 'mine:5549', title: 'Audiogravity test', description: 'For the integration' };

/** Let pending promises and the resulting renders land. */
async function settle(el) {
    for (let i = 0; i < 3; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
        await el.updateComplete;
    }
}

/**
 * Mount the dialog, open, for a creation (no playlist) or a rename.
 * @param {object|null} playlist
 * @returns {Promise<HTMLElement>}
 */
async function mount(playlist = null) {
    const el = document.createElement('ag-playlist-details');
    el.sourceId = 'src_highresaudio';
    el.playlist = playlist;
    document.body.appendChild(el);
    await settle(el);
    el.show = true;
    await settle(el);
    return el;
}

const inputs = (el) => [...el.querySelectorAll('input')];
const footerButton = (el, text) => [...el.querySelectorAll('.modal-footer button')]
    .find((b) => b.textContent.trim() === text);

/** Type into a field. */
async function type(el, input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
}

/** Collect the events the dialog fires. */
function listen(el) {
    const seen = [];
    el.addEventListener('playlist-saved', (e) => seen.push(['saved', e.detail]));
    el.addEventListener('details-close', () => seen.push(['close']));
    return seen;
}

beforeEach(() => {
    apiPost.mockReset();
    apiPut.mockReset();
    showToast.mockReset();
});

afterEach(() => { document.body.innerHTML = ''; });

describe('ag-playlist-details — a new playlist', () => {
    it('asks for a name and an optional description, and says it starts empty', async () => {
        const el = await mount();
        expect(el.querySelector('ag-modal').getAttribute('title')).toBe('New playlist');
        expect(inputs(el).map((i) => i.value)).toEqual(['', '']);
        expect(el.textContent).toContain('(optional)');
        expect(el.textContent).toContain('It starts empty');
        expect(footerButton(el, 'Create').disabled).toBe(true);
    });

    it('creates it with both fields, never retried, and says where it is', async () => {
        apiPost.mockResolvedValue({ id: 'mine:5660', title: 'Sunday morning' });
        const el = await mount();
        const seen = listen(el);
        await type(el, inputs(el)[0], '  Sunday morning ');
        await type(el, inputs(el)[1], 'Slow records ');
        footerButton(el, 'Create').click();
        await settle(el);
        expect(apiPost).toHaveBeenCalledWith('/library/playlists', {
            source_id: 'src_highresaudio', title: 'Sunday morning', description: 'Slow records',
        }, false);
        expect(showToast).toHaveBeenCalledWith('success', 'Created',
            'Sunday morning is ready in your HIGHRESAUDIO account.');
        expect(seen).toEqual([['saved', { id: 'mine:5660', title: 'Sunday morning', description: 'Slow records' }]]);
    });

    it('creates on Enter, from either field', async () => {
        apiPost.mockResolvedValue({ id: 'mine:5661', title: 'Late' });
        const el = await mount();
        await type(el, inputs(el)[0], 'Late');
        inputs(el)[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await settle(el);
        expect(apiPost).toHaveBeenCalledTimes(1);
    });

    it('stays open on a failure, with the core\'s reason, and can be tried again', async () => {
        apiPost.mockRejectedValueOnce(Object.assign(new Error('HTTP 504'), {
            detail: 'HIGHRESAUDIO took too long to answer.',
        }));
        const el = await mount();
        const seen = listen(el);
        await type(el, inputs(el)[0], 'Sunday morning');
        footerButton(el, 'Create').click();
        await settle(el);
        expect(showToast).toHaveBeenCalledWith('error', 'Not created', 'HIGHRESAUDIO took too long to answer.');
        expect(seen).toEqual([]);
        expect(footerButton(el, 'Create').disabled).toBe(false);
    });

    it('belongs to its write until the service has answered', async () => {
        let answer;
        apiPost.mockReturnValue(new Promise((r) => { answer = r; }));
        const el = await mount();
        const seen = listen(el);
        await type(el, inputs(el)[0], 'Sunday morning');
        footerButton(el, 'Create').click();
        await settle(el);
        expect(footerButton(el, 'Creating…').disabled).toBe(true);
        el.querySelector('ag-modal').dispatchEvent(new CustomEvent('modal-close'));
        footerButton(el, 'Creating…').click();
        expect(seen).toEqual([]);                    // neither dismissed nor sent twice
        expect(apiPost).toHaveBeenCalledTimes(1);
        answer({ id: 'mine:5662', title: 'Sunday morning' });
        await settle(el);
        expect(seen).toHaveLength(1);
    });
});

describe('ag-playlist-details — renaming', () => {
    it('opens on the playlist\'s name and description', async () => {
        const el = await mount(PLAYLIST);
        expect(el.querySelector('ag-modal').getAttribute('title')).toBe('Rename playlist');
        expect(inputs(el).map((i) => i.value)).toEqual(['Audiogravity test', 'For the integration']);
        expect(el.textContent).not.toContain('It starts empty');
    });

    it('sends the description back with the new name, since the service replaces both', async () => {
        apiPut.mockResolvedValue({ id: 'mine:5549', title: 'Late evening' });
        const el = await mount(PLAYLIST);
        const seen = listen(el);
        await type(el, inputs(el)[0], 'Late evening');
        footerButton(el, 'Save').click();
        await settle(el);
        expect(apiPut).toHaveBeenCalledWith('/library/playlists', {
            source_id: 'src_highresaudio', playlist_id: 'mine:5549',
            title: 'Late evening', description: 'For the integration',
        }, false);
        expect(showToast).toHaveBeenCalledWith('success', 'Renamed', 'The playlist is now called Late evening.');
        expect(seen).toEqual([['saved', { id: 'mine:5549', title: 'Late evening', description: 'For the integration' }]]);
    });

    it('says "saved" when only the description changed', async () => {
        apiPut.mockResolvedValue({ id: 'mine:5549', title: 'Audiogravity test' });
        const el = await mount(PLAYLIST);
        await type(el, inputs(el)[1], '');
        footerButton(el, 'Save').click();
        await settle(el);
        expect(apiPut.mock.calls[0][1].description).toBe('');
        expect(showToast).toHaveBeenCalledWith('success', 'Saved',
            'The description of Audiogravity test was saved.');
    });

    it('writes nothing when nothing changed', async () => {
        const el = await mount(PLAYLIST);
        const seen = listen(el);
        await type(el, inputs(el)[0], ' Audiogravity test ');
        footerButton(el, 'Save').click();
        await settle(el);
        expect(apiPut).not.toHaveBeenCalled();
        expect(seen).toEqual([['close']]);
    });

    it('forgets what was typed and cancelled: it reopens on the playlist', async () => {
        const el = await mount(PLAYLIST);
        await type(el, inputs(el)[0], 'Something else');
        footerButton(el, 'Cancel').click();
        el.show = false;
        await settle(el);
        el.show = true;
        await settle(el);
        expect(inputs(el)[0].value).toBe('Audiogravity test');
    });

    it('never gives two dialogs on one screen the same field ids', async () => {
        const a = await mount(PLAYLIST);
        const b = await mount();
        const ids = [...inputs(a), ...inputs(b)].map((i) => i.id);
        expect(new Set(ids).size).toBe(4);
        expect(a.querySelector(`label[for="${inputs(a)[0].id}"]`)).not.toBeNull();
    });
});
