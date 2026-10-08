/**
 * @file One size for every compact button.
 *
 * The tiles' buttons, the filters, the badges that are buttons in a tab's title and both
 * systems' `.compact` buttons stood at 18, 20 and 24px, with three paddings and two
 * weights. The user chose one size (2026-10-06, after trying 20, 22 and 24px), measured
 * identical in Chromium on a phone and a computer, property by property. jsdom lays
 * nothing out, so this reads the declarations: one family drifting on its own is what
 * the inventory found.
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, cssRuleBody } from './test-utils.js';

/** [what, stylesheet path, selector of the rule that sizes it] */
const BUTTONS = [
    ['the tiles\' buttons', ['css', 'components', 'button.css'], '.tile-action-btn'],
    ['both systems\' compact buttons', ['css', 'components', 'button.css'], '.btn-action.compact'],
    ['the filters', ['css', 'components', 'filter-bar.css'], '.filter-btn'],
    ['the badges that are buttons in a tab\'s title', ['css', 'components', 'tab-zone.css'], '.tab-zone .tab-title-container button.badge'],
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
