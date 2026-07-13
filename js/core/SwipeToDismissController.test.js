/**
 * Unit tests for SwipeToDismissController — the shared left-swipe-to-remove
 * gesture. Driven with a fake host, a fake element (imperative transform target)
 * and synthetic pointer events (no DOM).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PartType } from 'lit/directive.js';
import { SwipeToDismissController, SINGLE, SwipeRowDirective } from './SwipeToDismissController.js';

/** Fake ReactiveControllerHost. */
const makeHost = () => ({ addController: vi.fn(), requestUpdate: vi.fn() });

/** Fake swiped element — records style writes and pointer-capture calls. */
const makeEl = () => ({
    style: {},
    captured: null,
    setPointerCapture(id) { this.captured = id; },
    releasePointerCapture() { this.captured = null; },
});

/** Synthetic pointer event. */
const ev = (clientX, type = 'pointermove', { pointerId = 1, button = 0 } = {}) =>
    ({ clientX, type, pointerId, button });

describe('SwipeToDismissController', () => {
    let host;
    beforeEach(() => { host = makeHost(); });

    it('registers itself with the host', () => {
        const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
        expect(host.addController).toHaveBeenCalledWith(c);
    });

    it('drags the element left imperatively past the slop', () => {
        const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, 'row1');
        expect(el.style.transition).toBe('none');
        expect(el.captured).toBe(1);
        c.move(ev(150));                 // dx = -50, past 8px slop
        expect(c.swiping).toBe(true);
        expect(el.style.transform).toBe('translateX(-50px)');
    });

    it('does not move within the slop', () => {
        const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, 'row1');
        c.move(ev(195));                 // dx = -5
        expect(c.swiping).toBe(false);
        expect(el.style.transform).toBeUndefined();
    });

    it('clamps right swipes to zero (left only)', () => {
        const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, 'row1');
        c.move(ev(300));                 // dx = +100 → clamped
        expect(el.style.transform).toBe('translateX(0px)');
    });

    it('commits onCommit(key) and snaps back when released past the threshold', () => {
        const onCommit = vi.fn();
        const c = new SwipeToDismissController(host, { onCommit });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, 'row1');
        c.move(ev(40));                  // dx = -160 (>= 140)
        c.end(ev(40, 'pointerup'));
        expect(onCommit).toHaveBeenCalledWith('row1');
        expect(el.style.transition).toBe('transform 180ms ease-out');
        expect(el.style.transform).toBe('translateX(0px)');
        expect(el.captured).toBe(null);
    });

    it('does NOT commit when released below the threshold', () => {
        const onCommit = vi.fn();
        const c = new SwipeToDismissController(host, { onCommit });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, 'row1');
        c.move(ev(120));                 // dx = -80
        c.end(ev(120, 'pointerup'));
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('never commits on pointercancel, even past the threshold', () => {
        const onCommit = vi.fn();
        const c = new SwipeToDismissController(host, { onCommit });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, 'row1');
        c.move(ev(40));                  // dx = -160
        c.end(ev(40, 'pointercancel'));
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('respects a custom commit threshold', () => {
        const onCommit = vi.fn();
        const c = new SwipeToDismissController(host, { onCommit, commitPx: 60 });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, 'row1');
        c.move(ev(130));                 // dx = -70 (>= 60)
        c.end(ev(130, 'pointerup'));
        expect(onCommit).toHaveBeenCalledWith('row1');
    });

    it('ignores non-primary buttons', () => {
        const onCommit = vi.fn();
        const c = new SwipeToDismissController(host, { onCommit });
        const el = makeEl();
        c.start(ev(200, 'pointerdown', { button: 2 }), el, 'row1');
        c.move(ev(40));
        c.end(ev(40, 'pointerup'));
        expect(c.swiping).toBe(false);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('carries the SINGLE key for single-element hosts', () => {
        const onCommit = vi.fn();
        const c = new SwipeToDismissController(host, { onCommit });
        const el = makeEl();
        c.start(ev(200, 'pointerdown'), el, SINGLE);
        c.move(ev(40));
        c.end(ev(40, 'pointerup'));
        expect(onCommit).toHaveBeenCalledWith(SINGLE);
    });

    describe('multi-touch / pointer isolation', () => {
        it('ignores a second concurrent pointerdown and never mixes their state', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const elA = makeEl(), elB = makeEl();
            c.start(ev(200, 'pointerdown', { pointerId: 1 }), elA, 'A');
            // Second finger on row B while A is in flight → ignored.
            c.start(ev(300, 'pointerdown', { pointerId: 2 }), elB, 'B');
            c.move(ev(150, 'pointermove', { pointerId: 1 }));   // A: dx = -50
            expect(elA.style.transform).toBe('translateX(-50px)');
            expect(elB.style.transform).toBeUndefined();        // B never touched
            // A committed release removes A, not B.
            c.move(ev(40, 'pointermove', { pointerId: 1 }));
            c.end(ev(40, 'pointerup', { pointerId: 1 }));
            expect(onCommit).toHaveBeenCalledTimes(1);
            expect(onCommit).toHaveBeenCalledWith('A');
        });

        it('ignores move/end from a foreign pointerId', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const el = makeEl();
            c.start(ev(200, 'pointerdown', { pointerId: 1 }), el, 'row1');
            c.move(ev(40, 'pointermove', { pointerId: 9 }));    // foreign → ignored
            expect(el.style.transform).toBeUndefined();
            c.end(ev(40, 'pointerup', { pointerId: 9 }));       // foreign → ignored
            expect(onCommit).not.toHaveBeenCalled();
        });
    });

    describe('trailing-click suppression + timer cleanup', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('keeps `swiping` true through the trailing click, then clears it', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const el = makeEl();
            c.start(ev(200, 'pointerdown'), el, 'row1');
            c.move(ev(150));
            c.end(ev(150, 'pointerup'));
            expect(c.swiping).toBe(true);
            vi.runAllTimers();
            expect(c.swiping).toBe(false);
        });

        it('does not leave `swiping` set after a plain tap (never crossed the slop)', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const el = makeEl();
            c.start(ev(200, 'pointerdown'), el, 'row1');
            c.end(ev(200, 'pointerup'));      // no move → not active
            expect(c.swiping).toBe(false);
        });

        it('hostDisconnected clears the pending timer', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const el = makeEl();
            c.start(ev(200, 'pointerdown'), el, 'row1');
            c.move(ev(150));
            c.end(ev(150, 'pointerup'));
            c.hostDisconnected();
            expect(c.swiping).toBe(false);
            vi.runAllTimers();               // no throw, nothing left to fire
            expect(c.swiping).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// swipeRow directive
// ---------------------------------------------------------------------------

/** Fake DOM element recording class/style writes and listeners. */
const makeDirEl = () => {
    const classes = new Set();
    const listeners = {};
    return {
        style: {},
        classList: {
            add: (...c) => c.forEach((x) => classes.add(x)),
            remove: (...c) => c.forEach((x) => classes.delete(x)),
            contains: (c) => classes.has(c),
        },
        addEventListener: (t, h) => { (listeners[t] ||= []).push(h); },
        removeEventListener: (t, h) => { listeners[t] = (listeners[t] || []).filter((x) => x !== h); },
        _listeners: listeners,
    };
};

describe('swipeRow directive', () => {
    const partFor = (el) => ({ type: PartType.ELEMENT, element: el });

    it('stamps the coexistence contract and wires the four pointer listeners', () => {
        const el = makeDirEl();
        const part = partFor(el);
        const ctrl = { start: vi.fn(), move: vi.fn(), end: vi.fn() };
        const d = new SwipeRowDirective(part);
        d.update(part, [ctrl, 'row1', true]);

        expect(el.classList.contains('no-swipe')).toBe(true);
        expect(el.classList.contains('ag-swipe-row')).toBe(true);
        expect(el.style.touchAction).toBe('pan-y');
        expect(el.style.userSelect).toBe('none');
        expect(el._listeners.pointerdown).toHaveLength(1);
        expect(el._listeners.pointermove).toHaveLength(1);
        expect(el._listeners.pointerup).toHaveLength(1);
        expect(el._listeners.pointercancel).toHaveLength(1);

        // pointerdown forwards to controller.start(e, el, key) with the live key
        const e = { type: 'pointerdown' };
        el._listeners.pointerdown[0](e);
        expect(ctrl.start).toHaveBeenCalledWith(e, el, 'row1');
    });

    it('does not wire or stamp when enabled is false', () => {
        const el = makeDirEl();
        const part = partFor(el);
        const d = new SwipeRowDirective(part);
        d.update(part, [{ start() {}, move() {}, end() {} }, 'row1', false]);
        expect(el._listeners.pointerdown).toBeUndefined();
        expect(el.classList.contains('no-swipe')).toBe(false);
    });

    it('tears down listeners and the contract on disconnect', () => {
        const el = makeDirEl();
        const part = partFor(el);
        const d = new SwipeRowDirective(part);
        d.update(part, [{ start() {}, move() {}, end() {} }, 'row1', true]);
        d.disconnected();
        expect(el._listeners.pointerdown).toHaveLength(0);
        expect(el.classList.contains('no-swipe')).toBe(false);
        expect(el.classList.contains('ag-swipe-row')).toBe(false);
    });

    it('throws when used outside an element binding', () => {
        expect(() => new SwipeRowDirective({ type: PartType.CHILD })).toThrow();
    });
});
