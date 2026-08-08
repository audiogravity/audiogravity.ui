/**
 * Regression guards for the login page's typography contract.
 *
 * The login screen must render in Inter, and must get Inter from disk. Both
 * halves have already been broken once, silently and invisibly to any
 * rendering test:
 *
 *   1. login.html declares `font-src 'self' data:` and links no Google Fonts
 *      stylesheet, so a remote @font-face for Inter could never apply there —
 *      the page fell back to whatever the OS provides, while the rest of the
 *      app rendered in Inter;
 *   2. js/login.js stamps data-theme onto <body>, the element that also carries
 *      .login-page, and the minimal theme redefines --font-family there as a
 *      system stack. Self-hosting the font is therefore not enough on its own:
 *      the pin has to outrank the theme on specificity, not on @import order.
 *
 * Neither failure shows up in a screenshot taken on a machine that happens to
 * have a similar-looking system font, so both are asserted against the sources
 * directly, in the manner of anti-zoom.test.js.
 *
 * Note the shape of the assertions below: an earlier version of this file
 * checked each source in isolation, and so would have passed with the pin
 * losing to the theme, or with the @font-face declaring a family name the pin
 * never asks for. The cross-file checks exist because of that.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const LOGIN_HTML = read('login.html');
const FONTS_CSS = read('css', 'fonts.css');
const LOGIN_CSS = read('css', 'login.css');
const MINIMAL_CSS = read('css', 'themes', 'minimal.css');
const LOGIN_JS = read('js', 'login.js');

/** Selector that pins the login page's font. Type + class, deliberately. */
const PIN_SELECTOR = 'body.login-page';

/** System font names that must never reappear in the login page's font stack. */
const SYSTEM_FONTS = [
    '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto',
    'helvetica', 'arial', 'system-ui',
];

/**
 * Extract the value of a custom property declared on a given selector.
 * @param {string} css Stylesheet source.
 * @param {string} selector Exact selector text of the rule.
 * @param {string} prop Custom property name, including the leading dashes.
 * @returns {string|null} The declared value, or null if absent.
 */
function customPropertyIn(css, selector, prop) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = css.match(new RegExp(`(?:^|[},/*\\s])${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    if (!block) return null;
    const decl = block[1].match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
    return decl ? decl[1].trim() : null;
}

/**
 * CSS specificity of a simple selector, as [ids, classes, types].
 * Enough for the selectors compared here; not a general implementation.
 * @param {string} selector
 * @returns {number[]} specificity triple, comparable lexicographically
 */
function specificity(selector) {
    const ids = (selector.match(/#[\w-]+/g) || []).length;
    const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(?!\()/g) || []).length;
    const types = (selector.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return [ids, classes, types];
}

/**
 * Compare two specificity triples.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} >0 if a wins, <0 if b wins, 0 on a tie
 */
function compareSpecificity(a, b) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

/** Every url() referenced by the @font-face rules, in declaration order. */
const FONT_URLS = [...FONTS_CSS.matchAll(/url\('([^']+)'\)/g)].map(m => m[1]);

describe('login page font — served from disk', () => {
    it('links the self-hosted stylesheet', () => {
        expect(LOGIN_HTML).toMatch(/<link\s+rel="stylesheet"\s+href="css\/fonts\.css">/);
    });

    it('links no external font stylesheet', () => {
        expect(LOGIN_HTML).not.toMatch(/fonts\.googleapis\.com/);
        expect(LOGIN_HTML).not.toMatch(/fonts\.gstatic\.com/);
    });

    it('keeps its CSP restricted to same-origin fonts', () => {
        const fontSrc = LOGIN_HTML.match(/font-src\s+([^;]+);/);
        expect(fontSrc).not.toBeNull();
        expect(fontSrc[1].trim()).toBe("'self' data:");
    });

    it('declares every @font-face with a relative url, never a remote one', () => {
        expect(FONT_URLS.length).toBeGreaterThan(0);
        for (const url of FONT_URLS) {
            expect(url.startsWith('http')).toBe(false);
            expect(url.startsWith('//')).toBe(false);
        }
    });

    it('ships every referenced font file, as real WOFF2', () => {
        for (const url of FONT_URLS) {
            const file = path.join(ROOT, 'css', url);
            expect(fs.existsSync(file), `${url} is missing`).toBe(true);
            // WOFF2 files start with the signature 'wOF2'.
            expect(fs.readFileSync(file).subarray(0, 4).toString('ascii')).toBe('wOF2');
        }
    });

    it('covers the weights the UI actually uses (400-700)', () => {
        const weights = [...FONTS_CSS.matchAll(/font-weight:\s*([^;]+);/g)].map(m => m[1].trim());
        expect(weights.length).toBe(FONT_URLS.length);
        for (const w of weights) expect(w).toBe('400 700');
    });

    it('declares latin last, so the shared combining marks do not pull latin-ext', () => {
        // U+0304/0308/0329 sit in both subsets; CSS font matching takes the face
        // declared last, so latin must come after latin-ext or an ASCII-only page
        // drags the 85 KB file onto the wire.
        const last = FONT_URLS[FONT_URLS.length - 1];
        expect(last).toContain('inter-latin.woff2');
        expect(last).not.toContain('ext');
    });

    it('redistributes the OFL text inside the deployed artifact', () => {
        // The UI package ships _site/ only, and Vite copies publicDir verbatim —
        // so the license has to live there, not next to the woff2 files.
        const license = path.join(ROOT, 'public', 'fonts', 'OFL.txt');
        expect(fs.existsSync(license), 'public/fonts/OFL.txt is missing').toBe(true);
        const text = fs.readFileSync(license, 'utf8');
        expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
        expect(text).toContain('The Inter Project Authors');
        // The stylesheet must point at the path the box actually serves it on;
        // an inline `/*!` comment is no substitute, esbuild strips it.
        expect(FONTS_CSS).toContain('/fonts/OFL.txt');
    });
});

describe('login page font — pinned to Inter', () => {
    it('pins --font-family on the login page', () => {
        const value = customPropertyIn(LOGIN_CSS, PIN_SELECTOR, '--font-family');
        expect(value, `no --font-family on ${PIN_SELECTOR}`).not.toBeNull();
        expect(value.toLowerCase()).toContain('inter');
    });

    it('names the very family the @font-face rules declare', () => {
        const declared = [...FONTS_CSS.matchAll(/font-family:\s*([^;]+);/g)]
            .map(m => m[1].trim().replace(/['"]/g, ''));
        expect(new Set(declared).size, 'the @font-face rules disagree on the family name').toBe(1);
        const pinned = customPropertyIn(LOGIN_CSS, PIN_SELECTOR, '--font-family')
            .split(',')[0].trim().replace(/['"]/g, '');
        expect(pinned).toBe(declared[0]);
    });

    it('outranks the theme on specificity, not on @import order', () => {
        // js/login.js puts data-theme on <body>, so the theme rule and the pin
        // land on the same element. A tie would leave main.css's @import order
        // as the only tiebreaker — reorder it and the OS font wins, silently.
        expect(LOGIN_JS).toMatch(/document\.body\.setAttribute\(\s*'data-theme'/);
        expect(customPropertyIn(MINIMAL_CSS, '[data-theme="minimal"]', '--font-family')).not.toBeNull();
        expect(
            compareSpecificity(specificity(PIN_SELECTOR), specificity('[data-theme="minimal"]')),
            `${PIN_SELECTOR} must outrank [data-theme="minimal"]`,
        ).toBeGreaterThan(0);
    });

    it('lists no system font as a fallback', () => {
        const value = customPropertyIn(LOGIN_CSS, PIN_SELECTOR, '--font-family').toLowerCase();
        for (const font of SYSTEM_FONTS) {
            expect(value, `${font} must not be in the login font stack`).not.toContain(font);
        }
    });

    it('names Inter first', () => {
        const value = customPropertyIn(LOGIN_CSS, PIN_SELECTOR, '--font-family');
        expect(value.split(',')[0].trim().replace(/['"]/g, '')).toBe('Inter');
    });
});
