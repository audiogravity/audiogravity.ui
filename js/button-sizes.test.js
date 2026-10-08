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
 * 28px, measured the same way after the change. Then the small text actions, the same day:
 * Add custom station, the events' RUNNING / STOPPED, the history panels' Clear, the log's
 * refresh and Live, a clickable badge — 18 to 26px. And the queue's Refresh and Clear,
 * which were words of 12px in a line of text.
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
    ['Library › Radio\'s + Add custom station', ['css', 'components', 'library-radio.css'], '.lib-radio-add-btn'],
    ['System\'s RUNNING / STOPPED of the events', ['css', 'system.css'], '.event-toggle-btn.compact'],
    ['the log\'s refresh and Live', ['css', 'system.css'], '.log-btn'],
    ['a clickable badge — the user card\'s Enabled / Disabled', ['css', 'components', 'badge.css'], 'ag-badge button.badge'],
    ['the queue\'s Refresh and Clear', ['css', 'components', 'library-queue.css'], '.lib-queue-action'],
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

    it('size the three systems\' compact buttons in one rule — Clear of the history panels with them', () => {
        const button = readStylesheet('css', 'components', 'button.css');
        expect(button).toMatch(/\.action-btn\.compact,\s*\.clear-btn\.compact,\s*\.btn-action\.compact\s*\{/);
        // A rule of its own, later in the file, would win over the shared one.
        expect(cssRuleBody(button, '.clear-btn.compact')).toBeNull();
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
        ['+ Add custom station', ['css', 'components', 'library-radio.css'], '.lib-radio-add-btn'],
        ['RUNNING / STOPPED', ['css', 'system.css'], '.event-toggle-btn'],
        ['the log\'s refresh and Live', ['css', 'system.css'], '.log-btn'],
        ['a clickable badge', ['css', 'components', 'badge.css'], 'ag-badge button.badge'],
        ['the queue\'s Refresh and Clear', ['css', 'components', 'library-queue.css'], '.lib-queue-action'],
    ])('— %s — weigh 600: they were 400, 500, 600 and 700', (_, file, selector) => {
            expect(cssRuleBody(readStylesheet(...file), selector)).toMatch(/font-weight:\s*600/);
        });
});

describe('a dialog\'s buttons', () => {
    const body = cssRuleBody(readStylesheet('css', 'components', 'button.css'), '.modal-footer :is(.action-btn, .btn-action):not(.compact)');

    it('take their one height from a single token of the theme: 29px', () => {
        const themes = readStylesheet('css', 'themes.css');
        expect(themes.match(/--button-height-medium:/g)).toHaveLength(1);
        expect(themes).toMatch(/--button-height-medium:\s*29px;/);
    });

    it('share one box, both systems: height, padding, 12px type at 600, letter spacing, corners', () => {
        expect(body, 'no rule for a dialog\'s buttons').toBeTruthy();
        expect(body).toMatch(/(?:^|[;\s])height:\s*var\(--button-height-medium\)/);
        expect(body).toMatch(/padding:\s*0 var\(--spacing-md\)/);
        expect(body).toMatch(/font-size:\s*var\(--font-size-sm\)/);
        expect(body).toMatch(/font-weight:\s*600/);
        expect(body).toMatch(/letter-spacing:\s*0\.3px/);
        expect(body).toMatch(/border-radius:\s*var\(--radius-xs\)/);
    });

    it('stay at 29px on a phone: the touch rule\'s 44px is undone (user\'s cap)', () => {
        expect(body).toMatch(/min-height:\s*0/);
        expect(body).toMatch(/min-width:\s*0/);
    });
});

describe('a radio station\'s Edit and Remove', () => {
    it('keep the compact padding: no rule of the Radio view widens it again', () => {
        // It set 12px sides when the pair stood 44px tall; on a compact button it would
        // win over the shared box, being read later.
        expect(cssRuleBody(readStylesheet('css', 'components', 'library-radio.css'), '.lib-radio-more-actions .action-btn')).toBeNull();
    });
});

describe('the queue\'s Refresh and Clear', () => {
    it('are framed as the source filters below them: they were words in a line of text', () => {
        const body = cssRuleBody(readStylesheet('css', 'components', 'library-queue.css'), '.lib-queue-action');
        expect(body).toMatch(/border:\s*1px solid var\(--border-color\)/);
        expect(body).not.toMatch(/border:\s*0/);
    });

    it('stand beside the track count with no dot between them', () => {
        const source = readStylesheet('js', 'components', 'organisms', 'ag-library-queue.js');
        const start = source.indexOf('<span class="lib-queue-total">');
        const total = source.slice(start, source.indexOf('</span>', start));
        expect(total).toMatch(/lib-queue-action/);
        expect(total).not.toMatch(/·/);
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
