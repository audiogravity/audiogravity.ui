/**
 * Unit tests for the app's Christmas dress (css/components/christmas.css): what the class
 * public/holiday-boot.js sets on <html> brings out, every 24 and 25 December — on the splash
 * screen, and nowhere else (user's choice, 2026-11-10).
 *
 * The days themselves: js/holiday-boot.test.js. The splash screen's two copies, held together:
 * js/splash-screen.test.js.
 *
 * Covers:
 * 1. the figures: one drawing each, in public/pics/christmas, framed as the stylesheet frames it;
 *    the tree's bulbs in two strings over it, in its own frame
 * 2. the splash screen: the snow, the sleigh, the tree, the gifts and the day's line on both
 *    pages — on those days only, and the everyday line every other day
 * 3. the waves' red and gold are the theme's, declared once; no other colour written as a value
 * 4. every piece that moves names its timing for the screen's exemption from the app's
 *    Animations setting; nothing moves for a viewer who asks for less motion
 * 5. nothing takes a pointer; everything that moves moves whole elements
 * 6. nothing else in the interface wears it
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readStylesheet, cssRuleBody, cssRules, mediaBlock, appSources } from './test-utils.js';

const CSS = readStylesheet('css', 'components', 'christmas.css');
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const ROOT = path.resolve(import.meta.dirname, '..');

/** A rule of the day's dress on the splash screen, by the selector it ends with. */
const on = (piece) => `html.ag-christmas #ag-splash-screen ${piece}`;

describe('the figures', () => {
    it.each([
        ['tree', '0 0 120 160'],
        ['lights-warm', '0 0 120 160'],
        ['lights-cool', '0 0 120 160'],
        ['gift-red', '0 0 50 54'],
        ['gift-green', '0 0 50 54'],
        ['sleigh', '0 -14 240 106'],
        ['snow-far', '0 0 260 300'],
        ['snow-near', '0 0 360 420'],
    ])('%s: one drawing, in its frame, painted by the stylesheet', (name, viewBox) => {
        expect(existsSync(path.join(ROOT, 'public', 'pics', 'christmas', `${name}.svg`))).toBe(true);
        expect(readStylesheet('public', 'pics', 'christmas', `${name}.svg`)).toContain(`viewBox="${viewBox}"`);
        expect(CODE).toContain(`url("/pics/christmas/${name}.svg")`);
    });

    it('frames each one as its drawing is framed', () => {
        expect(cssRuleBody(CSS, on('.splash-tree'))).toMatch(/aspect-ratio:\s*120 \/ 160;/);
        // The bulbs lie over the tree, in the same box and the same frame.
        expect(cssRuleBody(CSS, on('.ag-xm-lights'))).toMatch(/inset:\s*0;[\s\S]*center bottom \/ contain no-repeat/);
        expect(cssRuleBody(CSS, on('.splash-tree'))).toMatch(/center bottom \/ contain no-repeat/);
        expect(cssRuleBody(CSS, on('.splash-sleigh'))).toMatch(/aspect-ratio:\s*240 \/ 106;/);
        for (const [side, width, height] of [['left', 34, 37], ['right', 27, 29]]) {
            const rule = cssRuleBody(CSS, on(`.splash-gift--${side}`));
            expect(rule).toMatch(new RegExp(`width:\\s*${width}px;`));
            expect(rule).toMatch(new RegExp(`height:\\s*${height}px;`));
            expect(Math.abs(height / width - 54 / 50), side).toBeLessThan(0.02);
        }
    });

    it('hangs the tree\'s bulbs in two strings that share none', () => {
        const bulbs = (name) => [...readStylesheet('public', 'pics', 'christmas', `${name}.svg`)
            .matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="2.6"/g)].map(([, x, y]) => `${x},${y}`);
        const warm = bulbs('lights-warm');
        const cool = bulbs('lights-cool');
        // The landing's fourteen (audiogravity.site, assets/christmas.js, BULBS).
        expect(warm).toHaveLength(8);
        expect(cool).toHaveLength(6);
        expect(warm.filter((bulb) => cool.includes(bulb))).toEqual([]);
    });
});

describe('the splash screen', () => {
    /** A page's splash screen, from its opening tag to the end of its last line. */
    const splash = (file) => {
        const page = readStylesheet(file);
        const start = page.indexOf('<div id="ag-splash-screen"');
        return page.slice(start, page.indexOf('</div>', page.indexOf('splash-tagline--christmas', start)));
    };

    it.each(['index.html', 'login.html'])('%s carries the snow, the sleigh, the tree, the gifts and the day\'s line', (file) => {
        const markup = splash(file);
        expect(markup).toContain('<span class="splash-snow" aria-hidden="true"><span class="ag-xm-plane ag-xm-far"></span>'
            + '<span class="ag-xm-plane ag-xm-near"></span></span>');
        expect(markup).toContain('<span class="splash-sleigh" aria-hidden="true"></span>');
        expect(markup).toContain('<span class="splash-tree" aria-hidden="true"><span class="ag-xm-lights"></span>'
            + '<span class="ag-xm-lights ag-xm-cool"></span></span>');
        expect(markup).toContain('<span class="splash-gift splash-gift--left" aria-hidden="true"></span>');
        expect(markup).toContain('<span class="splash-gift splash-gift--right" aria-hidden="true"></span>');
        expect(markup).toContain('<span class="splash-tagline splash-tagline--christmas">Your audio chain, merrily controlled</span>');
        // The snow and the sleigh belong to the screen, before the icon's box; in that box, the
        // tree before the icon and the gifts after it, so that they stand in front of its corners.
        expect(markup.indexOf('splash-sleigh')).toBeLessThan(markup.indexOf('<div class="splash-mark">'));
        expect(markup.indexOf('splash-tree')).toBeGreaterThan(markup.indexOf('<div class="splash-mark">'));
        expect(markup.indexOf('splash-tree')).toBeLessThan(markup.indexOf('splash-app-icon'));
        expect(markup.indexOf('splash-gift--left')).toBeGreaterThan(markup.indexOf('splash-app-icon'));
    });

    it('shows them on those days only, and the everyday line every other day', () => {
        const hidden = cssRuleBody(CSS, [
            'html:not(.ag-christmas) .splash-snow',
            'html:not(.ag-christmas) .splash-sleigh',
            'html:not(.ag-christmas) .splash-tree',
            'html:not(.ag-christmas) .splash-gift',
            'html:not(.ag-christmas) .splash-tagline--christmas',
            'html.ag-christmas .splash-tagline:not(.splash-tagline--christmas)',
        ].join(',\n'));
        expect(hidden).toMatch(/display:\s*none;/);
    });

    it('draws and fetches nothing another day: every rule behind the day\'s class', () => {
        const selectors = cssRules(CSS).flatMap((rule) => rule.selectors)
            .filter((selector) => !/^(from|to|[\d.]+%)$/.test(selector));
        expect(selectors.length).toBeGreaterThan(15);
        for (const selector of selectors) expect(selector).toMatch(/^html(\.ag-christmas|:not\(\.ag-christmas\)) /);
        // The drawings are named in those rules only — a URL in a rule that matches is fetched.
        for (const { selectors: list, body } of cssRules(CSS).filter((rule) => /url\(/.test(rule.body))) {
            expect(list.every((selector) => selector.startsWith('html.ag-christmas ')), body).toBe(true);
        }
    });

    it('flies the sleigh above the tree\'s star at every height, a phone held sideways included', () => {
        // At 16vh it crossed the tree and the icon at 844 x 390 and 932 x 430 (code review,
        // 2026-11-10). The star stands 113px above the middle of the screen (measured in Chromium:
        // the content is centred); the sleigh is the drawing's ratio at its width, and its flight
        // lifts and lowers it by up to 8px.
        const [, vh, px] = cssRuleBody(CSS, on('.splash-sleigh')).match(/top:\s*max\(0px, calc\((\d+)vh - (\d+)px\)\);/) ?? [];
        expect(vh).toBeDefined();
        const width = Number(cssRuleBody(CSS, on('.splash-sleigh')).match(/width:\s*(\d+)px;/)[1]);
        const tall = width * 106 / 240;
        for (let height = 375; height <= 1400; height += 5) {
            const top = Math.max(0, height * Number(vh) / 100 - Number(px));
            expect(top + tall + 8, `${height}px high`).toBeLessThan(height / 2 - 113);
        }
    });

    it('lets the screen clip what crosses its edges, once for every day: no day\'s stylesheet says it again', () => {
        expect(cssRuleBody(readStylesheet('css', 'components', 'splash-screen.css'), '#ag-splash-screen')).toMatch(/overflow:\s*hidden;/);
        for (const day of ['halloween', 'christmas']) {
            const code = readStylesheet('css', 'components', `${day}.css`).replace(/\/\*[\s\S]*?\*\//g, '');
            expect(code, day).not.toMatch(/#ag-splash-screen\s*\{/);
        }
    });
});

describe('the colours', () => {
    it('the waves red, then gold — the theme\'s, declared once — and as strong as Halloween\'s orange', () => {
        const themes = readStylesheet('css', 'themes.css');
        expect(themes.match(/--christmas-red:/g)).toHaveLength(1);
        expect(themes.match(/--christmas-gold:/g)).toHaveLength(1);
        const waves = cssRuleBody(CSS, on('.splash-wave'));
        expect(waves).toMatch(/border-color:\s*var\(--christmas-red\);/);
        expect(waves).toMatch(/--splash-wave-from:\s*0\.9;/);
        expect(cssRuleBody(CSS, on('.splash-wave--second'))).toMatch(/border-color:\s*var\(--christmas-gold\);/);
    });

    it('writes no colour as a value, but in the snow\'s mask, which reads only how opaque it is', () => {
        expect(CODE.match(/mask-image:[^;]*;/g)).toHaveLength(2);
        expect(CODE.replace(/mask-image:[^;]*;/g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    });
});

describe('motion', () => {
    const MOVING = ['.ag-xm-far', '.ag-xm-near', '.splash-sleigh', '.splash-sleigh::before', '.ag-xm-lights', '.splash-gift'];

    it.each(MOVING)('%s names its timing for the screen\'s exemption from the app\'s Animations setting', (piece) => {
        // The exemption (css/components/splash-screen.css) restores each element's timing from
        // three custom properties — and they are inherited: the tree's bulbs and the gifts would
        // take the icon's box's otherwise.
        const rule = cssRuleBody(CSS, on(piece));
        expect(rule).toMatch(/--splash-duration:/);
        expect(rule).toMatch(/--splash-delay:/);
        expect(rule).toMatch(/animation:[^;]*var\(--splash-duration\)[^;]*var\(--splash-delay\)/);
    });

    it('repeats only what loops — the sleigh\'s bob, the bulbs — and says so for the exemption', () => {
        for (const piece of ['.splash-sleigh::before', '.ag-xm-lights']) {
            const rule = cssRuleBody(CSS, on(piece));
            expect(rule).toMatch(/--splash-count:\s*infinite;/);
            expect(rule).toMatch(/animation:[^;]*var\(--splash-count\)/);
        }
        for (const piece of ['.ag-xm-far', '.ag-xm-near', '.splash-sleigh', '.splash-gift']) {
            expect(cssRuleBody(CSS, on(piece))).toMatch(/animation:[^;]* 1 both;/);
        }
        // The exemption reaches a ::before, which draws the sleigh — and no piece is an ::after,
        // which it does not reach.
        expect(readStylesheet('css', 'components', 'splash-screen.css')).toMatch(/body\.no-animations #ag-splash-screen \*::before \{/);
        expect(CODE).not.toMatch(/::after/);
    });

    it('moves nothing for a viewer who asks for less motion: the snow, the bulbs and the gifts still, no sleigh', () => {
        const still = mediaBlock(CSS, /@media \(prefers-reduced-motion: reduce\)/);
        expect(cssRuleBody(still, on('.splash-sleigh'))).toMatch(/display:\s*none;/);
        const stopped = still.slice(0, still.indexOf('animation: none !important;'));
        for (const piece of ['.ag-xm-plane', '.ag-xm-lights', '.splash-gift']) expect(stopped).toContain(on(piece));
        // The snow where it starts, at its own strength: themes.css would otherwise end its fall at once.
        expect(cssRuleBody(still, on('.ag-xm-plane'))).toMatch(/opacity:\s*var\(--ag-xm-snow\);/);
    });

    it('moves whole elements only: no SVG group, no shadow, no size animated', () => {
        const keyframes = CODE.match(/@keyframes [\s\S]*?\n\}/g);
        expect(keyframes).toHaveLength(6);
        for (const block of keyframes) {
            const properties = [...block.matchAll(/([a-z-]+):/g)].map(([, name]) => name);
            for (const name of properties) {
                expect(['transform', 'translate', 'opacity', 'animation-timing-function'], block.split('\n')[0]).toContain(name);
            }
        }
    });

    it('lets no pointer land on a piece', () => {
        for (const piece of ['.splash-snow', '.splash-sleigh', '.splash-tree', '.splash-gift']) {
            expect(cssRuleBody(CSS, on(piece)), piece).toMatch(/pointer-events:\s*none;/);
        }
    });
});

describe('nothing else wears it', () => {
    it('dresses the splash screen\'s pieces and line only', () => {
        const selectors = cssRules(CSS).flatMap((rule) => rule.selectors)
            .filter((selector) => !/^(from|to|[\d.]+%)$/.test(selector));
        for (const selector of selectors) expect(selector).toMatch(/#ag-splash-screen|\.splash-/);
    });

    it('is read by no script of the app: the stylesheet draws all of it', () => {
        for (const file of appSources()) {
            expect(readStylesheet(file), file).not.toMatch(/ag-christmas/);
        }
    });
});
