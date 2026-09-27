/**
 * @module test-utils
 * @description Helpers shared by the unit tests. Not loaded by the application.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
