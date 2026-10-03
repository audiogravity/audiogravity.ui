/**
 * Unit tests for ag-back-to-top — the round back-to-top button in a scrolling pane: when it
 * shows, the ring that follows the reading (and the pane's size, and its images), one paint per
 * frame, the way back up (smooth, or a jump for a reader who asked for less motion), the focus
 * handed to the pane — focusable for that one focus — and the listeners it leaves behind.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './ag-back-to-top.js';

const CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'css');
/** A stylesheet of the ui, comments removed. */
const css = (...p) => fs.readFileSync(path.join(CSS, ...p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * A pane whose geometry the test sets: jsdom lays nothing out, so every size reads 0.
 * @param {{scrollHeight?: number, clientHeight?: number}} [size]
 */
function makePane({ scrollHeight = 3000, clientHeight = 600 } = {}) {
    const pane = document.createElement('div');
    const state = { scrollTop: 0, scrollHeight, clientHeight };
    Object.defineProperty(pane, 'scrollHeight', { get: () => state.scrollHeight });
    Object.defineProperty(pane, 'clientHeight', { get: () => state.clientHeight });
    Object.defineProperty(pane, 'scrollTop', { get: () => state.scrollTop, set: (v) => { state.scrollTop = v; } });
    pane.scrollTo = vi.fn();
    vi.spyOn(pane, 'focus'); // watched, and still focusing
    document.body.appendChild(pane);
    return {
        pane,
        /** Scroll the pane to a position, as the reader would. */
        scroll(y) {
            state.scrollTop = y;
            pane.dispatchEvent(new Event('scroll'));
        },
        /** Change the pane's geometry without a scroll, as a rotation or an image would. */
        reshape(next) {
            Object.assign(state, next);
        },
    };
}

/** Every ResizeObserver made, with what it observes — jsdom has none. */
let observers = [];
class FakeResizeObserver {
    constructor(callback) {
        this.callback = callback;
        this.observed = [];
        this.disconnected = false;
        observers.push(this);
    }

    observe(target) { this.observed.push(target); }

    disconnect() { this.disconnected = true; }
}

describe('ag-back-to-top', () => {
    let el;
    let frames;

    const button = () => el.querySelector('button.ag-btt');
    const shown = () => button().classList.contains('is-visible');
    const ring = () => parseFloat(el.querySelector('.ag-btt-progress').style.strokeDashoffset);

    /** Run the frames the scroll events asked for, then let the element render. */
    async function flush() {
        frames.splice(0).forEach((cb) => cb());
        await el.updateComplete;
    }

    beforeEach(async () => {
        frames = [];
        observers = [];
        vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => frames.push(cb)));
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        el = document.createElement('ag-back-to-top');
        document.body.appendChild(el);
        await el.updateComplete;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.body.className = '';
        vi.unstubAllGlobals();
    });

    it('is a real button with a name, hidden while it follows nothing', () => {
        expect(button().type).toBe('button');
        expect(button().classList.contains('plain-btn')).toBe(true);
        expect(button().getAttribute('aria-label')).toBe('Back to top');
        expect(shown()).toBe(false);
    });

    it('shows once the pane has scrolled by more than its own height, not before', async () => {
        const p = makePane({ clientHeight: 600 });
        el.target = p.pane;
        await el.updateComplete;
        expect(shown()).toBe(false);
        p.scroll(600);
        await flush();
        expect(shown()).toBe(false);
        p.scroll(601);
        await flush();
        expect(shown()).toBe(true);
        p.scroll(0);
        await flush();
        expect(shown()).toBe(false);
    });

    it('draws the share of the pane read as the ring, out of 100', async () => {
        const p = makePane({ scrollHeight: 3000, clientHeight: 600 }); // 2400 px to read
        el.target = p.pane;
        await el.updateComplete;
        expect(ring()).toBe(100);
        p.scroll(1200);
        await flush();
        expect(ring()).toBe(50);
        p.scroll(2400);
        await flush();
        expect(ring()).toBe(0);
    });

    it('paints once per frame, however many scroll events arrive before it', async () => {
        const p = makePane();
        el.target = p.pane;
        await el.updateComplete;
        for (let y = 100; y <= 500; y += 100) p.scroll(y);
        expect(frames).toHaveLength(1);
        await flush();
        expect(ring()).toBeCloseTo(100 - (100 * 500) / 2400, 1);
    });

    it('keeps an empty ring and stays hidden on a pane with nothing to scroll', async () => {
        const p = makePane({ scrollHeight: 600, clientHeight: 600 });
        el.target = p.pane;
        await el.updateComplete;
        p.scroll(0);
        await flush();
        expect(ring()).toBe(100);
        expect(shown()).toBe(false);
    });

    it('takes the pane back to its top, smoothly, and gives it the focus', async () => {
        const p = makePane();
        el.target = p.pane;
        await el.updateComplete;
        button().click();
        expect(p.pane.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
        expect(p.pane.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(document.activeElement).toBe(p.pane);
    });

    it('makes the pane focusable, without a ring, for that one focus only', async () => {
        const p = makePane();
        const elsewhere = document.body.appendChild(document.createElement('button'));
        el.target = p.pane;
        await el.updateComplete;
        button().click();
        button().click(); // a second press while the pane holds the focus
        expect(p.pane.getAttribute('tabindex')).toBe('-1');
        expect(p.pane.classList.contains('ag-btt-focus-target')).toBe(true);
        elsewhere.focus();
        expect(p.pane.hasAttribute('tabindex')).toBe(false);
        expect(p.pane.classList.contains('ag-btt-focus-target')).toBe(false);
        // Out of the focus order again: a focus call no longer lands on it.
        p.pane.focus();
        expect(document.activeElement).toBe(elsewhere);
    });

    it('focuses a pane that has a tabindex of its own as it is, ring included', async () => {
        const p = makePane();
        p.pane.setAttribute('tabindex', '0');
        el.target = p.pane;
        await el.updateComplete;
        button().click();
        expect(document.activeElement).toBe(p.pane);
        expect(p.pane.classList.contains('ag-btt-focus-target')).toBe(false);
        document.body.appendChild(document.createElement('button')).focus();
        expect(p.pane.getAttribute('tabindex')).toBe('0');
    });

    it('jumps instead of scrolling when animations are off in the settings', async () => {
        document.body.classList.add('no-animations');
        const p = makePane();
        el.target = p.pane;
        await el.updateComplete;
        button().click();
        expect(p.pane.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    it('jumps too when the system asks for reduced motion', async () => {
        vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' })));
        const p = makePane();
        el.target = p.pane;
        await el.updateComplete;
        button().click();
        expect(p.pane.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    it('reads the pane again when it changes size, without a scroll', async () => {
        const p = makePane({ scrollHeight: 3000, clientHeight: 600 });
        el.target = p.pane;
        await el.updateComplete;
        p.scroll(500);
        await flush();
        expect(shown()).toBe(false);
        expect(observers.at(-1).observed).toEqual([p.pane]);
        p.reshape({ clientHeight: 400 }); // a phone turned on its side
        observers.at(-1).callback([]);
        await flush();
        expect(shown()).toBe(true);
    });

    it('reads the length to read again when an image in the pane loads', async () => {
        const p = makePane({ scrollHeight: 3000, clientHeight: 600 }); // 2400 px to read
        const img = p.pane.appendChild(document.createElement('img'));
        el.target = p.pane;
        await el.updateComplete;
        p.scroll(1200);
        await flush();
        expect(ring()).toBe(50);
        p.reshape({ scrollHeight: 3600 }); // 3000 px to read now
        img.dispatchEvent(new Event('load')); // does not bubble
        expect(frames).toHaveLength(1);
        await flush();
        expect(ring()).toBe(60);
    });

    it('does nothing when pressed while it follows no pane', () => {
        expect(() => button().click()).not.toThrow();
    });

    it('stops following a pane it is moved away from, and any pane once off the page', async () => {
        const a = makePane();
        const b = makePane();
        el.target = a.pane;
        await el.updateComplete;
        el.target = b.pane;
        await el.updateComplete;
        a.scroll(2400);
        expect(frames).toHaveLength(0);
        b.scroll(2400);
        expect(frames).toHaveLength(1);
        await flush();
        el.remove();
        b.scroll(0);
        b.pane.appendChild(document.createElement('img')).dispatchEvent(new Event('load'));
        expect(frames).toHaveLength(0);
        expect(observers.filter((o) => !o.disconnected)).toHaveLength(0);
    });

    it('follows its pane again when put back on the page', async () => {
        const p = makePane();
        el.target = p.pane;
        await el.updateComplete;
        el.remove();
        document.body.appendChild(el);
        p.scroll(2400);
        expect(frames).toHaveLength(1);
    });
});

// What jsdom cannot see: each of these fails silently in a browser, and was measured there.
describe('ag-back-to-top stylesheet', () => {
    it('takes the ring off the focused pane, after the base rule that draws it', () => {
        expect(css('components', 'back-to-top.css')).toMatch(/\.ag-btt-focus-target:focus-visible\s*\{\s*outline:\s*none;/);
        // Same weight as base.css's `[tabindex]:focus-visible`: only the order decides.
        const main = css('main.css');
        expect(main.indexOf("@import 'components/back-to-top.css'")).toBeGreaterThan(main.indexOf("@import 'base.css'"));
    });

    it('sits in its pane, held to the corner, and lets the pointer through while hidden', () => {
        const own = css('components', 'back-to-top.css');
        const host = own.match(/(?:^|\n)ag-back-to-top\s*\{[^}]*\}/)[0];
        expect(host).toMatch(/position:\s*sticky;/);
        expect(host).toMatch(/pointer-events:\s*none;/);
        expect(own.match(/\n\.ag-btt\s*\{[^}]*\}/)[0]).toMatch(/pointer-events:\s*auto;/);
    });

    it('stays round under the app\'s focus ring, which squares focused buttons', () => {
        expect(css('base.css')).toMatch(/button:focus-visible[^{]*\{[^}]*border-radius:\s*var\(--radius-sm/);
        expect(css('components', 'back-to-top.css')).toMatch(/\.ag-btt:focus-visible\s*\{\s*border-radius:\s*var\(--radius-full\);/);
    });

    it('keeps the pane\'s padding as its only offset, which the Manual pane gives the home bar', () => {
        // A sticky box counts its scroll container's padding: an offset of its own would add
        // to it, and lift the button over the last line at the end of the pane.
        expect(css('components', 'back-to-top.css').match(/(?:^|\n)ag-back-to-top\s*\{[^}]*?bottom:\s*([^;]+);/)[1]).toBe('0');
        const pane = css('components', 'modal.css').match(/\.manual-content\s*\{[^}]*\}/)[0];
        expect(pane.match(/padding:\s*\S+\s+\S+\s+(.+);/)[1]).toBe('calc(var(--spacing-lg) + env(safe-area-inset-bottom, 0px))');
    });
});
