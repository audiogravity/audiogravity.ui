/**
 * Every button in the top bar is drawn the same way.
 *
 * The Library button borrowed the generic .icon-btn from components/button.css — 38px,
 * a background, a border and rounded corners, with its icon left at the inherited text
 * size — while the menu and settings buttons beside it are 32px, borderless, and fill
 * their box with the glyph. So the one button in the middle of the bar was drawn in a
 * box, taller than its neighbours, with a small icon inside. It had been that way since
 * the first commit, with nothing recording it as a choice.
 *
 * The fix groups it into the settings button's rule rather than restating that rule, so
 * the two cannot drift apart again. That grouping is what these cases hold in place.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = fs.readFileSync(path.join(ROOT, 'css', 'layout.css'), 'utf8');
const TOPBAR = fs.readFileSync(
    path.join(ROOT, 'js', 'components', 'organisms', 'ag-top-bar.js'), 'utf8');

/** The selector list of the first rule whose selectors include `needle`. */
function selectorsOf(needle) {
    const m = LAYOUT.match(new RegExp(`([^{}]*${needle.replace(/[.*]/g, '\\$&')}[^{}]*)\\{`));
    return m ? m[1].split(',').map(s => s.replace(/\/\*[\s\S]*?\*\//g, '').trim()) : [];
}

describe('the top bar draws all its buttons alike', () => {
    it('still renders the Library button with the generic class', () => {
        // If the markup stops using .icon-btn the grouping below guards nothing, and
        // this case says so instead of passing on an empty premise.
        // Matched on the line, not up to the tag's closing '>': the click handler is an
        // arrow function, and its '=>' ends a [^>]* before the attribute is reached.
        expect(TOPBAR).toMatch(/<button class="icon-btn"[^\n]*aria-label="Open Library"/);
    });

    it('gives it the settings button\'s own rule, not a copy of it', () => {
        expect(selectorsOf('.burger-menu'),
            'le bouton Bibliothèque a de nouveau son propre style dans la barre')
            .toContain('.topbar .icon-btn');
    });

    it('does the same on hover, so it does not fill with a grey box', () => {
        expect(selectorsOf('.burger-menu:hover')).toContain('.topbar .icon-btn:hover');
    });

    it('leaves the footer\'s button alone', () => {
        // Scoped to .topbar on purpose: the footer is the other user of .icon-btn and
        // keeps its framed button. A bare `.icon-btn` in the group would restyle it too.
        expect(selectorsOf('.burger-menu')).not.toContain('.icon-btn');
    });
});
