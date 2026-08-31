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
