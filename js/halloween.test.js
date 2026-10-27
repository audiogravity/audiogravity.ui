/**
 * Unit tests for the app's Halloween dress as a whole (css/components/halloween.css): what the
 * class public/halloween-boot.js sets on <html> brings out, every 31 October.
 *
 * The day itself: js/halloween-boot.test.js. The spiders: ag-halloween-spiders.test.js. The
 * radio's stations: ag-library-radio.test.js. The splash screen's two copies, held together:
 * js/splash-screen.test.js.
 *
 * Covers:
 * 1. the figures: one drawing each, in public/pics/halloween, painted through a mask in the
 *    page's ink, framed as the stylesheet frames it
 * 2. the splash screen: the spider and the day's line on both pages, the bat drawn by the
 *    stylesheet behind a name left as the brand is written everywhere — on that day only
 * 3. the empty pages a ghost haunts — the empty ones, never a prompt, a wait or an error
 * 4. the sign-in page's spiders behind its card; the fullscreen player's glow on its cover alone
 * 5. nothing moves for a viewer who asks for less motion, or with the app's animations off;
 *    nothing takes a pointer; no colour written as a value; the pumpkin is a token
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readStylesheet, cssRuleBody, cssRules, mediaBlock } from './test-utils.js';
import { HALLOWEEN_CLASS } from './core/HalloweenController.js';
import './components/organisms/ag-history-panel.js';

const CSS = readStylesheet('css', 'components', 'halloween.css');
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const ROOT = path.resolve(import.meta.dirname, '..');

describe('the figures', () => {
    it.each([
        ['spider', '40 / 44', '0 0 40 44'],
        ['bat', '112 / 46', '4 2 112 46'],
        ['ghost', '36 / 47', '2 2 36 47'],
    ])('the %s: one drawing, framed as the stylesheet frames it', (name, ratio, viewBox) => {
        const file = path.join(ROOT, 'public', 'pics', 'halloween', `${name}.svg`);
        expect(existsSync(file)).toBe(true);
        expect(readStylesheet('public', 'pics', 'halloween', `${name}.svg`)).toContain(`viewBox="${viewBox}"`);
        const url = `url("/pics/halloween/${name}.svg")`;
        // The prefixed mask for WebKit, the standard one for the others, beside a ratio of
        // the drawing's own frame.
        const uses = CODE.split(`-webkit-mask: ${url} center / contain no-repeat;`).length - 1;
        expect(uses).toBe(1);
        expect(CODE.split(`mask: ${url} center / contain no-repeat;`).length - 1).toBe(2);
        const rule = CODE.slice(0, CODE.indexOf(`-webkit-mask: ${url}`));
        expect(rule.slice(rule.lastIndexOf('{'))).toContain(`aspect-ratio: ${ratio};`);
    });

    it('paints them in the page\'s ink, and no colour is written as a value', () => {
        expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
        expect(cssRuleBody(CSS, '.ag-hw-body')).toMatch(/background:\s*var\(--text-primary\);/);
        // The pumpkin is the theme's, declared once.
        const themes = readStylesheet('css', 'themes.css');
        expect(themes.match(/--halloween-orange:/g)).toHaveLength(1);
        expect(CODE).toMatch(/border-color:\s*var\(--halloween-orange\);/);
    });

    it('lets no pointer land on a figure', () => {
        expect(cssRuleBody(CSS, '.ag-hw-sky')).toMatch(/pointer-events:\s*none;/);
        // The figures drawn by the stylesheet itself, each in the rule that places it.
        const placing = cssRules(CSS).filter(({ body }) => /content:\s*"";/.test(body) && /position:\s*absolute;/.test(body));
        expect(placing.flatMap(({ selectors }) => selectors)).toEqual([
            'html.ag-halloween #ag-splash-screen .splash-wordmark::before',
            'html.ag-halloween .app-title-bar::before', 'html.ag-halloween .app-title-bar::after',
            'html.ag-halloween .login-logo::before',
        ]);
        for (const { body } of placing) expect(body).toMatch(/pointer-events:\s*none;/);
    });
});

describe('the sign-in page', () => {
    it('hangs the app\'s spiders behind the card: before it in the page, at no level of their own', () => {
        const page = readStylesheet('login.html');
        const spiders = page.indexOf('<ag-halloween-spiders></ag-halloween-spiders>');
        expect(spiders).toBeGreaterThan(page.indexOf('<body'));
        expect(spiders).toBeLessThan(page.indexOf('<div class="login-container">'));
        expect(readStylesheet('js', 'login.js')).toContain("import './components/atoms/ag-halloween-spiders.js';");
        // On a short phone the card reaches the gutters: painted after the spiders, it covers them.
        expect(cssRuleBody(CSS, 'body.login-page .ag-hw-sky')).toMatch(/z-index:\s*auto;/);
    });
});

describe('the fullscreen player\'s lantern', () => {
    const PLAYER = readStylesheet('css', 'components', 'now-playing-fullscreen.css');

    it('glows on the cover alone — the stand-in inside it would double it — in its own file', () => {
        expect(cssRuleBody(PLAYER, 'html.ag-halloween .npfs-cover')).toMatch(/box-shadow:[^;]*var\(--halloween-orange\)/);
        expect(PLAYER).not.toMatch(/ag-halloween[^{]*npfs-cover-placeholder/);
        // The player's styles stay in their own file (ui rule 5).
        expect(CODE).not.toMatch(/\.npfs-/);
    });
});

describe('the splash screen', () => {
    it.each(['index.html', 'login.html'])('%s carries the spider and the day\'s line, and the name as everywhere', (file) => {
        const page = readStylesheet(file);
        const splash = page.slice(page.indexOf('<div id="ag-splash-screen"'), page.indexOf('<div class="login-container">') > 0
            ? page.indexOf('<div class="login-container">') : page.indexOf('<!-- Skip to main content'));
        expect(splash).toContain('<div class="ag-hw-spider splash-spider" aria-hidden="true"><div class="ag-hw-sway"><div class="ag-hw-body"></div></div></div>');
        expect(splash).toContain('<span class="ag-wordmark splash-wordmark">Audiogravi<sup>ty</sup></span>');
        expect(splash).toContain('<span class="splash-tagline splash-tagline--halloween">Your audio chain, frightfully controlled</span>');
    });

    it('shows them on that day only, and the everyday line every other day', () => {
        const hidden = cssRuleBody(CSS, [
            'html:not(.ag-halloween) .splash-spider',
            'html:not(.ag-halloween) .splash-tagline--halloween',
            'html.ag-halloween .splash-tagline:not(.splash-tagline--halloween)',
        ].join(',\n'));
        expect(hidden).toMatch(/display:\s*none;/);
    });

    it('keeps them under the screen\'s exemption from the app\'s Animations setting', () => {
        // The exemption restores each element's timing from three custom properties.
        for (const selector of ['html.ag-halloween #ag-splash-screen .splash-spider',
            'html.ag-halloween #ag-splash-screen .splash-wordmark::before']) {
            const rule = cssRuleBody(CSS, selector);
            expect(rule).toMatch(/--splash-duration:/);
            expect(rule).toMatch(/--splash-delay:/);
        }
        // Two animations on the bat, its flight and its wings: two values each.
        expect(cssRuleBody(CSS, 'html.ag-halloween #ag-splash-screen .splash-wordmark::before')).toMatch(/--splash-count:\s*1, infinite;/);
        // The screen's exemption reaches a ::before.
        expect(readStylesheet('css', 'components', 'splash-screen.css')).toMatch(/body\.no-animations #ag-splash-screen \*::before \{/);
    });
});

describe('the empty pages a ghost haunts', () => {
    afterEach(() => {
        document.documentElement.classList.remove(HALLOWEEN_CLASS);
        document.body.replaceChildren();
    });

    it('a history with nothing in it', async () => {
        const panel = document.createElement('ag-history-panel');
        panel.items = [];
        document.body.append(panel);
        await panel.updateComplete;
        const empty = panel.querySelector('.history-empty');
        expect(empty.classList.contains('ag-hw-haunt')).toBe(true);
        expect(empty.textContent).toBe('No history yet');
    });

    it.each([
        ['ag-system-page.js', '<div class="history-empty ag-hw-haunt">No events recorded</div>'],
        ['ag-library-queue.js', '<div class="lib-empty ag-hw-haunt">Queue is empty</div>'],
        ['ag-library-queue.js', '<div class="lib-empty ag-hw-haunt">No upcoming ${originLabel(activeFilter)} tracks</div>'],
        ['ag-library-upnp-browser.js', '<div class="lib-empty ag-hw-haunt">No items</div>'],
        ['ag-library-stats.js', '<p class="lib-stats-empty ag-hw-haunt">Nothing recorded yet.'],
        ['ag-library-search.js', '<div class="lib-empty ag-hw-haunt">\n                    ${_query ? `No results for'],
        // Neither a wait nor a prompt: only once nothing came, only a list left empty.
        ['ag-library-browse.js', "<div class=\"lib-empty ${awaitingEntry ? '' : 'ag-hw-haunt'}\">${awaitingEntry ? 'Loading…' : 'No albums found'}</div>"],
        ['ag-library-radio.js', "<div class=\"lib-radio-empty ${this._view === 'search' ? '' : 'ag-hw-haunt'}\">${this._emptyMessage()}</div>"],
    ])('%s: %s', (file, markup) => {
        expect(readStylesheet('js', 'components', 'organisms', file)).toContain(markup);
    });

    it('never haunts a wait or an error', () => {
        for (const file of ['ag-library-queue.js', 'ag-library-search.js', 'ag-library-browse.js',
            'ag-library-upnp-browser.js', 'ag-library-radio.js', 'ag-library-stats.js']) {
            const source = readStylesheet('js', 'components', 'organisms', file);
            for (const line of source.split('\n').filter((l) => l.includes('ag-hw-haunt'))) {
                expect(line, `${file}: ${line.trim()}`).not.toMatch(/Error:|lib-loading|Select a|Choose a/);
            }
        }
    });

    it('draws the ghost above the message and the line under it, on that day only', () => {
        expect(cssRuleBody(CSS, 'html.ag-halloween .ag-hw-haunt::before')).toMatch(/content:\s*"";/);
        const line = cssRuleBody(CSS, 'html.ag-halloween .ag-hw-haunt::after');
        // Kept from screen readers by an empty alternative; the plain form first, for a browser
        // that does not know the other.
        expect(line).toMatch(/content:\s*"Nothing here but ghosts";\s*content:\s*"Nothing here but ghosts" \/ "";/);
        // Every rule of it behind the day's class.
        expect(CODE.split('.ag-hw-haunt::').length).toBe(CODE.split('html.ag-halloween .ag-hw-haunt::').length);
    });
});

describe('less motion, and the app\'s animations off', () => {
    const moving = ['.ag-hw-sky', 'html.ag-halloween .splash-spider', 'html.ag-halloween #ag-splash-screen .splash-wordmark::before',
        'html.ag-halloween .app-title-bar::before', 'html.ag-halloween .app-title-bar::after',
        'html.ag-halloween .login-logo::before'];

    it('hides everything that moves for a viewer who asks for less motion, and on paper', () => {
        const still = mediaBlock(CSS, /@media \(prefers-reduced-motion: reduce\), print/);
        const hidden = still.slice(0, still.indexOf('display: none;'));
        for (const selector of moving) expect(hidden).toContain(selector);
        // The ghost stays, still.
        expect(still).toMatch(/\.ag-hw-haunt::before\s*\{\s*animation:\s*none;/);
    });

    it('hides the app\'s moving figures when its own Animations setting is off', () => {
        for (const selector of ['.ag-hw-sky', '.app-title-bar::before', '.app-title-bar::after', '.login-logo::before']) {
            expect(CODE).toContain(`body.no-animations ${selector}`);
        }
    });

    it('moves whole elements only: no SVG group, no shadow, no size animated', () => {
        const keyframes = CODE.match(/@keyframes [\s\S]*?\n\}/g);
        expect(keyframes.length).toBeGreaterThan(5);
        for (const block of keyframes) {
            const properties = [...block.matchAll(/([a-z-]+):/g)].map(([, name]) => name);
            for (const name of properties) {
                expect(['transform', 'translate', 'scale', 'opacity', 'animation-timing-function'], block.split('\n')[0])
                    .toContain(name);
            }
        }
    });
});
