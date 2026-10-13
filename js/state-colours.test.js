/**
 * Guard: in Minimal, colour marks a state — never an action or a figure at rest.
 *
 * UI guidelines rule 10: red, orange and green carry a meaning that holds only while it
 * stays rare. Measured on 2026-10-13 in Chromium, Minimal showed some twenty green or
 * orange marks at once on Services alone: START and ACTIVATE, a service's 0.0 %, the
 * running share of a health bar, the stripe and tag of a critical service, plain actions
 * written as badges. The user kept the change after a trial on the real screens.
 *
 * The components read a role token whose default, declared once in css/themes.css beside
 * --control-border, is the semantic colour they used to read; only Minimal sets the roles,
 * so Slate and Gravity look as before. The plain actions written as badges come in two
 * variants, green and orange, so they keep a fallback per variant where they are read.
 *
 * What still carries a colour is a state — UP, ENABLED, FAILED, a destructive action's
 * orange — and the orange of what waits on the user: a package's web password to set,
 * its restart.
 *
 * Covers:
 * 1. each rule reads its role, whose default is the semantic colour it had
 * 2. Minimal sets every role in the text colours, and no other theme sets one
 * 3. the components wear the classes these rules read: CRITICAL as .critical-tag on the
 *    three cards, the plain actions as .action-tag
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, cssRules, cssRuleBody, appSources, openingTags } from './test-utils.js';

/** [what, stylesheet, selector as written, property, role, the colour it had — its default] */
const ROLES = [
    ['START, ACTIVATE', 'css/components/button.css', '.tile-action-btn:is(.start, .activate)', 'border-color', '--action-positive', '--color-success'],
    ['their words', 'css/components/button.css', '.tile-action-btn:is(.start, .activate)', 'color', '--action-positive-text', '--color-success-text'],
    ['a confirming button', 'css/components/button.css', '.action-btn.success', 'border-color', '--action-positive', '--color-success'],
    ['its words', 'css/components/button.css', '.action-btn.success', 'color', '--action-positive-text', '--color-success-text'],
    ['a plain action written as a badge', 'css/components/badge.css', '.badge.action-tag.success:is(button, .clickable)', 'border-color', '--action-tag', '--color-success'],
    ['its words', 'css/components/badge.css', '.badge.action-tag.success:is(button, .clickable)', 'color', '--action-tag-text', '--color-success-text'],
    ['the orange one', 'css/components/badge.css', '.badge.action-tag.warning:is(button, .clickable)', 'border-color', '--action-tag', '--color-warning'],
    ['its words', 'css/components/badge.css', '.badge.action-tag.warning:is(button, .clickable)', 'color', '--action-tag-text', '--color-warning-text'],
    ['a service\'s figure at rest', 'css/components/metrics.css', '.metric-value.activity-low', 'color', '--activity-low-text', '--color-success-text'],
    ['the running share of a health bar', 'css/components/health-bar.css', '.health-segment.active', 'background', '--health-running', '--color-success'],
    ['"1 running"', 'css/components/health-bar.css', '.health-count.running', 'color', '--health-running-text', '--color-success-text'],
    ['the stripe of a critical service', 'css/components/tile.css', '.config-tile.critical', 'border-left-color', '--critical-mark', '--color-warning'],
    ['its CRITICAL tag', 'css/components/badge.css', '.badge.critical-tag', 'color', '--critical-mark-text', '--color-warning-text'],
    ['the tag\'s tint', 'css/components/badge.css', '.badge:not(button, .clickable, .filled).critical-tag', 'background', '--critical-mark-bg', '--color-warning-bg'],
    ['a profile\'s critical services', 'css/profiles.css', '.critical-service-item', 'background', '--critical-mark-bg', '--color-warning-bg'],
    ['their stripe', 'css/profiles.css', '.critical-service-item', 'border-left', '--critical-mark', '--color-warning'],
    ['the stripe of an installed package', 'css/audio-software.css', '.software-card.installed', 'border-left-color', '--installed-mark', '--color-success'],
];

/** The role tokens, and what Minimal sets each to. */
const MINIMAL = {
    '--action-positive': '--text-primary', '--action-positive-text': '--text-primary',
    '--action-tag': '--text-primary', '--action-tag-text': '--text-primary',
    '--activity-low-text': '--text-primary',
    '--health-running': '--text-primary', '--health-running-text': '--text-secondary',
    '--critical-mark': '--text-primary', '--critical-mark-text': '--text-primary', '--critical-mark-bg': '--color-neutral-bg',
    '--installed-mark': '--text-primary',
};

/** The roles read with a fallback per variant: a badge's action comes in green and in orange. */
const PER_VARIANT = ['--action-tag', '--action-tag-text'];

/** The declarations of a stylesheet's rule matching selector exactly (comments out). */
const ruleOf = (file, selector) => cssRules(readStylesheet(file)).find(({ selectors }) => selectors.includes(selector))?.body;

describe('colour kept for states', () => {
    it.each(ROLES)('— %s — reads its role, whose default is the colour it had', (_, file, selector, property, role, fallback) => {
        const body = ruleOf(file, selector);
        expect(body, `no rule for ${selector}`).toBeTruthy();
        const escaped = property.replace(/-/g, '\\-');
        // A badge's action role has a fallback per variant, where it is read; the others,
        // one default in themes.css (no fallback to repeat at each read, and none to get wrong).
        const read = PER_VARIANT.includes(role) ? `var\\(${role}, var\\(${fallback}\\)\\)` : `var\\(${role}\\)`;
        expect(body).toMatch(new RegExp(`(^|[;\\s])${escaped}\\s*:[^;]*${read}`));
        if (!PER_VARIANT.includes(role)) {
            const defaults = cssRules(readStylesheet('css', 'themes.css')).find(({ selectors }) => selectors.join() === ':root,body').body;
            expect(defaults, `${role} has no default`).toMatch(new RegExp(`${role}:\\s*var\\(${fallback}\\);`));
        }
    });

    it('is set by Minimal, every role in a text colour, stated once for both modes', () => {
        const theme = readStylesheet('css', 'themes', 'minimal.css');
        const light = cssRules(theme).find(({ selectors }) => selectors.includes('[data-theme="minimal"]')).body;
        for (const [role, value] of Object.entries(MINIMAL)) {
            expect(light, role).toMatch(new RegExp(`${role}:\\s*var\\(${value}\\);`));
            expect(theme.match(new RegExp(`${role}:`, 'g')), `${role} declared more than once`).toHaveLength(1);
        }
    });

    it('is left to its semantic colour by every other theme', () => {
        for (const file of [['css', 'themes', 'slate.css'], ['css', 'themes', 'gravity.css']]) {
            const css = readStylesheet(...file);
            for (const role of Object.keys(MINIMAL)) expect(css, `${file.join('/')} sets ${role}`).not.toMatch(new RegExp(`${role}:`));
        }
        // themes.css states each default once, and none for the per-variant roles.
        const themes = readStylesheet('css', 'themes.css');
        for (const role of Object.keys(MINIMAL)) {
            expect(themes.match(new RegExp(`${role}:`, 'g')) ?? [], role).toHaveLength(PER_VARIANT.includes(role) ? 0 : 1);
        }
    });
});

describe('the components wear the classes these rules read', () => {
    it.each([
        ['js/components/molecules/ag-service-card.js'],
        ['js/components/molecules/ag-config-card.js'],
        ['js/components/molecules/ag-systemd-card.js'],
    ])('— %s — tags a critical service with .critical-tag', (file) => {
        expect(readStylesheet(file)).toContain('<span class="badge warning critical-tag">CRITICAL</span>');
    });

    it('marks the four plain actions of a tab\'s title as .action-tag', () => {
        const software = readStylesheet('js', 'components', 'organisms', 'ag-audio-software-page.js');
        expect(software).toMatch(/class="badge warning action-tag plain-btn[^"]*"[^>]*>[\s\S]*?REFRESH<\/button>/);
        expect(software).toMatch(/class="badge success action-tag clickable plain-btn[^"]*"[\s\S]*?CHECK UPDATES/);
        expect(readStylesheet('js', 'components', 'organisms', 'ag-admin-page.js')).toContain('class="badge warning action-tag clickable" @click=${() => this._openUserModal()}>NEW USER');
        expect(readStylesheet('js', 'components', 'organisms', 'ag-pipeline-page.js')).toContain('<span class="badge warning action-tag clickable" style="margin-left: auto"');
    });

    it('leaves no green or orange action badge without .action-tag, anywhere — the phone\'s CONFIG was missed once', () => {
        const missing = [];
        for (const file of appSources()) {
            const tags = openingTags(readStylesheet(file));
            tags.forEach((tag, i) => {
                const cls = tag.match(/\bclass="([^"]*)"/)?.[1] ?? '';
                if (!/(^|\s)badge(\s|$)/.test(cls) || !/(^|\s)(success|warning)(\s|$)/.test(cls)) return;
                if (!/\bclickable\b/.test(cls) && !/^<button\b/.test(tag)) return;
                if (/(^|\s)action-tag(\s|$)/.test(cls)) return;
                // Shown only while something waits on the user, and orange for it: a web
                // password to set, a restart.
                if (/web-password-badge|restart-badge/.test(tag)) return;
                missing.push(`${file}: ${tag.slice(0, 80)}`);
            });
        }
        expect(missing).toEqual([]);
    });
});
