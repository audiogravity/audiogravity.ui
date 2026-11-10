/**
 * Unit tests for DragToReorderController — moving a row of a list by its handle.
 *
 * Real elements (jsdom), whose boxes are given by hand, and synthetic pointer events
 * handed to the controller as the directive hands them. What a finger does on a phone
 * is measured in Chromium on the queue; these pin the arithmetic and the bookkeeping:
 * which index a row is dropped at, which rows slide aside and by how much, that a
 * cancelled gesture commits nothing, that the styles go once the host has rendered,
 * and that the list scrolls by itself near its edges.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PartType } from 'lit/directive.js';
import {
    DragToReorderController, DragHandleDirective, SHIFT_MS, EDGE_PX, MAX_SCROLL_PX,
} from './DragToReorderController.js';

/** Row height, and the gap above the first row (px). */
const H = 50;
const TOP = 100;

/** Fake ReactiveControllerHost, its next render already done. */
const makeHost = () => ({ addController: vi.fn(), updateComplete: Promise.resolve(true) });

/** Synthetic pointer event. */
const ev = (clientY, type = 'pointermove', { pointerId = 1, button = 0 } = {}) =>
    ({ clientY, type, pointerId, button, preventDefault: vi.fn() });

/**
 * A list of `n` rows, each with its handle, laid out one under the other.
 * @returns {{list: HTMLElement, rows: HTMLElement[], handles: HTMLElement[]}}
 */
function makeList(n = 4, parent = document.body) {
    const list = document.createElement('div');
    const rows = [];
    const handles = [];
    for (let i = 0; i < n; i++) {
        const row = document.createElement('div');
        row.className = 'row';
        row.getBoundingClientRect = () => ({ top: TOP + i * H, height: H, bottom: TOP + (i + 1) * H });
        const handle = document.createElement('button');
        row.appendChild(handle);
        list.appendChild(row);
        rows.push(row);
        handles.push(handle);
    }
    // Something that is not a row, in the same parent: never counted.
    list.appendChild(Object.assign(document.createElement('div'), { className: 'footer' }));
    parent.appendChild(list);
    return { list, rows, handles };
}

let frames;
beforeEach(() => {
    document.body.innerHTML = '';
    frames = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => { frames.push(cb); return frames.length; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('DragToReorderController', () => {
    const make = (options = {}) => {
        const host = makeHost();
        const onCommit = vi.fn();
        const onEnd = vi.fn();
        const c = new DragToReorderController(host, { rowSelector: '.row', onCommit, onEnd, ...options });
        return { host, c, onCommit, onEnd };
    };

    it('registers itself with the host', () => {
        const { host, c } = make();
        expect(host.addController).toHaveBeenCalledWith(c);
    });

    it('lifts the held row and readies the others to slide', () => {
        const { c } = make();
        const { rows, handles } = makeList();
        const down = ev(TOP + 25, 'pointerdown');
        c.start(down, handles[0], 'a');
        expect(c.dragging).toBe(true);
        expect(down.preventDefault).toHaveBeenCalled();
        expect(rows[0].style.zIndex).toBe('2');
        expect(rows[0].style.boxShadow).toBe('var(--shadow-lg)');
        expect(rows[1].style.transition).toBe(`transform ${SHIFT_MS}ms ease`);
    });

    it('drops a row moved down past the next one\'s middle one place lower, that one sliding up', async () => {
        const { c, onCommit, onEnd } = make();
        const { rows, handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.move(ev(TOP + 25 + 30));                  // its bottom past row 1's middle: half a row
        expect(rows[0].style.transform).toBe('translateY(30px)');
        expect(rows[1].style.transform).toBe(`translateY(${-H}px)`);
        expect(rows[2].style.transform).toBe('');
        c.end(ev(TOP + 55, 'pointerup'));
        expect(onCommit).toHaveBeenCalledWith('a', 1);
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(c.dragging).toBe(false);
        await Promise.resolve();
        await Promise.resolve();
        for (const r of rows) expect(r.style.transform).toBe('');   // gone once the host rendered
        expect(rows[0].style.zIndex).toBe('');
    });

    it('passes no row a little short of half a row, either way', () => {
        const { c } = make();
        const { rows, handles } = makeList();
        c.start(ev(TOP + H + 25, 'pointerdown'), handles[1], 'b');
        c.move(ev(TOP + H + 25 + H / 2 - 1));
        expect(rows[2].style.transform).toBe('');
        c.move(ev(TOP + H + 25 - H / 2 + 1));
        expect(rows[0].style.transform).toBe('');
        c.move(ev(TOP + H + 25 - H / 2 - 1));
        expect(rows[0].style.transform).toBe(`translateY(${H}px)`);
    });

    it('drops the last row moved up to the top at index 0, the others sliding down', () => {
        const { c, onCommit } = make();
        const { rows, handles } = makeList();
        c.start(ev(TOP + 3 * H + 25, 'pointerdown'), handles[3], 'd');
        c.move(ev(TOP + 10));                         // its top above row 0's middle
        expect(rows[0].style.transform).toBe(`translateY(${H}px)`);
        expect(rows[1].style.transform).toBe(`translateY(${H}px)`);
        expect(rows[2].style.transform).toBe(`translateY(${H}px)`);
        c.end(ev(TOP + 10, 'pointerup'));
        expect(onCommit).toHaveBeenCalledWith('d', 0);
    });

    it('commits nothing for a row dropped where it was, and puts it back', () => {
        vi.useFakeTimers();
        const { c, onCommit, onEnd } = make();
        const { rows, handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.move(ev(TOP + 40));                          // not past row 1's middle
        c.end(ev(TOP + 40, 'pointerup'));
        expect(onCommit).not.toHaveBeenCalled();
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(rows[0].style.transition).toBe(`transform ${SHIFT_MS}ms ease`);   // slides back
        vi.advanceTimersByTime(SHIFT_MS + 20);
        expect(rows[0].style.transition).toBe('');
        expect(rows[0].style.boxShadow).toBe('');
    });

    it('keeps the lift of a row taken while the one let go before still slides back', () => {
        // The slide-back's cleanup, run later, took the new row's shadow and its place
        // above the others from under the finger, and the slide of the rows it passed.
        vi.useFakeTimers();
        const { c } = make();
        const { rows, handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.end(ev(TOP + 25, 'pointerup'));               // let go where it was: slides back
        c.start(ev(TOP + H + 25, 'pointerdown'), handles[1], 'b');
        vi.advanceTimersByTime(SHIFT_MS + 20);
        expect(rows[1].style.zIndex).toBe('2');
        expect(rows[1].style.boxShadow).toBe('var(--shadow-lg)');
        expect(rows[0].style.transition).toBe(`transform ${SHIFT_MS}ms ease`);   // still slides aside
        c.move(ev(TOP + H + 25 - 30));                   // and the gesture goes on
        expect(rows[0].style.transform).toBe(`translateY(${H}px)`);
    });

    it('puts the rows sliding back at rest at once when the list leaves the page', () => {
        vi.useFakeTimers();
        const { c } = make();
        const { rows, handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.end(ev(TOP + 25, 'pointerup'));
        c.hostDisconnected();
        expect(rows[0].style.transition).toBe('');
        expect(rows[0].style.boxShadow).toBe('');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('commits nothing when the system takes the touch (pointercancel)', () => {
        const { c, onCommit, onEnd } = make();
        const { handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.move(ev(TOP + 160));
        c.end(ev(TOP + 160, 'pointercancel'));
        expect(onCommit).not.toHaveBeenCalled();
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('holds one row at a time, and only the finger that took it moves it', () => {
        const { c, onCommit } = make();
        const { rows, handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.start(ev(TOP + 75, 'pointerdown', { pointerId: 2 }), handles[1], 'b');
        c.move(ev(TOP + 200, 'pointermove', { pointerId: 2 }));
        expect(rows[0].style.transform).toBe('');
        expect(rows[1].style.zIndex).toBe('');
        c.end(ev(TOP + 200, 'pointerup', { pointerId: 2 }));
        expect(c.dragging).toBe(true);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('takes no secondary button, and no handle outside a row', () => {
        const { c } = make();
        const { handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown', { button: 2 }), handles[0], 'a');
        expect(c.dragging).toBe(false);
        const stray = document.body.appendChild(document.createElement('button'));
        c.start(ev(0, 'pointerdown'), stray, 'x');
        expect(c.dragging).toBe(false);
    });

    it('lets go when its handle stops being one, or the list leaves the page', () => {
        const { c, onCommit, onEnd } = make();
        const { handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.release(handles[1]);                          // another handle: nothing
        expect(c.dragging).toBe(true);
        c.release(handles[0]);
        expect(c.dragging).toBe(false);
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.hostDisconnected();
        expect(c.dragging).toBe(false);
        expect(onCommit).not.toHaveBeenCalled();
        expect(onEnd).toHaveBeenCalledTimes(2);
    });

    it('scrolls the list by itself near its bottom edge, the held row along with it', () => {
        const scroller = document.createElement('div');
        scroller.style.overflowY = 'auto';
        Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
        Object.defineProperty(scroller, 'clientHeight', { value: 400 });
        let top = 0;
        Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (v) => { top = v; } });
        scroller.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
        document.body.appendChild(scroller);
        const { c } = make();
        const { rows, handles } = makeList(4, scroller);
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.move(ev(500));                               // at the very bottom edge
        frames.at(-1)();                               // one frame
        expect(top).toBe(MAX_SCROLL_PX);
        expect(rows[0].style.transform).toBe(`translateY(${500 - TOP - 25 + MAX_SCROLL_PX}px)`);
        c.move(ev(500 - EDGE_PX - 1));                 // out of the band: no more scrolling
        frames.at(-1)();
        expect(top).toBe(MAX_SCROLL_PX);
        c.move(ev(5));                                 // near the top: back up
        frames.at(-1)();
        expect(top).toBeLessThan(MAX_SCROLL_PX);
    });

    it('scrolls the list from just above what covers its bottom, the finger in reach', () => {
        // On a phone the list runs under the mini-player: a band at the bottom of the
        // scroller's box lay under the bar, out of the finger's reach.
        const scroller = document.createElement('div');
        scroller.style.overflowY = 'auto';
        Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
        Object.defineProperty(scroller, 'clientHeight', { value: 400 });
        let top = 0;
        Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (v) => { top = v; } });
        scroller.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
        document.body.appendChild(scroller);
        const bar = document.body.appendChild(document.createElement('div'));   // not the list's
        const { rows, handles } = makeList(4, scroller);
        const BAR_TOP = 433;
        const hits = [];
        document.elementFromPoint = vi.fn((x, y) => { hits.push(x); return y >= BAR_TOP ? bar : rows[0]; });
        try {
            const { c } = make();
            c.start({ ...ev(TOP + 25, 'pointerdown'), clientX: 30 }, handles[0], 'a');
            expect(new Set(hits)).toEqual(new Set([30]));      // along the finger's line
            c.move(ev(BAR_TOP - 3));                           // just above the bar
            frames.at(-1)();
            expect(top).toBeGreaterThan(MAX_SCROLL_PX * 0.9);
            c.move(ev(BAR_TOP - EDGE_PX - 8));                 // above the band: still
            const at = top;
            frames.at(-1)();
            expect(top).toBe(at);
        } finally {
            delete document.elementFromPoint;
        }
    });

    it('starts the list under a sticky header the host names', () => {
        const scroller = document.createElement('div');
        scroller.style.overflowY = 'auto';
        Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
        Object.defineProperty(scroller, 'clientHeight', { value: 400 });
        let top = 300;
        Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (v) => { top = v; } });
        scroller.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
        document.body.appendChild(scroller);
        const { c } = make({ visibleTop: () => 120 });
        const { handles } = makeList(4, scroller);
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.move(ev(150));                               // under the header, in the band below it
        frames.at(-1)();
        expect(top).toBeLessThan(300);                 // scrolls up from there
        c.move(ev(120 + EDGE_PX + 1));                 // past the band
        const at = top;
        frames.at(-1)();
        expect(top).toBe(at);
    });

    it('stops its frames with the gesture', () => {
        const { c } = make();
        const { handles } = makeList();
        c.start(ev(TOP + 25, 'pointerdown'), handles[0], 'a');
        c.end(ev(TOP + 25, 'pointerup'));
        expect(cancelAnimationFrame).toHaveBeenCalled();
        const before = frames.length;
        frames.at(-1)();                               // a frame already asked for: no other
        expect(frames.length).toBe(before);
    });
});

describe('dragHandle directive', () => {
    /** A fake element recording its listeners and style writes. */
    const makeDirEl = () => {
        const listeners = {};
        return {
            style: {},
            addEventListener: (t, h) => { (listeners[t] ||= []).push(h); },
            removeEventListener: (t, h) => { listeners[t] = (listeners[t] || []).filter((x) => x !== h); },
            _listeners: listeners,
        };
    };
    const partFor = (el) => ({ type: PartType.ELEMENT, element: el });

    it('wires the four pointer listeners and takes the touch whole', () => {
        const el = makeDirEl();
        const part = partFor(el);
        const ctrl = { start: vi.fn(), move: vi.fn(), end: vi.fn(), release: vi.fn() };
        const d = new DragHandleDirective(part);
        d.update(part, [ctrl, 'q1', true]);
        expect(el.style.touchAction).toBe('none');
        for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
            expect(el._listeners[t]).toHaveLength(1);
        }
        const e = { type: 'pointerdown' };
        el._listeners.pointerdown[0](e);
        expect(ctrl.start).toHaveBeenCalledWith(e, el, 'q1');
    });

    it('disabled, wires nothing and leaves the touch to the list', () => {
        const el = makeDirEl();
        const part = partFor(el);
        const ctrl = { start: vi.fn(), move: vi.fn(), end: vi.fn(), release: vi.fn() };
        const d = new DragHandleDirective(part);
        d.update(part, [ctrl, 'q1', false]);
        expect(el._listeners.pointerdown).toBeUndefined();
        expect(el.style.touchAction).toBeUndefined();
    });

    it('turned off, or out of the page, unwires and lets the gesture go', () => {
        const el = makeDirEl();
        const part = partFor(el);
        const ctrl = { start: vi.fn(), move: vi.fn(), end: vi.fn(), release: vi.fn() };
        const d = new DragHandleDirective(part);
        d.update(part, [ctrl, 'q1', true]);
        d.update(part, [ctrl, 'q1', false]);
        expect(el._listeners.pointerdown).toHaveLength(0);
        expect(el.style.touchAction).toBe('');
        expect(ctrl.release).toHaveBeenCalledWith(el);
        d.update(part, [ctrl, 'q1', true]);
        d.disconnected();
        expect(el._listeners.pointerdown).toHaveLength(0);
        expect(ctrl.release).toHaveBeenCalledTimes(2);
    });

    it('throws when used outside an element binding', () => {
        expect(() => new DragHandleDirective({ type: PartType.CHILD })).toThrow();
    });
});
