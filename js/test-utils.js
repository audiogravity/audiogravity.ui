/**
 * @module test-utils
 * @description Helpers shared by the unit tests. Not loaded by the application.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { vi } from 'vitest';

/**
 * Put the page on a device in its light or dark appearance, as `matchMedia` reports it.
 *
 * jsdom has no matchMedia. Any other query — a panel asks whether the pointer is coarse —
 * is answered no. Undone by `vi.unstubAllGlobals()`.
 *
 * @param {boolean} dark - Whether the device is in its dark appearance.
 * @returns {{query: object, flip: (dark: boolean) => void}} The query the page gets, and
 *   a way to change the device's appearance under it, as the system would.
 */
export function deviceAppearance(dark) {
    const listeners = [];
    const query = {
        matches: dark,
        addEventListener: vi.fn((type, fn) => { if (type === 'change') listeners.push(fn); }),
    };
    vi.stubGlobal('matchMedia', (text) => (text === '(prefers-color-scheme: dark)'
        ? query
        : { matches: false, addEventListener() {} }));
    return {
        query,
        flip(next) {
            query.matches = next;
            for (const fn of listeners) fn({ matches: next });
        },
    };
}

/**
 * Give jsdom's screen a size — it measures 0 × 0 — and tell the page it changed, as a
 * window carried to another screen, or a phone turned, would.
 *
 * Undone by {@link restoreScreen}.
 *
 * @param {number} width - `screen.width`, in CSS pixels.
 * @param {number} height - `screen.height`, in CSS pixels.
 */
export function stubScreen(width, height) {
    Object.defineProperty(window.screen, 'width', { value: width, configurable: true });
    Object.defineProperty(window.screen, 'height', { value: height, configurable: true });
    window.dispatchEvent(new Event('resize'));
}

/** Give jsdom's screen its own size back, after {@link stubScreen}. */
export function restoreScreen() {
    delete window.screen.width;
    delete window.screen.height;
}

/**
 * Read one of the app's stylesheets as text, for a guard jsdom cannot give: it lays
 * nothing out, so a layout contract is read out of the stylesheet itself.
 *
 * Resolved from the working directory: under the jsdom transform the module URL is
 * not a file: URL, so a path relative to the test file does not resolve.
 *
 * BACKLOG: most guards that read a stylesheet still read it their own way —
 * audiogravity.ops/BACKLOG.md, "readStylesheet — le lecteur partagé existe".
 *
 * @param {...string} parts - Path under the repository root, e.g. 'css', 'components', 'x.css'.
 * @returns {string} The stylesheet's text.
 */
export function readStylesheet(...parts) {
    return readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

/**
 * The declarations of the first rule whose selector ends with `selector`.
 *
 * @param {string} css - A stylesheet's text (see readStylesheet).
 * @param {string} selector - The selector, as written in the stylesheet.
 * @returns {string|null} The text between the braces, or null when no rule matches.
 */
export function cssRuleBody(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

/**
 * The body of the first block — `@media`, `@container`, `@keyframes` — whose prelude
 * matches, braces balanced: the rules a screen of that size gets, for cssRuleBody to read,
 * or the steps of an animation.
 *
 * @param {string} css - A stylesheet's text (see readStylesheet).
 * @param {RegExp} prelude - Pattern for the block's prelude, e.g.
 *   `/@media\s*\(width\s*<=\s*768px\)/`.
 * @returns {string} The text between the block's braces, or '' when there is none.
 */
export function mediaBlock(css, prelude) {
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
 * Flatten a mocked lit template into plain text.
 *
 * The suites mock `lit` so that html`` returns `{strings, values}` rather than a
 * TemplateResult, which lets a component's render() be asserted on without a
 * DOM. This walks that structure back into the markup it would produce.
 *
 * Beware when asserting on attribute bindings: a `false` value flattens to the
 * empty string, so `?disabled=${false}` renders as `?disabled=` and an assertion
 * against the text "?disabled=false" can never fail. Assert on the true form.
 *
 * @param {*} node - A mocked template, an array of them, or any renderable value.
 * @returns {string} The flattened markup.
 */
export function flat(node) {
    if (node === null || node === undefined || node === false) return '';
    if (typeof node === 'symbol') return '';
    if (Array.isArray(node)) return node.map(flat).join('');
    if (typeof node === 'object' && node.strings) {
        return node.strings
            .map((s, i) => s + (i < node.values.length ? flat(node.values[i]) : ''))
            .join('');
    }
    if (typeof node === 'function') return '';
    return String(node);
}

/**
 * Every file under a directory of the repository whose name matches, recursively, with
 * node_modules left out: the one walker the guards share.
 *
 * @param {string} dir - Directory under the repository root, e.g. 'css'.
 * @param {RegExp} pattern - Tested on the file name, e.g. `/\.css$/`.
 * @returns {string[]} Paths relative to the repository root.
 */
export function filesUnder(dir, pattern) {
    return readdirSync(path.join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : filesUnder(rel, pattern);
        return pattern.test(entry.name) ? [rel] : [];
    });
}

/**
 * The application's own sources, for the guards that read markup: every .js under js/
 * except the tests and the stories, and the two HTML pages.
 *
 * @returns {string[]} Paths relative to the repository root.
 */
export function appSources() {
    return [...filesUnder('js', /\.js$/).filter((f) => !/\.(test|stories)\.js$/.test(f)), 'index.html', 'login.html'];
}

/**
 * The selectors of a selector list, split on its top-level commas only — inside `:not()`
 * or `:is()` a comma separates arguments, not selectors — trimmed, whitespace collapsed.
 *
 * @param {string} list - A rule's selector list, as written before its `{`.
 * @returns {string[]}
 */
export function selectorList(list) {
    return list.split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, ' '));
}

/**
 * The opening tags written in a source, each read to its closing `>` — the one outside
 * any `${...}` expression, so the `=>` of an arrow function inside does not end it.
 *
 * @param {string} text - Source text: a component's templates, or an HTML page.
 * @returns {string[]} Each tag, from `<` to `>`.
 */
export function openingTags(text) {
    const tags = [];
    for (let i = text.indexOf('<'); i !== -1; i = text.indexOf('<', i + 1)) {
        if (!/[a-zA-Z]/.test(text[i + 1] || '')) continue;
        let depth = 0;
        let j = i + 1;
        for (; j < text.length; j++) {
            if (text[j] === '$' && text[j + 1] === '{') { depth++; j++; }
            else if (depth && text[j] === '{') depth++;
            else if (depth && text[j] === '}') depth--;
            else if (!depth && text[j] === '>') break;
        }
        tags.push(text.slice(i, j + 1));
    }
    return tags;
}
