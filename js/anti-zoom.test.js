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

/**
 * Inter's own x-height / font-size ratio, measured on an iPhone against the very
 * file the app ships (fonts/inter-latin.woff2). It is the divisor in
 * `used_size = declared * adjust / ratio`, so it is what ties the adjust values in
 * base.css to a size in pixels. Re-measure it if the font file is ever swapped.
 */
const INTER_X_HEIGHT_RATIO = 0.546;

/** The declared size the fields keep, so that Safari never zooms. @type {number} */
const DECLARED_PX = 16;

/**
 * Read a font-size token off a CSS custom-property declaration.
 * @param {string} src - Stylesheet contents.
 * @param {string} name - Token name, e.g. '--font-size-sm'.
 * @param {number} [nth=0] - Which occurrence: 0 is :root, later ones are overrides.
 * @returns {number} the value in px
 */
function tokenPx(src, name, nth = 0) {
    const hits = [...src.matchAll(new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`, 'g'))];
    if (!hits[nth]) throw new Error(`${name} occurrence ${nth} not found`);
    return Number(hits[nth][1]);
}

/**
 * Read the `font-size-adjust` values declared inside the coarse-pointer block.
 * @param {string} base - base.css contents.
 * @returns {number[]} values in source order: default first, compact-mode second
 */
function adjustValues(base) {
    const block = base.slice(base.indexOf('@media (pointer: coarse)'));
    return [...block.matchAll(/font-size-adjust:\s*(\d*\.\d+)/g)].map((m) => Number(m[1]));
}

/**
 * The field is declared at 16px so Safari leaves the page alone, then drawn back down
 * to the size of its own label. Safari's heuristic reads the declared size, not the
 * painted one — confirmed on device: declared 16px / painted 13.00px takes focus
 * without zooming, a plain 13px field zooms.
 *
 * These guards exist because the two numbers in base.css are derived, not chosen:
 * they encode Inter's metrics AND the label step. Editing --font-size-sm, or the font
 * file, without recomputing them would resize every field in the app and nothing on
 * screen would say why.
 */
describe('field size tracks its label on touch', () => {
    const base = fs.readFileSync(path.join(CSS_ROOT, 'base.css'), 'utf8');
    const themes = fs.readFileSync(path.join(CSS_ROOT, 'themes.css'), 'utf8');

    it('draws the field at the label step rather than leaving it at 16px', () => {
        const [adjust] = adjustValues(base);
        expect(adjust).toBeDefined();

        const painted = (DECLARED_PX * adjust) / INTER_X_HEIGHT_RATIO;
        // --font-size-sm is what every form label in the app uses.
        expect(painted).toBeCloseTo(tokenPx(themes, '--font-size-sm'), 1);
    });

    it('follows the label down when compact mode shrinks the scale', () => {
        const [, compact] = adjustValues(base);
        expect(compact).toBeDefined();

        const painted = (DECLARED_PX * compact) / INTER_X_HEIGHT_RATIO;
        // Second occurrence: the body.compact-mode override in themes.css.
        expect(painted).toBeCloseTo(tokenPx(themes, '--font-size-sm', 1), 1);
    });

    it('leaves dropdowns out of the anti-zoom rule entirely', () => {
        // Measured on an iPhone: a select declared at a plain 13px takes focus
        // without zooming — it opens a picker wheel, not a keyboard. Forcing it to
        // 16px only broke its size, worst on the HQPlayer DSP card where 11px lists
        // sat next to 10px labels. Re-adding `select` here would bring that back.
        const block = base.slice(base.indexOf('@media (pointer: coarse)'));
        expect(block).not.toMatch(/^\s*select\s*,?\s*$/m);
        expect(block).not.toMatch(/body\.compact-mode select/);
    });

    it('never lets the drawn size reach the 16px the declaration claims', () => {
        // A value that cancelled the shrink would silently restore the mismatch the
        // whole rule exists to remove, while still passing a "does it zoom" check.
        for (const adjust of adjustValues(base)) {
            expect((DECLARED_PX * adjust) / INTER_X_HEIGHT_RATIO).toBeLessThan(DECLARED_PX);
        }
    });
});
