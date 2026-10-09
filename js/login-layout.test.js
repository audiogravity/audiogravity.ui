/**
 * The sign-in page on a phone held sideways, and on any screen its card outgrows.
 *
 * Held sideways a phone is 375 to 440 px high, and the card was near 590 — 686 with the
 * passkey button. css/base.css hides the body's overflow for the app, whose panes scroll
 * on their own, and the page centred the card: its top and bottom were out of reach
 * (user, 2026-10-09). Measured in Chromium at 956×440, 812×375 and 667×375 — the top
 * 107 px above the screen — and upright at 320×568, where the passkey button took the
 * top 41 px out of view as well.
 *
 * What these hold, read from the page and its stylesheets (jsdom lays nothing out):
 *   - the page scrolls when the card does not fit, without moving a card that does, and
 *     its height is the screen's with the browser's bars shown;
 *   - held sideways, the card is two columns — brand on the left, form on the right —
 *     clear of the notch and the home indicator, and so is the automatic passkey panel;
 *   - the panel's blocks are in the page in the order they are read, upright and for a
 *     screen reader: nothing puts them back in place with `order`;
 *   - the passkey key is filled as the main button, and the licence stands 8 px under
 *     the core, in the header and in the panel;
 *   - the app itself keeps its body's overflow hidden: all of this is the page's own.
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, mediaBlock } from './test-utils.js';

const LOGIN = readStylesheet('css', 'login.css');
const BASE = readStylesheet('css', 'base.css');
const PAGE = readStylesheet('login.html');
const SIDEWAYS = mediaBlock(LOGIN, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(height\s*<=\s*500px\)/);

/**
 * The declarations of a rule written at the start of a line, indented or not.
 * `cssRuleBody` would match `.login-page` inside `body.login-page`, the step block
 * declared above it.
 *
 * @param {string} css - The stylesheet, or a block of it.
 * @param {string} selector - The selector, as written.
 * @returns {string|null} The rule's body.
 */
function rule(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? null;
}

/** The stylesheet outside the sideways block. */
const UPRIGHT = LOGIN.replace(SIDEWAYS, '');

describe('the sign-in page scrolls when the card does not fit', () => {
    it('lets the body scroll vertically', () => {
        expect(rule(LOGIN, '.login-page')).toMatch(/overflow-y:\s*auto/);
    });

    it('holds the window still, so the body keeps its box and a card that fits does not move', () => {
        expect(rule(LOGIN, 'html:has(> body.login-page)')).toMatch(/overflow:\s*hidden/);
    });

    it('takes the screen\'s height with the bars shown: in Safari 100vh hid the end of the scroll', () => {
        // The last declaration wins; 100vh stays before it for a browser without svh.
        const heights = [...rule(LOGIN, '.login-page').matchAll(/min-height:\s*([^;]+);/g)].map(m => m[1].trim());
        expect(heights.at(-1)).toBe('100svh');
    });

    it('centres the card with automatic margins, so a tall one starts at the top', () => {
        expect(rule(LOGIN, '.login-container')).toMatch(/margin-block:\s*auto/);
    });

    it('leaves the app\'s body as it was: its panes scroll on their own', () => {
        expect(rule(BASE, 'body')).toMatch(/overflow:\s*hidden/);
    });
});

describe('held sideways, the card is two columns', () => {
    it('applies to a screen held sideways and low, not to a tablet nor a computer', () => {
        expect(SIDEWAYS).not.toBe('');
    });

    it('sets the brand on the left, the form on the right, the footer under the brand', () => {
        const card = rule(SIDEWAYS, '.login-card');
        expect(card).toMatch(/display:\s*grid/);
        expect(card).toMatch(/"header form"[^"]*"footer form"/);
        expect(rule(SIDEWAYS, '.login-header')).toMatch(/grid-area:\s*header/);
        expect(rule(SIDEWAYS, '.login-footer')).toMatch(/grid-area:\s*footer/);
        // The offer shown after a sign-in takes the form's place.
        expect(SIDEWAYS).toMatch(/\.login-form,\s*\.passkey-offer\s*\{[^}]*grid-area:\s*form/);
    });

    it('tightens the form only: the offer is not a flex box, a gap would do nothing there', () => {
        expect(rule(SIDEWAYS, '.login-form')).toMatch(/gap:\s*var\(--spacing-sm\)/);
        expect(SIDEWAYS).not.toMatch(/\.passkey-offer[^{]*\{[^}]*gap:/);
    });

    it('keeps the card clear of the notch and the home indicator: the page runs under them', () => {
        expect(PAGE).toMatch(/viewport-fit=cover/);
        const container = rule(SIDEWAYS, '.login-container');
        for (const side of ['left', 'right', 'bottom']) {
            expect(container).toMatch(new RegExp(`padding-${side}:\\s*max\\(var\\(--spacing-sm\\),\\s*env\\(safe-area-inset-${side}\\)\\)`));
        }
    });

    it('moves the theme switch to the empty corner, off the first field', () => {
        const toggle = rule(SIDEWAYS, '.login-card ag-theme-toggle');
        expect(toggle).toMatch(/right:\s*auto/);
        expect(toggle).toMatch(/left:/);
    });

    it('lays the automatic passkey panel over both columns: who and where and the core left, the key right', () => {
        const panel = rule(SIDEWAYS, '.auto-passkey-panel');
        expect(panel).toMatch(/grid-column:\s*1\s*\/\s*-1/);
        expect(panel).toMatch(/display:\s*grid/);
        expect(panel).toMatch(/"side main"[^"]*"state main"[^"]*"\. cancel"/);
        // Read rule by rule: the block that styles the three ends on `.auto-passkey-state {`.
        for (const area of ['side', 'main', 'state']) {
            expect(SIDEWAYS).toMatch(new RegExp(`\\}\\s*\\.auto-passkey-${area}\\s*\\{[^}]*grid-area:\\s*${area}`));
        }
        expect(rule(SIDEWAYS, '.auto-passkey-panel > .btn-link')).toMatch(/grid-area:\s*cancel/);
    });
});

describe('the automatic passkey panel, in the order it is read', () => {
    const doc = new DOMParser().parseFromString(PAGE, 'text/html');
    const panel = doc.getElementById('autoPasskeyPanel');

    /** @returns {string} An element's name in the sequences below. */
    const name = (e) => e.id || e.className;

    it('groups who and where, the key, then the core and the licence, then the way back', () => {
        expect([...panel.children].map(name)).toEqual(
            ['auto-passkey-side', 'auto-passkey-main', 'auto-passkey-state', 'autoPasskeyCancel']);
        expect([...panel.querySelector('.auto-passkey-side').children].map(name))
            .toEqual(['ag-brand-row', 'autoPasskeyMeta']);
        expect([...panel.querySelector('.auto-passkey-main').children].map(name))
            .toEqual(['autoPasskeyTrigger', 'auto-passkey-info', 'autoPasskeyError']);
        expect([...panel.querySelector('.auto-passkey-state').children].map(name))
            .toEqual(['autoPasskeyStatus', 'autoPasskeyLicense']);
    });

    it('upright, makes no boxes of the blocks: the panel reads as the one column it always was', () => {
        expect(UPRIGHT).toMatch(/\.auto-passkey-side,\s*\.auto-passkey-main,\s*\.auto-passkey-state\s*\{[^}]*display:\s*contents/);
        const read = [...panel.querySelectorAll(':scope > div > *, :scope > button')].map(name);
        expect(read).toEqual([
            'ag-brand-row', 'autoPasskeyMeta', 'autoPasskeyTrigger', 'auto-passkey-info',
            'autoPasskeyError', 'autoPasskeyStatus', 'autoPasskeyLicense', 'autoPasskeyCancel',
        ]);
    });

    it('never reorders them on screen: a screen reader would read another order than shown', () => {
        // A first version regrouped them and put them back with `order` (WCAG 1.3.2).
        expect(LOGIN).not.toMatch(/(^|[;{\s])order:/m);
    });
});

describe('the passkey key is filled, as the main button', () => {
    // It was outlined and filled only under the pointer; the key is the one action the
    // panel offers, as Login is the form's (user, 2026-10-09).
    it('is filled with the main button\'s colour, the key in the page\'s', () => {
        // --btn-primary is declared by every theme, light and dark; the page refuses a
        // fallback inside var() (login-guidelines.test.js).
        const box = rule(LOGIN, '.auto-passkey-key-box');
        expect(box).toMatch(/background:\s*var\(--btn-primary\)/);
        expect(box).toMatch(/color:\s*var\(--bg-primary\)/);
        expect(rule(readStylesheet('css', 'components', 'button.css'), '.action-btn.primary'))
            .toMatch(/background:\s*var\(--btn-primary\b/);
    });

    it('opens up under a pointer only: a tap would leave it outlined', () => {
        const pointer = mediaBlock(LOGIN, /@media\s*\(hover:\s*hover\)\s*\{\s*\.auto-passkey-key-box:hover/);
        expect(rule(pointer, '.auto-passkey-key-box:hover')).toMatch(/background:\s*transparent/);
        const outside = LOGIN.replace(pointer, '');
        expect(outside).not.toMatch(/(^|\})\s*\.auto-passkey-key-box:hover\s*\{/m);
    });

    it('stays filled while pressed', () => {
        expect(rule(LOGIN, '.auto-passkey-key-box:active')).toMatch(/background:\s*var\(--btn-primary\)/);
    });
});

describe('the licence stands 8px under the core, in the header and in the panel', () => {
    // At the shared xs step it sat 4px under the core, read as one line with it (user,
    // 2026-10-09). Only a line that holds a badge moves: an empty one keeps xs.
    it('in the header, as far under the core as the core under the line above', () => {
        const core = rule(LOGIN, '#login-status')?.match(/margin-top:\s*(var\([^)]+\))/)?.[1];
        expect(core).toBeDefined();
        expect(rule(LOGIN, '.login-header .login-license-status:not(:empty)'))
            .toMatch(new RegExp(`margin-top:\\s*${core.replace(/[()]/g, '\\$&')}`));
        expect(LOGIN).not.toMatch(/^\.login-header \.login-license-status\s*\{/m);
    });

    it('upright in the panel, back by the difference between its md gap and sm', () => {
        expect(rule(UPRIGHT, '.auto-passkey-panel')).toMatch(/gap:\s*var\(--spacing-md\)/);
        expect(rule(UPRIGHT, '.auto-passkey-state > .login-license-status:not(:empty)'))
            .toMatch(/margin-top:\s*calc\(var\(--spacing-sm\)\s*-\s*var\(--spacing-md\)\)/);
        expect(UPRIGHT).not.toMatch(/\.auto-passkey-state > \.login-license-status\s*\{[^}]*margin/);
    });

    it('sideways, with no margin: the block parts its items by sm already', () => {
        expect(SIDEWAYS).toMatch(/\.auto-passkey-side,\s*\.auto-passkey-main,\s*\.auto-passkey-state\s*\{[^}]*gap:\s*var\(--spacing-sm\)/);
        expect(SIDEWAYS).toMatch(/\.auto-passkey-state > \.login-license-status:not\(:empty\)\s*\{[^}]*margin-top:\s*0/);
    });
});
