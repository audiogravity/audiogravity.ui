/**
 * Regression guards for the mobile anti-zoom contract (site#6).
 *
 * Mobile Safari zooms the page in whenever it focuses a form control whose
 * font-size is under 16px. base.css raises every text field to 16px on a touch
 * device, but that rule has two known escape routes, and both have already been
 * taken in production:
 *
 *   1. an inline `style` attribute, which outranks every selector no matter its
 *      specificity — the password-confirm field carried one, so the update
 *      dialog zoomed and its Confirm button left the screen;
 *   2. a width breakpoint, which the earlier `width <= 768px` gate used — it
 *      left every field zooming on a phone in landscape and on tablets.
 *
 * Neither is visible in a rendering test, so they are asserted against the
 * sources directly, in the manner of component-imports.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const JS_ROOT = ROOT;
const CSS_ROOT = path.join(ROOT, '..', 'css');

/** Form controls that take text, and therefore trigger the zoom. */
const TEXT_FIELD_TAGS = new Set(['input', 'select', 'textarea']);

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
 * Find inline `style` attributes that set a font-size on a text field.
 *
 * The owning tag is resolved by scanning BACK to the nearest `<`, rather than
 * matching forward with `[^>]*`: a Lit template attribute can hold an arrow
 * function, whose `=>` would end a forward match early and hide the very
 * declaration this guard is looking for.
 *
 * @param {string} src - File contents.
 * @returns {string[]} the offending style attribute values
 */
function inlineFontSizesOnFields(src) {
    const found = [];
    for (const m of src.matchAll(/style\s*=\s*"([^"]*)"/g)) {
        if (!/font-size/.test(m[1])) continue;
        const opener = src.lastIndexOf('<', m.index);
        if (opener === -1) continue;
        const tag = src.slice(opener + 1).match(/^\s*([a-zA-Z][\w-]*)/);
        if (tag && TEXT_FIELD_TAGS.has(tag[1].toLowerCase())) found.push(m[1]);
    }
    return found;
}

describe('mobile anti-zoom contract', () => {
    it('sets no font-size inline on a text field anywhere in js/', () => {
        const offenders = [];
        for (const file of listFiles(JS_ROOT, '.js')) {
            if (file.endsWith('.test.js') || file.endsWith('.stories.js')) continue;
            for (const style of inlineFontSizesOnFields(fs.readFileSync(file, 'utf8'))) {
                offenders.push(`${path.relative(JS_ROOT, file)} → ${style}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('gates the anti-zoom rule on the pointer, not on a width breakpoint', () => {
        const base = fs.readFileSync(path.join(CSS_ROOT, 'base.css'), 'utf8');
        const block = base.slice(base.indexOf('@media (pointer: coarse)'));

        expect(base).toContain('@media (pointer: coarse)');
        // The rule must cover text fields at the full 16px, checkboxes excluded.
        expect(block).toMatch(/input:not\(\[type="checkbox"\]\)/);
        expect(block).toMatch(/font-size:\s*16px/);
    });

    it('keeps the anti-zoom selector specific enough to win against component overrides', () => {
        const base = fs.readFileSync(path.join(CSS_ROOT, 'base.css'), 'utf8');
        // Three chained :not() lift the selector to (0,3,1); the list form
        // :not(a, b, c) would collapse it back to (0,1,1) and lose the tie.
        expect(base).toMatch(
            /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\)/,
        );
    });
});
