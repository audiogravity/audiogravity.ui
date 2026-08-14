/**
 * Regression guards for the text-selection contract.
 *
 * AG's UI is a control console, so `css/base.css` turns text selection off on
 * `body` and turns it back on for the few places where copying is the point. Two
 * things about that arrangement are invisible at review time, and both were nearly
 * got wrong while the rule was being written:
 *
 *   1. the `body` rule only reaches a component because it renders into the LIGHT
 *      DOM. A component in a shadow root does not inherit it and has to declare
 *      the rule itself — ag-audio-pipeline is the one such component today;
 *   2. `.xterm` must NOT be in the re-enable list. xterm disables native selection
 *      in its own stylesheet on purpose and paints its own onto the canvas, so
 *      re-enabling it here sets the two against each other. It reads like an
 *      obvious exception to grant, which is exactly why it needs a guard.
 *
 * Neither survives a rendering test, so both are asserted against the sources, in
 * the manner of anti-zoom.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CSS_ROOT = path.join(ROOT, '..', 'css');
const COMPONENTS_ROOT = path.join(ROOT, 'components');

/** Elements whose content the user has to be able to select and copy. */
const SELECTABLE = ['input', 'textarea', '[contenteditable]', 'pre', 'code'];

/**
 * List every file under `dir` with the given extension, recursively.
 * @param {string} dir
 * @param {string} ext
 * @returns {string[]} absolute paths
 */
function listFiles(dir, ext) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...listFiles(full, ext));
        } else if (entry.name.endsWith(ext)) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Whether a LitElement source renders into the light DOM.
 *
 * Lit puts a component in a shadow root unless `createRenderRoot()` hands back the
 * host, so the absence of that override IS the shadow-DOM case.
 *
 * The method signature has to be part of the match. Several components name
 * `createRenderRoot` in their file header ("Uses light DOM (createRenderRoot
 * override)…"), so a search anchored on the first mention lands in the doc comment
 * and reports a light-DOM component as living in a shadow root.
 *
 * @param {string} src - File contents.
 * @returns {boolean}
 */
function rendersInLightDom(src) {
    return /createRenderRoot\s*\([^)]*\)\s*\{[^}]*return\s+this\s*;/.test(src);
}

/**
 * Drop every CSS comment.
 *
 * This has to happen before anything looks for a rule. The blocks these guards
 * watch over are heavily commented, and the prose quotes CSS back at the reader
 * (`.xterm { user-select: none }`): read braces-and-all, a comment line reads as a
 * selector and the whole extraction slides one rule sideways.
 *
 * @param {string} src - Stylesheet contents.
 * @returns {string} the same source with comments blanked out
 */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Return the declarations of a top-level rule.
 *
 * @param {string} src - Stylesheet contents, comments already stripped.
 * @param {string} selector - Selector as written at the start of a line.
 * @returns {string} the block body
 */
function ruleBody(src, selector) {
    const open = src.indexOf(`\n${selector} {`);
    if (open === -1) throw new Error(`no top-level rule for "${selector}"`);
    const close = src.indexOf('}', open);
    if (close === -1) throw new Error(`unterminated rule for "${selector}"`);
    return src.slice(open, close);
}

/**
 * Every selector that turns selection back ON in a stylesheet.
 *
 * @param {string} src - Stylesheet contents, comments already stripped.
 * @returns {string[]} the selectors, as written
 */
function textSelectionSelectors(src) {
    const rules = src.matchAll(/([^{}]+)\{[^{}]*user-select:\s*text/g);
    return [...rules].map((m) => m[1].trim());
}

describe('text selection is off by default', () => {
    const base = stripComments(fs.readFileSync(path.join(CSS_ROOT, 'base.css'), 'utf8'));

    it('turns selection off on body rather than on a list of elements', () => {
        // Naming elements one by one is what the rule replaced: every element added
        // afterwards started out selectable again.
        expect(ruleBody(base, 'body')).toMatch(/user-select:\s*none/);
    });

    it('keeps the -webkit- prefix, since nothing prefixes for us', () => {
        // There is no autoprefixer in the build (no postcss config, no browserslist),
        // and Safari only took the unprefixed property in 17.
        expect(ruleBody(base, 'body')).toMatch(/-webkit-user-select:\s*none/);
    });

    it('also suppresses the iOS long-press callout, which is a separate mechanism', () => {
        // Without this the selection is gone but the "Copy / Look Up" bubble is not.
        expect(ruleBody(base, 'body')).toMatch(/-webkit-touch-callout:\s*none/);
    });

    it('re-enables selection everywhere the user has to copy or type', () => {
        const covered = textSelectionSelectors(base).join(' ');
        for (const selector of SELECTABLE) {
            expect(covered, `${selector} must stay selectable`).toContain(selector);
        }
    });

    it('never grants the exception to .xterm', () => {
        // xterm ships `.xterm { user-select: none }` itself and draws its own
        // selection on the canvas. Handing it the native one back is the conflict it
        // exists to avoid, and the terminal is where a broken selection hurts most.
        for (const file of listFiles(CSS_ROOT, '.css')) {
            const src = stripComments(fs.readFileSync(file, 'utf8'));
            for (const selector of textSelectionSelectors(src)) {
                expect(selector, `${path.relative(CSS_ROOT, file)} re-enables selection on xterm`)
                    .not.toMatch(/\.xterm/);
            }
        }
    });
});

describe('components in a shadow root carry the rule themselves', () => {
    it('declares user-select in every component the body rule cannot reach', () => {
        const escaped = [];

        for (const file of listFiles(COMPONENTS_ROOT, '.js')) {
            if (file.endsWith('.test.js') || file.endsWith('.stories.js')) continue;
            const src = fs.readFileSync(file, 'utf8');
            if (!/extends\s+LitElement/.test(src)) continue;
            if (rendersInLightDom(src)) continue;
            // Shadow root: inheritance stops at the boundary, so the component has to
            // say it. A new one that forgets shows up here rather than on screen.
            if (!/user-select\s*:/.test(src)) escaped.push(path.relative(ROOT, file));
        }

        expect(escaped).toEqual([]);
    });
});
