/**
 * One declaration per layout token per screen width.
 *
 * themes.css and layout.css both redefined --topbar-height, --tabs-height and
 * --title-bar-height for the same breakpoint (width <= 768px). layout.css is imported
 * after themes.css, so its values won and the others never applied: themes.css said the
 * top bar was 46px on a phone, a browser computed 44. Nothing reported the disagreement —
 * a dead custom property is not an error — and every calculation made by reading the
 * wrong file came out two pixels off. Measured in a real browser before the dead values
 * were removed, and again after: identical at phone, landscape and desktop widths.
 *
 * Read from the source on purpose: the defect is two files declaring the same thing, which
 * a rendered page cannot show, since only one of them ever takes effect.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'css');
const THEMES = fs.readFileSync(path.join(CSS, 'themes.css'), 'utf8');
const LAYOUT = fs.readFileSync(path.join(CSS, 'layout.css'), 'utf8');

/** The layout dimensions that must have a single owner at each width. */
const DIMENSIONS = ['--topbar-height', '--tabs-height', '--title-bar-height', '--footer-height'];

/**
 * Tokens declared inside the first `@media (width <= 768px)` block of a stylesheet, with
 * or without the space the two files happen to spell differently.
 * @param {string} css
 * @returns {Set<string>}
 */
function declaredAtPhoneWidth(css) {
    const start = css.search(/@media\s*\(width\s*<=\s*768px\)\s*\{/);
    if (start < 0) return new Set();
    // Walk to the matching brace: the block nests a :root rule in layout.css.
    let depth = 0;
    let end = start;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) { end = i; break; }
    }
    const block = css.slice(start, end);
    return new Set(DIMENSIONS.filter(t => new RegExp(`${t}\\s*:`).test(block)));
}

describe('layout dimensions have one owner at phone width', () => {
    it('finds the phone-width values where they actually apply', () => {
        // layout.css is imported after themes.css: its block is the one that renders.
        const live = declaredAtPhoneWidth(LAYOUT);
        expect([...live].sort(), 'layout.css ne déclare plus les dimensions mobiles')
            .toEqual([...DIMENSIONS].sort());
    });

    it('does not declare them a second time in themes.css', () => {
        const dead = [...declaredAtPhoneWidth(THEMES)].filter(t => declaredAtPhoneWidth(LAYOUT).has(t));
        expect(dead, `déclarés dans themes.css ET layout.css pour la même largeur — ` +
            `ceux de themes.css ne s'appliquent jamais :\n  ${dead.join('\n  ')}`).toEqual([]);
    });
});
