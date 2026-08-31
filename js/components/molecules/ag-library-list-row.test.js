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
