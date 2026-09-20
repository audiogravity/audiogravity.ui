/**
 * The sign-in page keeps the spacing and type steps it has always rendered with.
 *
 * Compact mode was a switch in the settings panel, on by default, that added
 * `body.compact-mode` from js/common.js. login.html does not load that script, so the
 * sign-in page was the one screen the switch never reached: it rendered at 8/16/24/32 px
 * of spacing and 13/14/16 px of type while every other screen showed the tighter steps.
 * Flattening compact mode into css/themes.css made the tighter steps the defaults, which
 * would have resized this page alone — measured at 1440x900 and 390x844, the card's
 * padding went 32px -> 24px and 24px -> 18px, its height 558px -> 460px and 536px -> 445px.
 * The decision was to keep the page exactly as it was, so css/login.css now declares what
 * it used to inherit.
 *
 * Read from the sources: the values are only correct RELATIVE to the theme's own scale, so
 * what has to be guarded is the pair — the page's own steps, and the fact that the theme's
 * moved away from them. A rendering test of the page alone cannot see the second half.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const LOGIN_CSS = read('css/login.css');
const THEMES = read('css/themes.css');
const LOGIN_HTML = read('login.html');

/**
 * Pages that pull the app's stylesheet through a `<link>`.
 *
 * Matched on the tag rather than on the path: stats.html is the bundle report Rollup
 * writes at build time (gitignored), and it mentions every file of the tree inside its
 * data — including css/main.css — without ever loading one.
 *
 * @returns {string[]} file names, repo root only
 */
function pagesLoadingTheStylesheet() {
    return fs.readdirSync(ROOT)
        .filter((f) => f.endsWith('.html'))
        .filter((f) => /<link[^>]+href=["']css\/main\.css["']/.test(read(f)));
}

/** The steps this page rendered with before compact mode was flattened. */
const PAGE_STEPS = {
    '--spacing-sm': 8,
    '--spacing-md': 16,
    '--spacing-lg': 24,
    '--spacing-xl': 32,
    '--font-size-sm': 13,
    '--font-size-md': 14,
    '--font-size-lg': 16,
};

/**
 * Read a token declared inside the `body.login-page` rule of css/login.css.
 * @param {string} name - Token name, e.g. '--spacing-md'.
 * @returns {number|null} the value in px, or null when the rule does not declare it
 */
function pageToken(name) {
    const at = LOGIN_CSS.indexOf('body.login-page {');
    if (at === -1) return null;
    const rule = LOGIN_CSS.slice(at, LOGIN_CSS.indexOf('}', at));
    const m = rule.match(new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`));
    return m ? Number(m[1]) : null;
}

/**
 * Read a token from the canonical `:root` block of css/themes.css, before any media query
 * redefines a step.
 * @param {string} name - Token name.
 * @returns {number} the value in px
 */
function themeToken(name) {
    const head = THEMES.slice(0, THEMES.indexOf('@media'));
    const m = head.match(new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`));
    if (!m) throw new Error(`${name} not found in the canonical block of themes.css`);
    return Number(m[1]);
}

describe('the sign-in page keeps its own steps', () => {
    it('declares every step it used to inherit, on its own body class', () => {
        const missing = Object.entries(PAGE_STEPS)
            .filter(([name, px]) => pageToken(name) !== px)
            .map(([name, px]) => `${name}: expected ${px}px, found ${pageToken(name)}`);
        expect(missing, `steps the page no longer pins:\n  ${missing.join('\n  ')}`).toEqual([]);
    });

    it('steps --font-size-lg down at phone width, as the theme used to', () => {
        // css/themes.css declared 15px under `width <= 768px`; that declaration went with
        // the flattening, and this page still needs it.
        const at = LOGIN_CSS.search(/@media\s*\(width\s*<=\s*768px\)/);
        expect(at, 'the page declares no phone-width block').toBeGreaterThan(-1);
        const block = LOGIN_CSS.slice(at, LOGIN_CSS.indexOf('\n}', LOGIN_CSS.indexOf('{', at)));
        expect(block).toMatch(/--font-size-lg:\s*15px/);
    });

    it('is pinning steps the theme no longer carries', () => {
        // The point of the block. Were the theme to return to these values, the page would
        // be restating them for nothing — and someone deleting the block then would not
        // know it had ever mattered.
        const same = Object.keys(PAGE_STEPS).filter((name) => themeToken(name) === PAGE_STEPS[name]);
        expect(same, `the theme carries these again, so the page block is dead:\n  ${same.join('\n  ')}`)
            .toEqual([]);
    });
});

describe('why the page needs them', () => {
    it('does not load the script that carried the compact class', () => {
        // The reason the page was untouched in the first place. If it ever loads the app
        // shell, its steps come from the theme and this whole block has to be revisited.
        expect(LOGIN_HTML).not.toMatch(/src=["'][^"']*\bcommon\.js/);
        expect(LOGIN_HTML).not.toMatch(/src=["'][^"']*js\/main\.js/);
    });

    it('is the only page that loads the stylesheet without the shell', () => {
        // Any other page in that situation would render at the theme's steps while looking
        // like this one, and nothing would report it. A new page added without the shell
        // fails here, where the choice can still be made deliberately.
        const pages = pagesLoadingTheStylesheet();
        expect(pages, 'no page loads css/main.css at all').toContain('login.html');

        const shellless = pages
            .filter((f) => f !== 'login.html')
            .filter((f) => !/src=["'][^"']*(common\.js|js\/main\.js)/.test(read(f)));
        expect(shellless, `pages without the shell, so at the wrong steps:\n  ${shellless.join('\n  ')}`)
            .toEqual([]);
    });
});
