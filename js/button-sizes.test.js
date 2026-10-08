/**
 * @file One size for every compact button.
 *
 * The tiles' buttons, the filters, the badges that are buttons in a tab's title and both
 * systems' `.compact` buttons stood at 18, 20 and 24px, with three paddings and two
 * weights. The user chose one size (2026-10-06, after trying 20, 22 and 24px), measured
 * identical in Chromium on a phone and a computer, property by property. jsdom lays
 * nothing out, so this reads the declarations: one family drifting on its own is what
 * the inventory found.
 *
 * The selectors that act as filters followed (2026-10-08): they stood at 18, 20, 26 and
 * 28px, measured the same way after the change.
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, cssRuleBody, openingTags } from './test-utils.js';

/** The pipeline diagram's styles live in its component, in a shadow root. */
const PIPELINE = ['js', 'components', 'organisms', 'ag-audio-pipeline.js'];

/** [what, stylesheet path, selector of the rule that sizes it] */
const BUTTONS = [
    ['the tiles\' buttons', ['css', 'components', 'button.css'], '.tile-action-btn'],
    ['both systems\' compact buttons', ['css', 'components', 'button.css'], '.btn-action.compact'],
    ['the filters', ['css', 'components', 'filter-bar.css'], '.filter-btn'],
    ['the badges that are buttons in a tab\'s title', ['css', 'components', 'tab-zone.css'], '.tab-zone .tab-title-container button.badge'],
    ['Library › Browse\'s pills', ['css', 'components', 'library-album-card.css'], '.lib-pill'],
    ['Library › Search\'s sources', ['css', 'components', 'library-search.css'], '.lib-src-badge'],
    ['Library › Radio\'s views, and its form\'s Cancel and Save', ['css', 'components', 'library-radio.css'], '.lib-radio-tab'],
];

/** [what, stylesheet path, selector] of the buttons that hold one letter or one icon. */
const SQUARES = [
    ['the log\'s levels', ['css', 'system.css'], '.log-filter-btn'],
    ['the pipeline diagram\'s icon buttons', PIPELINE, '.zoom-btn--icon'],
];

describe('the compact buttons', () => {
    it('take their one height from a single token of the theme', () => {
        const themes = readStylesheet('css', 'themes.css');
        expect(themes.match(/--button-height-compact:/g)).toHaveLength(1);
        expect(themes).toMatch(/--button-height-compact:\s*24px;/);
    });

    it.each(BUTTONS)('— %s — share one box: height, padding, type size, letter spacing, corners', (_, file, selector) => {
        const body = cssRuleBody(readStylesheet(...file), selector);
        expect(body, `no rule for ${selector}`).toBeTruthy();
        expect(body).toMatch(/height:\s*var\(--button-height-compact\)/);
        expect(body).toMatch(/padding:\s*0 var\(--spacing-sm\)/);
        expect(body).toMatch(/font-size:\s*var\(--font-size-xs\)/);
        expect(body).toMatch(/letter-spacing:\s*0\.3px/);
        expect(body).toMatch(/border-radius:\s*var\(--radius-xs\)/);
    });

    it('size both systems\' compact buttons in one rule', () => {
        expect(readStylesheet('css', 'components', 'button.css'))
            .toMatch(/\.action-btn\.compact,\s*\.btn-action\.compact\s*\{/);
    });

    it('weigh 600 — .action-btn.compact was 500', () => {
        const button = readStylesheet('css', 'components', 'button.css');
        expect(cssRuleBody(button, '.tile-action-btn')).toMatch(/font-weight:\s*600/);
        expect(cssRuleBody(button, '.btn-action.compact')).toMatch(/font-weight:\s*600/);
        expect(cssRuleBody(readStylesheet('css', 'components', 'filter-bar.css'), '.filter-btn')).toMatch(/font-weight:\s*600/);
        // A title badge's weight comes from the rule every title badge shares.
        expect(cssRuleBody(readStylesheet('css', 'components', 'tab-zone.css'), '.tab-zone .tab-title-container .badge'))
            .toMatch(/font-weight:\s*600/);
    });

    it.each([
        ['Library\'s pills, sources and Radio views', ['css', 'components', 'library-album-card.css'], '.lib-pill'],
        ['Library\'s pills, sources and Radio views', ['css', 'components', 'library-search.css'], '.lib-src-badge'],
        ['Library\'s pills, sources and Radio views', ['css', 'components', 'library-radio.css'], '.lib-radio-tab'],
        ['the log\'s levels', ['css', 'system.css'], '.log-filter-btn'],
        ['the pipeline diagram\'s buttons', PIPELINE, '.zoom-btn'],
    ])('— %s — weigh 600: they were 400, 600 and 700', (_, file, selector) => {
            expect(cssRuleBody(readStylesheet(...file), selector)).toMatch(/font-weight:\s*600/);
        });
});

describe('the selectors that act as filters', () => {
    it.each(SQUARES)('— %s — are squares as tall as a compact button, in its type', (_, file, selector) => {
        const body = cssRuleBody(readStylesheet(...file), selector);
        expect(body, `no rule for ${selector}`).toBeTruthy();
        expect(body).toMatch(/(?:^|[;\s])width:\s*var\(--button-height-compact\)/);
        expect(body).toMatch(/padding:\s*0;/);
        if (selector === '.log-filter-btn') {
            expect(body).toMatch(/(?:^|[;\s])height:\s*var\(--button-height-compact\)/);
            expect(body).toMatch(/font-size:\s*var\(--font-size-xs\)/);
        }
    });

    describe('the pipeline diagram\'s buttons', () => {
        const source = readStylesheet(...PIPELINE);
        const body = cssRuleBody(source, '.zoom-btn');

        it('take the compact box — the corners stay the diagram\'s own', () => {
            expect(body).toMatch(/height:\s*var\(--button-height-compact\)/);
            expect(body).toMatch(/padding:\s*0 var\(--spacing-sm\)/);
            expect(body).toMatch(/font-size:\s*var\(--font-size-xs\)/);
            expect(body).toMatch(/letter-spacing:\s*0\.3px/);
            expect(body).toMatch(/border-radius:\s*var\(--radius-pipeline\)/);
        });

        it('name the app\'s face: in a shadow root a button gets the browser\'s (Arial, measured)', () => {
            expect(body).toMatch(/font-family:\s*var\(--font-family\)/);
        });

        it('carry no type of their own in the template: a style attribute beats the rule', () => {
            const tags = openingTags(source).filter((t) => /class="zoom-btn\b/.test(t));
            expect(tags.length).toBeGreaterThanOrEqual(8);
            for (const tag of tags) expect(tag).not.toMatch(/font-(?:size|weight)/);
        });

        it('lay RESET, LEGEND, MINIMAP and NETWORK on a grid: as wrapped flex items they widened the panel to 272px', () => {
            const group = openingTags(source).find((t, i, all) => /class="control-group"/.test(t) && /RESET|_resetLayout/.test(all[i + 1] ?? ''));
            expect(group).toMatch(/display:\s*grid;\s*grid-template-columns:\s*1fr 1fr/);
        });
    });
});

describe('what sits beside a compact button', () => {
    it('keeps its height: the Config tile\'s download icon, square', () => {
        expect(cssRuleBody(readStylesheet('css', 'config.css'), '.tile-action-btn--icon'))
            .toMatch(/min-width:\s*var\(--button-height-compact\)/);
    });

    it('keeps its height: the Services tile\'s start-at-boot badge, in the row of its buttons', () => {
        expect(cssRuleBody(readStylesheet('css', 'services.css'), '.service-enabled-badge'))
            .toMatch(/height:\s*var\(--button-height-compact\)/);
    });

    it('keeps its box: the network test\'s service state, beside its START button', () => {
        const body = cssRuleBody(readStylesheet('css', 'performance.css'), '.service-status-badge');
        expect(body).toMatch(/height:\s*var\(--button-height-compact\)/);
        expect(body).toMatch(/padding:\s*0 var\(--spacing-sm\)/);
    });
});
