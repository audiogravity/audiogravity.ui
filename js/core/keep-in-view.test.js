/**
 * Unit tests for keep-in-view.js — the one scroll-the-selection-visible helper.
 *
 * The reason this module scrolls by hand instead of calling scrollIntoView is
 * asserted here as behaviour: scrollIntoView scrolls EVERY scrollable ancestor,
 * and .main-content is overflow-x hidden — a container the spec lets it scroll
 * programmatically while giving the reader no scrollbar and no touch panning to
 * undo it. A tab change could shift the whole page sideways until reload.
 *
 * jsdom does no layout, so geometry is stubbed per element: inline overflow
 * styles feed getComputedStyle, and rects/scroll sizes are defined directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { keepInView } from './keep-in-view.js';

/** Give an element a fixed rect and scroll geometry. */
function geom(el, { rect, scrollWidth = 0, clientWidth = 0, scrollHeight = 0, clientHeight = 0 }) {
    el.getBoundingClientRect = () => ({
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
    });
    Object.defineProperties(el, {
        scrollWidth: { value: scrollWidth, configurable: true },
        clientWidth: { value: clientWidth, configurable: true },
        scrollHeight: { value: scrollHeight, configurable: true },
        clientHeight: { value: clientHeight, configurable: true },
    });
    el.scrollTo = vi.fn();
    return el;
}

/**
 * Build the shape under test: an item inside a horizontal strip, inside an
 * outer container that is overflow-x hidden and horizontally overflowed —
 * .main-content on a mobile layout with a wide child.
 */
function mount() {
    const outer = geom(document.createElement('div'), {
        rect: { left: 0, top: 0, width: 390, height: 800 },
        scrollWidth: 600, clientWidth: 390,
    });
    outer.style.overflowX = 'hidden';

    const strip = geom(document.createElement('div'), {
        rect: { left: 0, top: 0, width: 300, height: 40 },
        scrollWidth: 500, clientWidth: 300,
    });
    strip.style.overflowX = 'auto';
    strip.scrollLeft = 0;

    const item = geom(document.createElement('button'), {
        rect: { left: 320, top: 0, width: 60, height: 40 },
    });

    strip.appendChild(item);
    outer.appendChild(strip);
    document.body.appendChild(outer);
    return { outer, strip, item };
}

describe('keepInView', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.classList.remove('no-animations'); });

    it('centres the item in its own strip', () => {
        const { strip, item } = mount();
        keepInView(item);
        // item left-edge is 320px into the viewport, strip starts at 0 and is
        // 300 wide: centring a 60px item wants scrollLeft 320 - (300-60)/2 = 200.
        expect(strip.scrollTo).toHaveBeenCalledWith(
            expect.objectContaining({ left: 200 }),
        );
    });

    it('never touches an overflow-hidden ancestor — the page must not shift', () => {
        // This is the whole reason the module exists instead of scrollIntoView:
        // hidden means "clip, do not scroll", and the reader has no way to
        // scroll such a container back.
        const { outer, item } = mount();
        keepInView(item);
        expect(outer.scrollTo).not.toHaveBeenCalled();
    });

    it('scrolls vertically only when the item is actually out of view', () => {
        const rail = geom(document.createElement('div'), {
            rect: { left: 0, top: 0, width: 60, height: 300 },
            scrollHeight: 900, clientHeight: 300,
        });
        rail.style.overflowY = 'auto';
        rail.scrollTop = 0;
        const above = geom(document.createElement('button'), {
            rect: { left: 0, top: -50, width: 60, height: 40 },
        });
        rail.appendChild(above);
        document.body.appendChild(rail);

        keepInView(above);
        expect(rail.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: -50 }));

        rail.scrollTo.mockClear();
        const visible = geom(document.createElement('button'), {
            rect: { left: 0, top: 100, width: 60, height: 40 },
        });
        rail.appendChild(visible);
        keepInView(visible);
        expect(rail.scrollTo).not.toHaveBeenCalled();
    });

    it('animates by default, instantly on first or with animations off', () => {
        const { strip, item } = mount();
        keepInView(item);
        expect(strip.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'smooth' }));

        keepInView(item, { first: true });
        expect(strip.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }));

        document.body.classList.add('no-animations');
        keepInView(item);
        expect(strip.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }));
    });

    it('is a no-op without an element or without a designed scroller', () => {
        expect(() => keepInView(null)).not.toThrow();
        const lone = geom(document.createElement('button'), {
            rect: { left: 0, top: 0, width: 60, height: 40 },
        });
        document.body.appendChild(lone);
        expect(() => keepInView(lone)).not.toThrow();
    });
});
