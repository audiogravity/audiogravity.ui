/**
 * Unit tests for ag-halloween-spiders: spiders on their threads every 31 October.
 *
 * The day is public/halloween-boot.js's to say (js/halloween-boot.test.js): it sets a class on
 * <html>, which the element follows through HalloweenController (js/core/HalloweenController.test.js).
 *
 * Covers:
 * 1. the element draws nothing without the class, and its spiders with it, out of reach of
 *    pointers and screen readers, in the shared drawing
 * 2. its spiders come and go with the class: at midnight, when the app comes back into view
 * 3. nothing drawn, measured or watched for a viewer who asks for less motion
 * 4. the line the threads come out of: measured below what is fixed at the top, again at the
 *    next frame, on a resize, when the offline banner comes or the tabs change shape — and no
 *    longer watched once the spiders are gone or the element removed
 * 5. its stylesheet and its place: in the page's own layer, at its lowest step, clipped, no
 *    pointer, the page's ink, no web, nothing animated but whole elements; on both pages
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readStylesheet, cssRuleBody, mediaBlock } from '../../test-utils.js';
import { HALLOWEEN_CLASS } from '../../core/HalloweenController.js';
import './ag-halloween-spiders.js';

/** What halloween-boot.js says: it is Halloween, or not. */
function halloween(on) {
    document.documentElement.classList.toggle(HALLOWEEN_CLASS, on);
}

describe('ag-halloween-spiders', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
        document.body.className = '';
        halloween(false);
    });

    /** The element, connected on Halloween or on another day. */
    async function mount(on = true) {
        halloween(on);
        const el = document.createElement('ag-halloween-spiders');
        document.body.append(el);
        await el.updateComplete;
        return el;
    }

    /** The class changes; the controller hears it at the next microtask, the element renders. */
    async function turn(el, on) {
        halloween(on);
        await Promise.resolve();
        await el.updateComplete;
    }

    /** A fixed piece of the screen's top, its box as given. */
    function piece(className, box) {
        const node = document.createElement(className.startsWith('tabs') ? 'ag-tabs' : 'div');
        node.className = className;
        node.getBoundingClientRect = () => box();
        document.body.append(node);
        return node;
    }

    /** What a viewer's system says of motion, and a way to change its mind. */
    function motion(reduce) {
        const listeners = new Set();
        const query = {
            matches: reduce,
            addEventListener: (_type, fn) => listeners.add(fn),
            removeEventListener: (_type, fn) => listeners.delete(fn),
        };
        vi.stubGlobal('matchMedia', () => query);
        return {
            listeners,
            set(value) {
                query.matches = value;
                for (const fn of listeners) fn();
            },
        };
    }

    it('draws nothing on another day', async () => {
        const el = await mount(false);
        expect(el.querySelector('.ag-hw-sky')).toBeNull();
    });

    it('lets its spiders down on Halloween, out of reach of pointers and screen readers', async () => {
        const el = await mount();
        const sky = el.querySelector('.ag-hw-sky');
        expect(sky.getAttribute('aria-hidden')).toBe('true');
        // Two, in the gutters: a third in the middle covered a button of the Library.
        expect(sky.querySelectorAll('.ag-hw-spider')).toHaveLength(2);
        // Each one the shared drawing, painted by the stylesheet: no drawing of its own here.
        expect(sky.querySelectorAll('.ag-hw-spider .ag-hw-sway .ag-hw-body')).toHaveLength(2);
        expect(sky.querySelector('svg')).toBeNull();
    });

    it('lets them down when the day comes and takes them in when it ends, without a reload', async () => {
        // At midnight, or when an app left open comes back into view: halloween-boot.js's doing.
        const el = await mount(false);
        await turn(el, true);
        expect(el.querySelectorAll('.ag-hw-spider')).toHaveLength(2);
        await turn(el, false);
        expect(el.querySelector('.ag-hw-sky')).toBeNull();
    });

    it('draws, measures and watches nothing for a viewer who asks for less motion', async () => {
        const system = motion(true);
        const resize = vi.spyOn(window, 'addEventListener');
        const el = await mount();
        expect(el.querySelector('.ag-hw-sky')).toBeNull();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('');
        expect(resize.mock.calls.filter(([type]) => type === 'resize')).toEqual([]);
        system.set(false);   // the viewer allows motion again
        await el.updateComplete;
        expect(el.querySelector('.ag-hw-sky')).not.toBeNull();
        el.remove();
        expect(system.listeners.size).toBe(0);
        resize.mockRestore();
    });

    it('lets its threads out below what is fixed at the top, measured, and again on a resize', async () => {
        // A computer: the bar, the app's name and the tabs as a bar; the offline banner parked
        // above the screen.
        piece('topbar', () => ({ height: 50, bottom: 50 }));
        piece('app-title-bar', () => ({ height: 55, bottom: 105 }));
        piece('offline-banner', () => ({ height: 32, bottom: -8 }));
        piece('tabs', () => ({ height: 50, bottom: 155 }));
        const el = await mount();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('155px');
        document.querySelector('.tabs').className = 'tabs tabs--vertical';   // a column now
        window.dispatchEvent(new Event('resize'));
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('105px');
    });

    it('measures again at the next frame: the bar is drawn by a component of its own, later', async () => {
        const el = await mount();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('0px');
        piece('topbar', () => ({ height: 44, bottom: 44 }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('44px');
    });

    it('follows the offline banner as it comes and goes, and the tabs as they change shape', async () => {
        let banner = -8;
        piece('topbar', () => ({ height: 44, bottom: 44 }));
        const bannerEl = piece('offline-banner', () => ({ height: 32, bottom: banner }));
        const tabs = piece('tabs tabs--vertical', () => ({ height: 768, bottom: 812 }));
        const el = await mount();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('44px');
        // The device loses its network: body.is-offline, the banner slides down.
        banner = 76;
        document.body.classList.add('is-offline');
        await Promise.resolve();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('76px');
        // Back on the network: the banner slides up, and is read again at the end of its move.
        document.body.classList.remove('is-offline');
        banner = -8;
        bannerEl.dispatchEvent(new Event('transitionend'));
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('44px');
        // The column turns into a bar under the bar.
        tabs.getBoundingClientRect = () => ({ height: 42, bottom: 86 });
        tabs.className = 'tabs';
        await Promise.resolve();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('86px');
    });

    it('stops watching once the spiders are gone, and once removed', async () => {
        let top = 44;
        piece('topbar', () => ({ height: top, bottom: top }));
        const el = await mount();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('44px');
        // 1 November: the spiders go, and nothing is measured any more.
        await turn(el, false);
        top = 90;
        window.dispatchEvent(new Event('resize'));
        document.body.classList.add('is-offline');
        await Promise.resolve();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('44px');
        // Removed: the day's change no longer reaches it either.
        el.remove();
        const update = vi.spyOn(el, 'requestUpdate');
        halloween(true);
        await Promise.resolve();
        window.dispatchEvent(new Event('resize'));
        expect(update).not.toHaveBeenCalled();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('44px');
    });

    it('measures nothing while the app\'s Animations setting is off, and again once it is on', async () => {
        let top = 44;
        piece('topbar', () => ({ height: top, bottom: top }));
        document.body.classList.add('no-animations');   // the stylesheet hides the spiders then
        const el = await mount();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('');
        top = 50;
        window.dispatchEvent(new Event('resize'));
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('');
        // The setting turned on again: the body's class changes, and the line is read.
        document.body.classList.remove('no-animations');
        await Promise.resolve();
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('50px');
    });

    it('measures nothing and listens to no resize on another day', async () => {
        const spy = vi.spyOn(window, 'addEventListener');
        const el = await mount(false);
        expect(el.style.getPropertyValue('--ag-hw-top')).toBe('');
        expect(spy.mock.calls.filter(([type]) => type === 'resize')).toEqual([]);
        spy.mockRestore();
    });
});

describe('ag-halloween-spiders — its stylesheet and its place', () => {
    const css = readStylesheet('css', 'components', 'halloween.css');

    it('hangs from the top of the content, clipped there, at the page layer\'s lowest step, and takes no pointer', () => {
        const sky = cssRuleBody(css, '.ag-hw-sky');
        expect(sky).toMatch(/position:\s*fixed;/);
        expect(sky).toMatch(/top:\s*var\(--ag-hw-top, 0\);/);
        expect(sky).toMatch(/overflow:\s*hidden;/);
        expect(sky).toMatch(/pointer-events:\s*none;/);
        // The lowest step of the page's own layer: whatever is opened in the page covers it.
        expect(sky).toMatch(/z-index:\s*var\(--z-base\);/);
    });

    it('lives in the page\'s own layer: a window opened in a page covers it', () => {
        const page = readStylesheet('index.html');
        const main = page.slice(page.indexOf('<main class="main-content"'), page.indexOf('</main>'));
        expect(main).toContain('<ag-halloween-spiders></ag-halloween-spiders>');
        expect(page.match(/<ag-halloween-spiders>/g)).toHaveLength(1);
    });

    it('shows no spider to a viewer who asks for less motion, nor on paper', () => {
        const still = mediaBlock(css, /@media \(prefers-reduced-motion: reduce\), print/);
        expect(still).toMatch(/^\s*\.ag-hw-sky,[^{]*\{\s*display:\s*none;/m);
        // The app's own Animations setting takes them away too.
        expect(css).toMatch(/body\.no-animations \.ag-hw-sky,[^{]*\{\s*display:\s*none;/);
    });

    it('draws in the page\'s ink, spins no web, and moves whole elements only', () => {
        const body = cssRuleBody(css, '.ag-hw-body');
        expect(body).toMatch(/background:\s*var\(--text-primary\);/);
        expect(body).toMatch(/-webkit-mask:\s*url\("\/pics\/halloween\/spider\.svg"\)/);
        expect(body).toMatch(/\smask:\s*url\("\/pics\/halloween\/spider\.svg"\)/);
        expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
        const code = css.replace(/\/\*[\s\S]*?\*\//g, '').replaceAll('-webkit-', '');
        expect(code).not.toMatch(/web/i);
        // An SVG group's transform is redrawn on the main thread at every frame.
        expect(code).not.toMatch(/transform-box|legs/i);
    });

    it('is loaded with the app', () => {
        expect(readStylesheet('css', 'main.css')).toContain("@import 'components/halloween.css';");
        expect(readStylesheet('js', 'main.js')).toContain("import './components/atoms/ag-halloween-spiders.js';");
    });
});
