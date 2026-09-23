/**
 * Layout dimensions carry a unit, and content running to the bottom of the screen keeps
 * the mini-player's room free.
 *
 * Two blocks of layout.css declared `--footer-height: 0` and `--title-bar-height: 0`
 * without a unit. A bare 0 is valid on its own (`height: var(--footer-height)`), not
 * added to a length: `calc(44px + 0)` is invalid at computed-value time, and the whole
 * declaration falls back to its initial value without a word. Measured on 2026-09-23 in
 * Chromium: a low desktop window (1000×450) put its tab bar at top 0, under the top bar,
 * with none of its eleven tabs reachable; the library of a phone kept 0px for the
 * mini-player, so the last row of every list stayed under it.
 *
 * Measured on the same day, the second half: where `.main-content` spans the whole screen
 * (a phone either way up, a low window), the tabs' card grids kept 12px at the bottom in
 * portrait and the library nothing at all in landscape. And a FOLDED mini-player publishes
 * a height of 0 while its pull tab still covers 44px of touch area — which lay over the
 * lower half of the last library row.
 *
 * Read from the sources on purpose: each defect is a declaration that silently does not
 * apply, which a unit test mounting a component at one width cannot see.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const THEMES = read('css', 'themes.css');
const LAYOUT = read('css', 'layout.css');
const LIBRARY_PAGE = read('js', 'components', 'organisms', 'ag-library-page.js');
const PULL_TAB = read('js', 'components', 'organisms', 'ag-pull-tab.js');

/**
 * Every stylesheet, and every script that carries CSS of its own (the library injects
 * its styles from a string), tests excepted.
 * @returns {Array<[string, string]>} `[path relative to the ui root, source]`
 */
function allSources() {
    const out = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (/\.css$/.test(entry.name) || (/\.js$/.test(entry.name) && !/\.(test|stories)\.js$/.test(entry.name))) {
                out.push([rel, read(rel)]);
            }
        }
    };
    walk('css');
    walk('js');
    return out;
}

/**
 * Body of the first `@media` block whose prelude matches, braces balanced.
 * @param {string} css
 * @param {RegExp} prelude
 * @returns {string}
 */
function mediaBlock(css, prelude) {
    const start = css.search(prelude);
    if (start < 0) return '';
    const open = css.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
    }
    return '';
}

/**
 * The declarations of every rule in `css` whose selector list includes `selector`.
 * @param {string} css
 * @param {string} selector - Matched exactly against each selector of a list.
 * @returns {string[]}
 */
function rulesFor(css, selector) {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        const selectors = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
        if (selectors.includes(selector)) out.push(m[2]);
    }
    return out;
}

const PORTRAIT = mediaBlock(LAYOUT, /@media\s*\(width\s*<=\s*768px\)\s*\{/);
const LANDSCAPE = mediaBlock(LAYOUT, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(height\s*<=\s*500px\)\s*\{/);

describe('layout dimensions carry a unit', () => {
    it('declares no height, width or offset as a bare 0, anywhere', () => {
        const bare = /(--[\w-]*(?:height|width|offset))\s*:\s*0\s*[;}]/g;
        const found = [];
        for (const [file, src] of allSources()) {
            for (const m of src.matchAll(bare)) found.push(`${file}: ${m[1]}`);
        }
        expect(found, 'a bare 0 added to a length voids the whole calc() — write 0px').toEqual([]);
    });

    it('still finds both blocks it guards', () => {
        // An empty block would make the checks below pass on nothing.
        expect(PORTRAIT).toMatch(/--footer-height:\s*0px/);
        expect(LANDSCAPE).toMatch(/--footer-height:\s*0px/);
        expect(PORTRAIT).toMatch(/--title-bar-height:\s*0px/);
        expect(LANDSCAPE).toMatch(/--title-bar-height:\s*0px/);
    });
});

describe('content running to the bottom of the screen keeps the mini-player\'s room', () => {
    it('declares that room once: the bar while it shows, its pull tab once folded', () => {
        expect(THEMES).toMatch(/--pull-tab-height:\s*44px/);
        expect(THEMES).toMatch(/--bottom-clearance:\s*max\(var\(--now-playing-height,\s*0px\),\s*var\(--pull-tab-height\)\)/);
    });

    it('sizes the pull tab\'s touch area from the same number', () => {
        expect(PULL_TAB).toMatch(/height:var\(--pull-tab-height\)/);
        expect(PULL_TAB).not.toMatch(/height:44px/);
    });

    it('reserves it under the card grids, portrait and landscape, bar and column', () => {
        for (const [name, block] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
            for (const selector of ['.content-grid', 'body:has(.tabs--vertical) .content-grid']) {
                const rules = rulesFor(block, selector);
                expect(rules.length, `${name}: ${selector}`).toBeGreaterThan(0);
                for (const body of rules.filter((b) => /padding/.test(b))) {
                    expect(body, `${name}: ${selector}`).toMatch(/padding-bottom:\s*calc\(var\(--bottom-clearance\)/);
                }
            }
        }
    });

    it('gives a tab bar its height back in a low window too', () => {
        // Written for phones, whose tabs are always a column, the landscape block left the
        // bar out: in a low desktop window the top of every tab sat under it.
        const [bar] = rulesFor(LANDSCAPE, '.content-grid');
        const [column] = rulesFor(LANDSCAPE, 'body:has(.tabs--vertical) .content-grid');
        expect(bar).toMatch(/padding-top:[^;]*var\(--tabs-height\)/);
        expect(column).not.toMatch(/var\(--tabs-height\)/);
    });

    it('reserves it under the library, in landscape as well as portrait', () => {
        const query = LIBRARY_PAGE.match(/@media ([^{]+)\{\s*#library\.tab-content\.active\s*\{[^}]*padding-bottom/);
        expect(query, 'the library\'s full-screen rule').not.toBeNull();
        expect(query[1]).toMatch(/max-width:\s*768px/);
        expect(query[1]).toMatch(/orientation:\s*landscape\)\s*and\s*\(height\s*<=\s*500px/);
        expect(LIBRARY_PAGE).toMatch(/padding-bottom:\s*calc\(var\(--footer-height,\s*0px\)\s*\+\s*var\(--bottom-clearance\)\)/);
    });
});
