/**
 * The Pro tint — one tint, from the brand colour, on every surface the Pro edition locks.
 *
 * The locked tabs wore a rosy tint of the error colour, all but invisible on a near-black
 * bar (1.07:1 in Minimal and Gravity dark, measured 2026-10-15), and the locked source cards
 * wore none. Red, orange and green carry a meaning that holds only while they stay rare
 * (audiogravity.design/UI_GUIDELINES.md rule 10): the surfaces Pro locks share one tint
 * taken from --accent-primary instead, deeper in the dark variants where a light dose
 * vanishes.
 *
 * Covers:
 * 1. the tint is the brand colour's, never a state colour, and the dark variants raise it
 * 2. each surface the Pro edition locks wears it: tab, Pro source card, source card, Config tile,
 *    search chip, output card — and the chip's padlock is not glued to its name
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, cssRuleBody } from './test-utils.js';

const THEMES = readStylesheet('css', 'themes.css');
const STATE_COLOURS = /--color-(error|warning|success)/;

/** The percentage the `--pro-tint` token gives the brand colour, in one rule body. */
function dose(body, token = '--pro-tint') {
    const m = new RegExp(`${token}:\\s*color-mix\\(in srgb, var\\(--accent-primary\\) (\\d+)%`).exec(body ?? '');
    return m ? Number(m[1]) : null;
}

describe('the Pro tint', () => {
    it('is taken from the brand colour, on a light surface and on a dark one', () => {
        const light = cssRuleBody(THEMES, 'body');      // the shared `:root, body` block
        const dark = cssRuleBody(THEMES, 'body.dark-mode');
        expect(dose(light)).toBe(8);
        expect(dose(dark)).toBe(16);
        expect(dose(light, '--pro-tint-hover')).toBeGreaterThan(dose(light));
        expect(dose(dark, '--pro-tint-hover')).toBeGreaterThan(dose(dark));
    });

    it('takes no state colour', () => {
        const lines = THEMES.split('\n').filter((l) => /--pro-tint(-hover)?:/.test(l));
        expect(lines.length).toBe(4);
        for (const line of lines) expect(line).not.toMatch(STATE_COLOURS);
    });
});

describe('the surfaces the Pro edition locks wear it', () => {
    it.each([
        ['a locked tab', ['layout.css'], '.tab-btn--locked'],
        ['the card standing in for a Pro feature', ['components', 'pro-lock.css'], '.pro-lock-card'],
        ["a Pro source's own card", ['components', 'library-sources.css'], '.lib-src-card.lib-src-card--locked'],
        ['a locked Config tile', ['components', 'tile.css'], '.config-tile.config-tile--locked'],
        ["a Pro source's chip in the search", ['components', 'library-search.css'], '.lib-src-badge.lib-src-badge--locked'],
        ['an output a Starter box cannot switch to', ['components', 'library-outputs.css'], '.lib-out-card.lib-out-card--locked'],
    ])('%s', (_, file, selector) => {
        const body = cssRuleBody(readStylesheet('css', ...file), selector);
        expect(body, selector).toMatch(/var\(--pro-tint\)/);
        expect(body).not.toMatch(STATE_COLOURS);
    });

    it('deepens on hover where a tap does something', () => {
        for (const [file, selector] of [[['layout.css'], '.tab-btn--locked:hover'],
                                        [['components', 'pro-lock.css'], '.pro-lock-card:hover'],
                                        [['components', 'library-search.css'], '.lib-src-badge.lib-src-badge--locked:hover'],
                                        [['components', 'library-outputs.css'], '.lib-out-card.lib-out-card--locked:hover']]) {
            expect(cssRuleBody(readStylesheet('css', ...file), selector), selector)
                .toMatch(/var\(--pro-tint-hover\)/);
        }
    });
});

describe('the padlock of a search chip', () => {
    it('keeps off the name: the chip is a flex box, which drops the space before it', () => {
        // "ROON🔒 PRO" on the user's screen (2026-10-15).
        const body = cssRuleBody(readStylesheet('css', 'components', 'library-search.css'), '.lib-src-badge');
        expect(body).toMatch(/gap:\s*var\(--spacing-xs\)/);
    });
});
