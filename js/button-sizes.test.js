/**
 * @file One size for every compact button, declared once.
 *
 * The tiles' buttons, the filters, the badges that are buttons in a tab's title and both
 * systems' `.compact` buttons stood at 18, 20 and 24px, with three paddings and two
 * weights. The user chose one size (2026-10-06, after trying 20, 22 and 24px), measured
 * identical in Chromium on a phone and a computer, property by property. The selectors
 * that act as filters followed (2026-10-08, 18 to 28px), then the small text actions and
 * the queue's Refresh and Clear, words of 12px in a line of text.
 *
 * Each family first restated the box in its own file — 16 copies, held together by this
 * test. The box is now one rule of components/button.css listing every family; a family
 * keeps its colours and layout and none of the seven declarations, so that none can drift.
 * Measured before and after that clean-up: 1721 buttons, property by property, identical.
 * jsdom lays nothing out, so this reads the declarations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readStylesheet, cssRuleBody, openingTags, selectorList, appSources } from './test-utils.js';

/** The pipeline diagram's styles live in its component, in a shadow root. */
const PIPELINE = ['js', 'components', 'organisms', 'ag-audio-pipeline.js'];

/** The compact box: its seven declarations, as the shared rule writes them. */
const BOX = [
    /(?:^|[;\s])height:\s*var\(--button-height-compact\)/,
    /(?:^|[;\s])padding:\s*0 var\(--spacing-sm\)/,
    /font-size:\s*var\(--font-size-xs\)/,
    /font-weight:\s*600/,
    /letter-spacing:\s*0\.3px/,
    /line-height:\s*normal/,
    /border-radius:\s*var\(--radius-xs\)/,
];

/** Any of the seven, declared: a family that writes one drifts from the box. */
const BOX_PROPERTY = /(?:^|[;\s])(height|padding(?:-[a-z]+)?|font-size|font-weight|letter-spacing|line-height|border-radius)\s*:/;

/**
 * [what, selector in the shared rule, stylesheet of the family's own rules, the selectors
 * of those rules that must declare none of the box]
 */
const FAMILIES = [
    ['the tiles\' buttons', '.tile-action-btn', ['css', 'components', 'button.css'], ['.tile-action-btn']],
    ['the panels\' compact buttons', '.btn-action', ['css', 'components', 'button.css'], ['.btn-action']],
    ['the .action-btn compact buttons', '.action-btn.compact', ['css', 'components', 'button.css'], ['.action-btn.compact']],
    ['the filters', '.filter-btn', ['css', 'components', 'filter-bar.css'], ['.filter-btn']],
    ['the badges that are buttons in a tab\'s title', '.tab-zone .tab-title-container button.badge', ['css', 'components', 'tab-zone.css'], ['.tab-zone .tab-title-container button.badge']],
    ['a clickable badge — the user card\'s Enabled / Disabled', 'ag-badge button.badge', ['css', 'components', 'badge.css'], ['ag-badge button.badge']],
    ['Library › Browse\'s pills', '.lib-pill', ['css', 'components', 'library-album-card.css'], ['.lib-pill']],
    ['Library › Search\'s sources', '.lib-src-badge', ['css', 'components', 'library-search.css'], ['.lib-src-badge']],
    ['Library › Radio\'s views, and its form\'s Cancel and Save', '.lib-radio-tab', ['css', 'components', 'library-radio.css'], ['.lib-radio-tab']],
    ['Library › Radio\'s + Add custom station', '.lib-radio-add-btn', ['css', 'components', 'library-radio.css'], ['.lib-radio-add-btn']],
    ['the queue\'s Refresh and Clear', '.lib-queue-action', ['css', 'components', 'library-queue.css'], ['.lib-queue-action']],
    ['System\'s RUNNING / STOPPED of the events', '.event-toggle-btn.compact', ['css', 'system.css'], ['.event-toggle-btn', '.event-toggle-btn.compact']],
    ['the log\'s refresh and Live', '.log-btn', ['css', 'system.css'], ['.log-btn']],
];

/** [what, stylesheet path, selector] of the buttons that hold one letter or one icon. */
const SQUARES = [
    ['the log\'s levels', ['css', 'system.css'], '.log-filter-btn'],
    ['the pipeline diagram\'s icon buttons', PIPELINE, '.zoom-btn--icon'],
];

/**
 * The rules of a stylesheet, comments out: each with its selectors and its declarations.
 * @param {string} css
 * @returns {{selectors: string[], body: string}[]}
 */
const rulesOf = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, list, body]) => ({ selectors: selectorList(list), body }));

/** The shared rule: the one of button.css that lists the filters. */
const SHARED = rulesOf(readStylesheet('css', 'components', 'button.css')).find((r) => r.selectors.includes('.filter-btn'));

describe('the compact buttons', () => {
    it('take their one height from a single token of the theme', () => {
        const themes = readStylesheet('css', 'themes.css');
        expect(themes.match(/--button-height-compact:/g)).toHaveLength(1);
        expect(themes).toMatch(/--button-height-compact:\s*24px;/);
    });

    it('share one box, declared once in components/button.css: height, padding, 11px type at 600, letter spacing, line height, corners', () => {
        expect(SHARED, 'no shared rule').toBeTruthy();
        for (const declaration of BOX) expect(SHARED.body).toMatch(declaration);
    });

    it('keep their label on one line: the height is fixed, a second line ran out of the frame at 320 and 360px', () => {
        expect(SHARED.body).toMatch(/white-space:\s*nowrap/);
        // A row of filters that cannot hold its labels wraps instead (the queue's sources).
        expect(cssRuleBody(readStylesheet('css', 'components', 'filter-bar.css'), '.filter-bar')).toMatch(/flex-wrap:\s*wrap/);
    });

    it.each(FAMILIES)('— %s — are in that rule, and restate none of it', (_, selector, file, own) => {
        expect(SHARED.selectors).toContain(selector);
        for (const rule of rulesOf(readStylesheet(...file))) {
            if (rule === SHARED || rule.body === SHARED.body) continue;
            if (!rule.selectors.some((s) => own.includes(s))) continue;
            expect(rule.body, `${rule.selectors.join(', ')} restates the box`).not.toMatch(BOX_PROPERTY);
        }
    });
});

describe('the chosen one of a row of selectors', () => {
    /** The family selectors of the chosen state, and the file of each family's own rules. */
    const CHOSEN = [
        ['.filter-btn.active', ['css', 'components', 'filter-bar.css']],
        ['.lib-pill.on', ['css', 'components', 'library-album-card.css']],
        ['.lib-src-badge.active', ['css', 'components', 'library-search.css']],
        ['.lib-radio-tab.on', ['css', 'components', 'library-radio.css']],
    ];
    const chosen = rulesOf(readStylesheet('css', 'components', 'button.css'))
        .find((r) => r.selectors.some((s) => s.includes('.filter-btn.active')));

    it('is filled with the text colour, in one rule for every row — the filters showed it in light grey', () => {
        expect(chosen, 'no shared rule for the chosen selector').toBeTruthy();
        expect(chosen.body).toMatch(/background:\s*var\(--text-primary\)/);
        expect(chosen.body).toMatch(/(?:^|[;\s])color:\s*var\(--bg-primary\)/);
        expect(chosen.body).toMatch(/border-color:\s*var\(--text-primary\)/);
    });

    it('keeps its label light under the mouse: a family\'s :hover would darken it into the fill', () => {
        expect(chosen.selectors.some((s) => s.endsWith(':hover'))).toBe(true);
    });

    it.each(CHOSEN)('— %s — is in that rule, at rest and under the mouse, and no rule of its family paints it again', (selector, file) => {
        const atRest = chosen.selectors.filter((s) => !s.endsWith(':hover'));
        const hovered = chosen.selectors.filter((s) => s.endsWith(':hover'));
        expect(atRest.join(' '), 'at rest').toContain(selector);
        expect(hovered.join(' '), 'under the mouse').toContain(selector);
        for (const rule of rulesOf(readStylesheet(...file))) {
            if (!rule.selectors.some((s) => s.includes(selector))) continue;
            expect(rule.body, `${rule.selectors.join(', ')} paints the chosen state`).not.toMatch(/(?:^|[;\s])(background|color|border-color)\s*:/);
        }
    });
});

describe('what the clean-up took out stays out', () => {
    const button = readStylesheet('css', 'components', 'button.css');

    it('the tiles\' alias has no copy of its own of the base, hover and disabled rules: it shares .btn-action\'s', () => {
        for (const rule of rulesOf(button)) {
            const alone = rule.selectors.some((s) => /^\.tile-action-btn(?::hover|:disabled)?$/.test(s))
                && !rule.selectors.some((s) => s.startsWith('.btn-action'));
            expect(alone, `a rule for the tiles alone: ${rule.selectors.join(', ')}`).toBe(false);
        }
    });

    it('.clear-btn is gone: Clear is an .action-btn, whose look it copied', () => {
        expect(button).not.toMatch(/\.clear-btn\b/);
        for (const file of appSources()) expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bclear-btn\b/);
    });

    it('no variant that no button wears: --error, .info, .ghost', () => {
        expect(button).not.toMatch(/\.btn-action--error|\.btn-action\.info|\.btn-action\.ghost/);
    });

    it('the footer of a dialog is drawn once, in modal.css', () => {
        expect(cssRuleBody(readStylesheet('css', 'systemd.css'), '.modal-footer')).toBeNull();
        expect(cssRuleBody(readStylesheet('css', 'components', 'modal.css'), '.modal-footer')).toBeTruthy();
    });

    it('no rule for the tab bar\'s stats button, which no screen renders', () => {
        expect(readStylesheet('css', 'layout.css')).not.toMatch(/tabs-stats-btn/);
    });
});

describe('a dialog\'s buttons', () => {
    const body = cssRuleBody(readStylesheet('css', 'components', 'button.css'), '.modal-footer :is(.action-btn, .btn-action, .tile-action-btn):not(.compact)');

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
            const group = openingTags(source).find((t, i, all) => /class="control-group\b/.test(t) && /RESET|_resetLayout/.test(all[i + 1] ?? ''));
            expect(group).toMatch(/\bcontrol-group--grid\b/);
            expect(cssRuleBody(source, '.control-group--grid')).toMatch(/display:\s*grid;\s*grid-template-columns:\s*1fr 1fr/);
        });

        it('fold away with the panel: no group sets its display in a style attribute, which outranks the collapsed rule', () => {
            expect(cssRuleBody(source, '.controls.collapsed .control-group')).toMatch(/display:\s*none/);
            for (const tag of openingTags(source).filter((t) => /class="control-group\b/.test(t))) {
                expect(tag).not.toMatch(/style=/);
            }
        });

        it('rule their sections in the theme\'s border colour — white at 10 % did not show in a light theme', () => {
            expect(cssRuleBody(source, '.control-group--ruled')).toMatch(/border-top:\s*1px solid var\(--border-color\)/);
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
