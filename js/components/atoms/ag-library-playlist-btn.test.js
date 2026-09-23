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
