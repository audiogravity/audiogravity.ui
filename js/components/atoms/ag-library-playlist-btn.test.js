/**
 * Unit tests for ag-library-playlist-btn.js — the "Add to playlist" button.
 *
 * It sits on an album card whose own click PLAYS the album: a tap that bubbled up
 * would start the album and open the picker at once. Hence the propagation test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import './ag-library-playlist-btn.js';

/**
 * Mount the button with the given properties and wait for its first render.
 *
 * @param {object} props - Properties to assign before the element is connected.
 * @param {HTMLElement} [parent] - Where to connect it (default: document.body).
 * @returns {Promise<HTMLElement>}
 */
async function mount(props = {}, parent = document.body) {
    const el = document.createElement('ag-library-playlist-btn');
    Object.assign(el, props);
    parent.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('ag-library-playlist-btn', () => {
    it('reports the tap as playlist-add, to a listener above it', async () => {
        const wrapper = document.createElement('div');
        document.body.appendChild(wrapper);
        const el = await mount({}, wrapper);
        let seen = 0;
        document.body.addEventListener('playlist-add', () => { seen += 1; });
        el.querySelector('button').click();
        expect(seen).toBe(1);
    });

    it('never lets the tap reach the card that plays the album', async () => {
        const card = document.createElement('div');
        let played = 0;
        card.addEventListener('click', () => { played += 1; });
        document.body.appendChild(card);
        const el = await mount({ variant: 'card' }, card);
        el.querySelector('button').click();
        expect(played).toBe(0);
    });

    it.each([
        ['row', 'lib-lr-pl'],
        ['card', 'lib-ac-pl'],
        ['player', 'npfs-pl-btn'],
    ])('draws the %s variant with its own class', async (variant, cls) => {
        const el = await mount({ variant });
        expect(el.querySelector('button').classList.contains(cls)).toBe(true);
    });

    it('falls back to the row look for an unknown variant', async () => {
        const el = await mount({ variant: 'huge' });
        expect(el.querySelector('button').className).toBe('lib-lr-pl');
    });

    it('is named for assistive technology, and the name can be changed', async () => {
        const el = await mount();
        expect(el.querySelector('button').getAttribute('aria-label')).toBe('Add to playlist');
        el.label = 'Add the album to a playlist';
        await el.updateComplete;
        expect(el.querySelector('button').getAttribute('aria-label')).toBe('Add the album to a playlist');
    });
});

describe('ag-library-playlist-btn — its three modes', () => {
    it.each([
        ['add', 'playlist-add', 'Add to playlist'],
        ['remove', 'playlist-remove', 'Remove from the playlist'],
        ['open', 'playlist-open', 'Open the playlist'],
    ])('the %s mode fires %s and is named "%s"', async (mode, type, label) => {
        const el = await mount({ mode });
        const seen = [];
        document.body.addEventListener(type, (e) => seen.push(e.type));
        el.querySelector('button').click();
        expect(seen).toEqual([type]);
        expect(el.querySelector('button').getAttribute('aria-label')).toBe(label);
    });

    it('takes the bottom-left corner of a cover to open a playlist, which has no ★ there', async () => {
        const open = await mount({ mode: 'open', variant: 'card' });
        const add = await mount({ mode: 'add', variant: 'card' });
        expect(open.querySelector('button').className).toBe('lib-ac-open');
        expect(add.querySelector('button').className).toBe('lib-ac-pl');
    });

    it('keeps the row look in every mode, beside the other row controls', async () => {
        const remove = await mount({ mode: 'remove' });
        expect(remove.querySelector('button').className).toBe('lib-lr-pl');
    });

    it('falls back to "add" for an unknown mode', async () => {
        const el = await mount({ mode: 'shuffle' });
        let added = 0;
        document.body.addEventListener('playlist-add', () => { added += 1; });
        el.querySelector('button').click();
        expect(added).toBe(1);
        expect(el.querySelector('button').getAttribute('aria-label')).toBe('Add to playlist');
    });

    it('never lets an "open" reach the card that plays the playlist', async () => {
        const card = document.createElement('div');
        let played = 0;
        card.addEventListener('click', () => { played += 1; });
        document.body.appendChild(card);
        const el = await mount({ mode: 'open', variant: 'card' }, card);
        el.querySelector('button').click();
        expect(played).toBe(0);
    });
});
