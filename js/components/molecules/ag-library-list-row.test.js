/**
 * Unit tests for ag-library-list-row.js — the cover cell's width contract.
 *
 * The row is a three-column grid, and its first column used to be a literal 40px while
 * the cell inside it was free to be wider. HIGHRESAUDIO's editorial playlists are 2:1
 * banners, so their cell is 80×40 — and it printed itself over the first third of every
 * title in the list. Nothing caught it: jsdom lays nothing out, so a mounted test sees
 * the same DOM whether the column fits or not.
 *
 * Hence two guards of different kinds: the markup contract (the atom is handed the size
 * the shape needs) is asserted on a mounted element, and the layout contract (the column
 * follows the cell rather than naming a width) is read out of the stylesheet.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import './ag-library-list-row.js';

// Same resolution as js/anti-zoom.test.js: the module URL is not a file: URL under the
// jsdom transform, so the stylesheet is reached from the working directory.
const CSS = readFileSync(
    path.join(process.cwd(), 'css', 'components', 'library-list-row.css'),
    'utf8',
);

/**
 * Mount the row with the given properties and wait for its first render.
 *
 * @param {object} props - Properties to assign before the element is connected.
 * @returns {Promise<HTMLElement>} The connected, rendered element.
 */
async function mount(props = {}) {
    const el = document.createElement('ag-library-list-row');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('ag-library-list-row — the cover cell', () => {
    it('keeps the row height and doubles the width for a banner', async () => {
        const el = await mount({ title: 'Montreux Jazz Festival', wide: true });
        const cover = el.querySelector('ag-library-cover');

        expect(cover.wide).toBe(true);
        // 80 wide, halved by the atom to 40 high — the height every other row has.
        expect(Number(cover.getAttribute('size'))).toBe(80);
    });

    it('is a square cell of the usual size otherwise', async () => {
        const el = await mount({ title: 'Kind of Blue' });
        const cover = el.querySelector('ag-library-cover');

        expect(cover.wide).toBe(false);
        expect(Number(cover.getAttribute('size'))).toBe(40);
    });

    it('gives the cover column no width of its own, so the cell decides', () => {
        // A literal first column is the defect: it fits one shape and clips the other.
        const grid = CSS.match(/grid-template-columns:\s*([^;]+);/);

        expect(grid).not.toBeNull();
        expect(grid[1].trim().split(/\s+/)[0]).toBe('auto');
    });
});

describe('ag-library-list-row — the trailing controls', () => {
    // Same trap as the cover column, and it went unseen the same way: jsdom lays
    // nothing out, so an item too many in the grid renders identically to a row that
    // fits. Every album row of a streaming search carries both the ★ and the +, and
    // as two grid items in three columns the + wrapped onto a second line, on the far
    // left under the cover. Guarded on the count, which jsdom does answer for.
    it('puts the star and the + in one cell, so the row stays on three items', async () => {
        const el = await mount({ title: 'Innuendo', favoritable: true, actionable: true });
        const row = el.querySelector('.lib-list-row');
        const actions = row.querySelector('.lib-lr-actions');

        expect(row.children).toHaveLength(3);
        expect(actions.querySelector('ag-library-fav-btn')).not.toBeNull();
        expect(actions.querySelector('ag-library-add-btn')).not.toBeNull();
    });

    it('adds no empty cell to a row that carries neither', async () => {
        // An always-rendered wrapper would leave a trailing gap on every plain row.
        const el = await mount({ title: 'Kind of Blue' });

        expect(el.querySelector('.lib-lr-actions')).toBeNull();
        expect(el.querySelector('.lib-list-row').children).toHaveLength(2);
    });

    it('keeps the grid at three columns', () => {
        // The other way to fix the wrap is a fourth column, and it is the wrong one:
        // a row with a single trailing control would then carry an empty track, whose
        // gap is real width at the end of every such row.
        const grid = CSS.match(/grid-template-columns:\s*([^;]+);/);

        expect(grid[1].trim().split(/\s+/)).toHaveLength(3);
    });
});

describe('ag-library-list-row — "Add to playlist"', () => {
    const buttons = (el) => [...el.querySelectorAll('.lib-lr-actions button')].map((b) => b.className);

    it('sits between the ★ and the "+ add" when asked for', async () => {
        const el = await mount({ favoritable: true, playlistable: true, actionable: true });
        expect(buttons(el)).toEqual(['lib-lr-fav', 'lib-lr-pl', 'lib-lr-add']);
    });

    it('is absent unless asked for', async () => {
        const el = await mount({ favoritable: true, actionable: true });
        expect(el.querySelector('.lib-lr-pl')).toBeNull();
    });

    it('opens the action cell on its own, for a row with nothing else to offer', async () => {
        const el = await mount({ playlistable: true });
        expect(buttons(el)).toEqual(['lib-lr-pl']);
    });

    it("reports playlist-add to the row's owner, and never plays the row", async () => {
        const el = await mount({ playlistable: true });
        let added = 0;
        let played = 0;
        el.addEventListener('playlist-add', () => { added += 1; });
        el.addEventListener('row-click', () => { played += 1; });
        el.querySelector('.lib-lr-pl').click();
        expect(added).toBe(1);
        expect(played).toBe(0);
    });
});

describe('ag-library-list-row — a playlist\'s buttons', () => {
    const buttons = (el) => [...el.querySelectorAll('.lib-lr-actions button')].map((b) => b.getAttribute('aria-label'));

    it('opens a playlist from its row, ahead of the "+ add"', async () => {
        const el = await mount({ openable: true, actionable: true });
        expect(buttons(el)).toEqual(['Open the playlist', 'Add to queue']);
    });

    it("reports playlist-open to the row's owner, and never plays the row", async () => {
        const el = await mount({ openable: true });
        const seen = [];
        el.addEventListener('playlist-open', () => seen.push('open'));
        el.addEventListener('row-click', () => seen.push('play'));
        el.querySelector('button').click();
        expect(seen).toEqual(['open']);
    });

    it('takes a track out of a playlist, without playing it', async () => {
        const el = await mount({ removable: true });
        const seen = [];
        el.addEventListener('playlist-remove', () => seen.push('remove'));
        el.addEventListener('row-click', () => seen.push('play'));
        el.querySelector('button').click();
        expect(seen).toEqual(['remove']);
        expect(buttons(el)).toEqual(['Remove from the playlist']);
    });

    it('offers neither unless asked for', async () => {
        const el = await mount({ actionable: true });
        expect(buttons(el)).toEqual(['Add to queue']);
    });
});

describe('ag-library-list-row — a track of a playlist page', () => {
    it('shows its position ahead of the cover, and its duration ahead of the controls', async () => {
        const el = await mount({ title: 'Tukuman', position: 4, note: '6:37', removable: true });
        const row = el.querySelector('.lib-list-row');
        expect(row.classList.contains('lib-list-row--numbered')).toBe(true);
        expect(row.children[0].textContent).toBe('4');
        expect(row.children[1].tagName).toBe('AG-LIBRARY-COVER');
        expect(el.querySelector('.lib-lr-actions').firstElementChild.textContent).toBe('6:37');
    });

    it('opens the trailing cell for a duration alone', async () => {
        const el = await mount({ title: 'Tukuman', note: '6:37' });
        expect(el.querySelector('.lib-lr-actions .lib-lr-note').textContent).toBe('6:37');
    });

    it('shows neither on an ordinary row', async () => {
        const el = await mount({ title: 'Kind of Blue' });
        expect(el.querySelector('.lib-lr-n')).toBeNull();
        expect(el.querySelector('.lib-lr-note')).toBeNull();
        expect(el.querySelector('.lib-list-row').classList.contains('lib-list-row--numbered')).toBe(false);
    });

    it('gives the numbered row one column per item, the position\'s ahead of the cover\'s', () => {
        // Four items — position, cover, words, controls — in the numbered grid: a
        // missing column would wrap the controls onto a second line, the defect the
        // three-column guard above exists for.
        const rule = CSS.match(/\.lib-list-row--numbered\s*{[^}]*grid-template-columns:\s*([^;]+);/);
        expect(rule).not.toBeNull();
        expect(rule[1].trim().split(/\s+/)).toEqual(['auto', 'auto', '1fr', 'auto']);
    });
});
