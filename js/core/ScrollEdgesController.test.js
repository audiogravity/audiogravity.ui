/**
 * Unit tests for ScrollEdgesController — the overflow markers of a scrolling strip.
 *
 * What matters here is that the answer is never a lie: no marker when everything
 * fits, no marker on the side already reached, none left behind once the strip is
 * gone — and that a drag costs class toggles rather than component renders, since a
 * render here walks every album row on the page. jsdom does no layout, so the three
 * numbers the controller reads are set by hand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrollEdgesController } from './ScrollEdgesController.js';

/** A host standing in for the Lit element: it only has to collect updates. */
function makeHost() {
    return {
        controllers: [],
        updates: 0,
        addController(c) { this.controllers.push(c); },
        requestUpdate() { this.updates += 1; },
    };
}

/** A strip with the geometry of a bar showing `client` of `scroll` pixels. */
function makeStrip({ scrollLeft = 0, clientWidth = 300, scrollWidth = 900 } = {}) {
    const el = document.createElement('div');
    Object.defineProperties(el, {
        clientWidth: { value: clientWidth, configurable: true },
        scrollWidth: { value: scrollWidth, configurable: true },
    });
    el.scrollLeft = scrollLeft;
    return el;
}

/** The pair the browse uses: the scroller, and the wrapper the classes go on. */
function makePair(geom) {
    const wrap = document.createElement('div');
    const strip = makeStrip(geom);
    wrap.appendChild(strip);
    return { wrap, strip };
}

describe('ScrollEdgesController', () => {
    let host;

    beforeEach(() => {
        host = makeHost();
        // jsdom has no ResizeObserver; the controller must work without one, and the
        // stub proves it is used when present.
        globalThis.ResizeObserver = class {
            constructor(cb) { this.cb = cb; }
            observe = vi.fn();
            disconnect = vi.fn();
        };
    });

    it('registers itself with the host', () => {
        const c = new ScrollEdgesController(host);
        expect(host.controllers).toContain(c);
    });

    it('marks the right edge only, at the start of an overflowing strip', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 0 });
        c.attach(strip, wrap);
        expect(wrap.classList.contains('has-left')).toBe(false);
        expect(wrap.classList.contains('has-right')).toBe(true);
    });

    it('marks both edges in the middle', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 300 });
        c.attach(strip, wrap);
        expect(wrap.classList.contains('has-left')).toBe(true);
        expect(wrap.classList.contains('has-right')).toBe(true);
    });

    it('drops the right marker at the end — within a pixel of slack', () => {
        const c = new ScrollEdgesController(host);
        // 599.4 + 300 = 899.4, i.e. the end of a 900px strip after fractional layout.
        const { wrap, strip } = makePair({ scrollLeft: 599.4 });
        c.attach(strip, wrap);
        expect(wrap.classList.contains('has-right')).toBe(false);
        expect(c.right).toBe(false);
    });

    it('marks neither edge when everything fits', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollWidth: 300, clientWidth: 300 });
        c.attach(strip, wrap);
        expect(wrap.className).toBe('');
        expect(c.overflows).toBe(false);
    });

    it('re-reads the edges as the strip is scrolled', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 0 });
        c.attach(strip, wrap);
        strip.scrollLeft = 300;
        strip.dispatchEvent(new Event('scroll'));
        expect(wrap.classList.contains('has-left')).toBe(true);
    });

    it('a drag costs no render: only overflowing-at-all asks for one', () => {
        // The point of writing classes rather than state: re-rendering the host here
        // would walk the whole album list twice per drag.
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 0 });
        c.attach(strip, wrap);
        const afterAttach = host.updates;   // false → true, one render for the chevrons
        strip.scrollLeft = 300;             // now also hiding pills on the left…
        strip.dispatchEvent(new Event('scroll'));
        strip.scrollLeft = 599.4;           // …and scrolled to the very end
        strip.dispatchEvent(new Event('scroll'));
        expect(wrap.classList.contains('has-right')).toBe(false);
        expect(host.updates).toBe(afterAttach);
    });

    it('asks for a render when the strip starts overflowing', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollWidth: 300, clientWidth: 300 });
        c.attach(strip, wrap);
        expect(host.updates).toBe(0);
        Object.defineProperty(strip, 'scrollWidth', { value: 900, configurable: true });
        c.measure();
        expect(c.overflows).toBe(true);
        expect(host.updates).toBe(1);
    });

    it('re-attaching the same pair keeps one listener, and reads no layout', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 0 });
        const add = vi.spyOn(strip, 'addEventListener');
        c.attach(strip, wrap);
        const measure = vi.spyOn(c, 'measure');
        c.attach(strip, wrap);
        c.attach(strip, wrap);
        expect(add.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1);
        expect(measure).not.toHaveBeenCalled();
    });

    it('says nothing at all about a strip in a hidden view', () => {
        // A hidden view reports no width: the edges are unknowable, not absent. Answering
        // "nothing is hidden" would clear the markers and, without a ResizeObserver to
        // fire on the way back, never restore them.
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 300 });
        c.attach(strip, wrap);
        expect(wrap.classList.contains('has-left')).toBe(true);
        Object.defineProperty(strip, 'clientWidth', { value: 0, configurable: true });
        c.measure();
        expect(wrap.classList.contains('has-left')).toBe(true);
    });

    it('takes its markers off the element it stops watching', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 300 });
        c.attach(strip, wrap);
        c.detach();
        expect(wrap.className).toBe('');
        expect(c.left).toBe(false);
        expect(c.overflows).toBe(false);
        const updates = host.updates;
        strip.dispatchEvent(new Event('scroll'));
        expect(host.updates).toBe(updates);
    });

    it('lets go of the strip when the host disconnects, and re-reads on reconnect', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollLeft: 300 });
        c.attach(strip, wrap);
        c.hostDisconnected();
        expect(wrap.className).toBe('');
        // Moved back into the document: attach() runs again from the host's updated(),
        // and hostConnected() re-reads whatever is attached at that point.
        c.attach(strip, wrap);
        c.hostConnected();
        expect(wrap.classList.contains('has-left')).toBe(true);
    });

    it('watches the strip for width changes, not just scrolls', () => {
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair();
        c.attach(strip, wrap);
        expect(c._ro.observe).toHaveBeenCalledWith(strip);
    });

    it('re-reads once the webfonts have landed — they widen the labels, not the box', () => {
        const ready = Promise.resolve();
        document.fonts = { ready };
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair({ scrollWidth: 300, clientWidth: 300 });
        c.attach(strip, wrap);
        const measure = vi.spyOn(c, 'measure');
        return ready.then(() => {
            expect(measure).toHaveBeenCalled();
        });
    });

    it('survives a browser without ResizeObserver', () => {
        delete globalThis.ResizeObserver;
        const c = new ScrollEdgesController(host);
        const { wrap, strip } = makePair();
        expect(() => c.attach(strip, wrap)).not.toThrow();
        expect(wrap.classList.contains('has-right')).toBe(true);
    });

    it('does nothing at all when attached to nothing', () => {
        const c = new ScrollEdgesController(host);
        expect(() => c.attach(null)).not.toThrow();
        expect(() => c.measure()).not.toThrow();
        expect(host.updates).toBe(0);
    });

    it('falls back to marking the strip itself when given no target', () => {
        const c = new ScrollEdgesController(host);
        const strip = makeStrip({ scrollLeft: 0 });
        c.attach(strip);
        expect(strip.classList.contains('has-right')).toBe(true);
    });
});
