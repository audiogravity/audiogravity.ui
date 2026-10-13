/**
 * Guard: what can be typed into or pressed, and is drawn by its outline, takes the controls' border.
 *
 * Measured 2026-10-13 in Chromium, theme Minimal: fields, lists, framed buttons and selectors were
 * drawn by --border-color alone, #D0D0D0 — 1.45:1 on a panel, where WCAG 1.4.11 asks 3:1 for what
 * identifies a control. They now read --control-border, which Minimal sets at 3:1 on its grounds and
 * every other theme leaves at its border colour (css/themes.css): the cards keep their hairline.
 *
 * Covers:
 * 1. the default is declared once, on :root and body, as the border colour
 * 2. each control family draws its outline with it — the rules found by walking every screen in
 *    Chromium for controls outlined in the border colour, then by reading the stylesheets
 * 3. no other rule aimed at a control outlines it in --border-color, save the panels that group
 *    controls, the separators, and the sign-in page, which does not change (user's choice)
 * The contrast of the theme values is checked with the other colours, in js/colors.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, cssRules, cssRuleBody, filesUnder } from './test-utils.js';

/** The audio diagram's styles live in its component, in a shadow root. */
const PIPELINE = 'js/components/organisms/ag-audio-pipeline.js';

/** [what, stylesheet, selector as written]: the rules that draw a control's outline. */
const FAMILIES = [
    ['the fields', 'css/components/forms.css', '.form-control'],
    ['the config editor\'s fields', 'css/config.css', '.config-field textarea'],
    ['the library\'s search bar', 'css/components/library-search.css', '.lib-search-bar'],
    ['the settings panel\'s theme list', 'css/components/forms.css', '.theme-select'],
    ['Performance\'s governor list', 'css/performance.css', '.governor-select'],
    ['the log\'s level list', 'css/system.css', '.log-select'],
    ['HQPlayer\'s DSP lists', 'css/components/library-sources.css', '.lib-hqp-select'],
    ['the grey buttons of tiles and panels', 'css/components/button.css', '.tile-action-btn'],
    ['their ghost variant', 'css/components/button.css', '.btn-action--ghost'],
    ['the framed buttons', 'css/components/button.css', '.action-btn.secondary'],
    ['the framed icon buttons', 'css/components/button.css', '.icon-btn'],
    ['the filters', 'css/components/filter-bar.css', '.filter-btn'],
    ['Radio\'s views', 'css/components/library-radio.css', '.lib-radio-tab'],
    ['Radio\'s + Add custom station', 'css/components/library-radio.css', '.lib-radio-add-btn'],
    ['the queue\'s Refresh and Clear', 'css/components/library-queue.css', '.lib-queue-action'],
    ['Browse\'s pills', 'css/components/library-album-card.css', '.lib-pill'],
    ['Search\'s sources', 'css/components/library-search.css', '.lib-src-badge'],
    ['the HIGHRESAUDIO filters\' toggle', 'css/components/library-search.css', '.lib-hraf-toggle'],
    ['the HQPlayer card\'s volume button', 'css/components/library-sources.css', '.lib-hqp-actions ag-volume-popover .avp-btn'],
    ['the full-screen player\'s switch button', 'css/components/now-playing-fullscreen.css', '.npfs-switch-btn'],
    ['a playlist\'s icon buttons', 'css/components/playlist-page.css', '.ag-pp-icon-btn'],
    ['System\'s RUNNING / STOPPED of the events', 'css/system.css', '.event-toggle-btn'],
    ['the log\'s refresh and Live', 'css/system.css', '.log-btn'],
    ['the log\'s levels', 'css/system.css', '.log-filter-btn'],
    ['the audio diagram\'s buttons', PIPELINE, '.zoom-btn'],
    ['the audio diagram\'s switches', PIPELINE, '.toggle-slider'],
];

/** An outline drawn in the cards' border colour. */
const CARD_OUTLINE = /border(?:-(?:top|right|bottom|left))?(?:-color)?\s*:[^;]*var\(--border-color\)/;

/** What a selector aims at: a control element, or a class named as one. */
const CONTROL = /(?:^|[\s>+~(])(?:input|select|textarea|button)(?![\w-])|\.[\w-]*(?:btn|button|select|input|field|tab|pill|badge|chip|toggle)[\w-]*/;

/** [stylesheet, selector, why its outline stays the cards' colour] */
const NOT_CONTROLS = [
    ['css/layout.css', '.tabs', 'the tab bar\'s rule under the tabs, not a button\'s edge'],
    ['css/layout.css', '.tabs--vertical', 'the vertical tab bar\'s rule beside the tabs'],
    ['css/layout.css', '.tabs--vertical .tabs-user-bar', 'the rules around the user bar of the vertical tabs'],
    ['css/components/library-radio.css', '.lib-radio-tabs', 'the rule under Radio\'s views'],
    ['css/components/forms.css', '.checkbox-field', 'a panel that groups a checkbox and its label'],
    ['css/performance.css', '.test-type-selector', 'a panel that groups the network test\'s radio buttons'],
    ['css/login.css', '.form-group input', 'the sign-in page does not change (user\'s choice)'],
];

/** The stylesheets of the app, and the diagram's styles in its component. */
const SHEETS = [...filesUnder('css', /\.css$/), PIPELINE];

describe('the controls\' border', () => {
    it('defaults to the border colour, declared once, on :root and body', () => {
        const themes = readStylesheet('css', 'themes.css');
        expect(themes.match(/--control-border:/g)).toHaveLength(1);
        const rule = cssRules(themes).find(({ body }) => /--control-border:/.test(body));
        expect(rule.selectors).toEqual([':root', 'body']);
        expect(rule.body).toMatch(/--control-border:\s*var\(--border-color\)/);
    });

    it('is set by Minimal in light and in dark, each on its own grounds (UI guidelines rule 11)', () => {
        // Left out of the dark block, the light value would carry over: still above 3:1 on
        // black, so the contrast check would pass, but chosen for none of the dark grounds.
        const rules = cssRules(readStylesheet('css', 'themes', 'minimal.css'));
        for (const selector of ['[data-theme="minimal"]', '[data-theme="minimal"].dark-mode']) {
            const rule = rules.find(({ selectors }) => selectors.includes(selector));
            expect(rule?.body, selector).toMatch(/--control-border:\s*#[0-9a-fA-F]{6};/);
        }
    });

    it.each(FAMILIES)('— %s — draw their outline with it', (_, file, selector) => {
        const body = cssRuleBody(readStylesheet(file), selector);
        expect(body, `no rule for ${selector}`).toBeTruthy();
        expect(body).toMatch(/border(?:-color)?\s*:\s*(?:1px solid )?var\(--control-border\)/);
        expect(body).not.toMatch(CARD_OUTLINE);
    });

    it('outline no other control in the cards\' colour', () => {
        const allowed = NOT_CONTROLS.map(([file, selector]) => `${file}: ${selector}`);
        const found = [];
        for (const file of SHEETS) {
            for (const { selectors, body } of cssRules(readStylesheet(file))) {
                if (!CARD_OUTLINE.test(body)) continue;
                for (const selector of selectors) {
                    const last = selector.split(/\s*[>+~]\s*|\s+/).pop();
                    if (CONTROL.test(` ${last}`) && !allowed.includes(`${file}: ${selector}`)) found.push(`${file}: ${selector}`);
                }
            }
        }
        expect(found).toEqual([]);
    });

    it('names only rules that exist and still draw an outline, so an exception cannot outlive its reason', () => {
        for (const [file, selector] of NOT_CONTROLS) {
            const rule = cssRules(readStylesheet(file)).find(({ selectors }) => selectors.includes(selector));
            expect(rule, `${file}: ${selector}`).toBeTruthy();
            expect(rule.body, `${file}: ${selector} no longer draws an outline`).toMatch(CARD_OUTLINE);
        }
    });
});
