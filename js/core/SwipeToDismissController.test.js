/**
 * Unit tests for SwipeToDismissController — the shared left-swipe-to-remove
 * gesture. Driven with a fake host, a fake element (imperative transform target)
 * and synthetic pointer events (no DOM).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PartType } from 'lit/directive.js';
import { SwipeToDismissController, SINGLE, SwipeRowDirective } from './SwipeToDismissController.js';
import { EDGE_GESTURE_PX } from './gesture-constants.js';

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
const ev = (clientX, type = 'pointermove', { pointerId = 1, button = 0, pointerType } = {}) =>
    ({ clientX, type, pointerId, button, pointerType });

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

    describe('screen-edge guard (panel-open swipe coexistence)', () => {
        // jsdom's default window.innerWidth (1024); read it rather than mutate the
        // shared window so other suites are unaffected.
        const W = window.innerWidth;

        it('ignores a gesture that starts in the right-edge band (reserved for the settings panel)', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const el = makeEl();
            c.start(ev(W - Math.floor(EDGE_GESTURE_PX / 2), 'pointerdown'), el, 'row1'); // inside right band
            expect(el.captured).toBe(null);            // never armed → no pointer capture
            c.move(ev(40));                            // no-op: gesture never started
            c.end(ev(40, 'pointerup'));
            expect(c.swiping).toBe(false);
            expect(onCommit).not.toHaveBeenCalled();
            expect(el.style.transform).toBeUndefined();
        });

        it('ignores a gesture that starts in the left-edge band (reserved for the sidebar)', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const el = makeEl();
            c.start(ev(Math.floor(EDGE_GESTURE_PX / 2), 'pointerdown'), el, 'row1');     // inside left band
            expect(el.captured).toBe(null);
            c.move(ev(-100));
            c.end(ev(-100, 'pointerup'));
            expect(c.swiping).toBe(false);
            expect(onCommit).not.toHaveBeenCalled();
        });

        it('still arms and commits a gesture that starts clear of the reserved bands', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const el = makeEl();
            const startX = EDGE_GESTURE_PX + 5;        // just clear of the left band
            c.start(ev(startX, 'pointerdown'), el, 'row1');
            expect(el.captured).toBe(1);
            c.move(ev(startX - 160));                  // dx = -160 (>= 140)
            c.end(ev(startX - 160, 'pointerup'));
            expect(onCommit).toHaveBeenCalledWith('row1');
        });

        it('exempts the MOUSE: an edge-start mouse drag still arms (no touch panel to coexist with)', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const el = makeEl();
            const startX = W - Math.floor(EDGE_GESTURE_PX / 2);   // inside right band
            c.start(ev(startX, 'pointerdown', { pointerType: 'mouse' }), el, 'row1');
            expect(el.captured).toBe(1);               // armed despite the edge — it's a mouse
            c.move(ev(startX - 160));                  // dx = -160
            c.end(ev(startX - 160, 'pointerup'));
            expect(onCommit).toHaveBeenCalledWith('row1');
        });
    });

    describe('interactive-target guard (row action buttons)', () => {
        /** Fake event target: `closest` matches when `insideControl` is set. */
        const target = (insideControl) => ({ closest: () => (insideControl ? {} : null) });

        it('ignores a gesture that starts on an action button', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const el = makeEl();
            c.start({ ...ev(200, 'pointerdown'), target: target(true) }, el, 'row1');
            expect(el.captured).toBe(null);            // never armed → the button keeps its tap
            c.move(ev(60));                            // a drift that would otherwise commit
            c.end(ev(60, 'pointerup'));
            expect(c.swiping).toBe(false);
            expect(onCommit).not.toHaveBeenCalled();
            expect(el.style.transform).toBeUndefined();
        });

        it('still arms when the gesture starts on the row itself', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const el = makeEl();
            c.start({ ...ev(200, 'pointerdown'), target: target(false) }, el, 'row1');
            expect(el.captured).toBe(1);
            c.move(ev(40));                            // dx = -160
            c.end(ev(40, 'pointerup'));
            expect(onCommit).toHaveBeenCalledWith('row1');
        });

        it('ignores an interactive ancestor that sits OUTSIDE the swiped row', () => {
            // `closest` walks the whole ancestor chain, so a <label> or <a>
            // wrapping the list would otherwise disable swiping for every row.
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const outsideControl = {};
            const el = { ...makeEl(), contains: () => false };
            c.start(
                { ...ev(200, 'pointerdown'), target: { closest: () => outsideControl } },
                el, 'row1',
            );
            expect(el.captured).toBe(1);           // the row still swipes
            c.move(ev(40));
            c.end(ev(40, 'pointerup'));
            expect(onCommit).toHaveBeenCalledWith('row1');
        });

        it('still ignores a control that IS inside the swiped row', () => {
            const onCommit = vi.fn();
            const c = new SwipeToDismissController(host, { onCommit });
            const insideControl = {};
            const el = { ...makeEl(), contains: (node) => node === insideControl };
            c.start(
                { ...ev(200, 'pointerdown'), target: { closest: () => insideControl } },
                el, 'row1',
            );
            expect(el.captured).toBe(null);
            c.move(ev(40));
            c.end(ev(40, 'pointerup'));
            expect(onCommit).not.toHaveBeenCalled();
        });

        it('arms when the event carries no DOM target (synthetic events must not throw)', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const el = makeEl();
            expect(() => c.start(ev(200, 'pointerdown'), el, 'row1')).not.toThrow();
            expect(el.captured).toBe(1);
        });
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

    /**
     * The red "Remove" backdrop must exist only while a swipe is being made. A row
     * left transformed sits on its own compositing layer over that backdrop, which
     * on iOS showed as a red frame around the row, long after the gesture (site#12).
     */
    describe('resting state — nothing red under an untouched row', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        /** Is the red backdrop of this wrap uncovered? */
        const revealShown = (wrap) =>
            wrap.querySelector('.ag-swipe-reveal').style.visibility === 'visible';

        /** A real wrap/backdrop/row trio, as the four consumers build it. */
        const makeRow = () => {
            const wrap = document.createElement('div');
            wrap.className = 'ag-swipe-wrap';
            wrap.innerHTML = '<div class="ag-swipe-reveal">Remove</div>';
            const row = document.createElement('div');
            row.className = 'ag-swipe-row';
            wrap.appendChild(row);
            document.body.appendChild(wrap);
            return { wrap, row };
        };

        afterEach(() => { document.body.innerHTML = ''; });

        it('reveals the backdrop while dragging and hides it once the row is back', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { wrap, row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            expect(revealShown(wrap)).toBe(false);   // not yet armed
            c.move(ev(150));
            expect(revealShown(wrap)).toBe(true);
            c.end(ev(150, 'pointerup'));
            vi.runAllTimers();
            expect(revealShown(wrap)).toBe(false);
        });

        it('clears the inline transform once the snap-back has run', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.move(ev(150));
            c.end(ev(150, 'pointerup'));
            expect(row.style.transform).toBe('translateX(0px)');   // animating back
            vi.runAllTimers();
            expect(row.style.transform).toBe('');                  // no compositing layer left
            expect(row.style.transition).toBe('');
        });

        it('leaves no trace at all after a plain tap', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { wrap, row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.end(ev(200, 'pointerup'));      // never crossed the slop
            expect(row.style.transform).toBe('');
            expect(row.style.transition).toBe('');
            expect(revealShown(wrap)).toBe(false);
        });

        it('does not strip a row a new gesture has already taken over', () => {
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.move(ev(150));
            c.end(ev(150, 'pointerup'));
            c.start(ev(200, 'pointerdown'), row, 'row1');   // grabbed again mid-snap-back
            c.move(ev(120));
            vi.runAllTimers();                             // the first gesture's timer fires
            expect(row.style.transform).toBe('translateX(-80px)');
        });

        it('cleans up per row: a gesture on another row does not strand the first', () => {
            // One controller serves every row of a list. A single cleanup slot meant
            // that swiping row A and then merely TAPPING row B cancelled A's cleanup
            // and left A composited over a visible backdrop for the session.
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const a = makeRow();
            const b = makeRow();
            c.start(ev(200, 'pointerdown'), a.row, 'a');
            c.move(ev(150));
            c.end(ev(150, 'pointerup'));          // A: snap-back running, cleanup pending
            c.start(ev(200, 'pointerdown'), b.row, 'b');
            c.end(ev(200, 'pointerup'));          // B: a plain tap
            vi.runAllTimers();
            expect(a.row.style.transform).toBe('');
            expect(a.row.style.transition).toBe('');
            expect(revealShown(a.wrap)).toBe(false);
        });

        it('hides the backdrop at once on a commit, before the wrap is reused', () => {
            // The consumers map their lists, so a wrap is recycled by position: the
            // next item would arrive on a red rectangle it never uncovered.
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { wrap, row } = makeRow();
            c.start(ev(300, 'pointerdown'), row, 'row1');
            c.move(ev(100));                      // -200px, past the 140px threshold
            c.end(ev(100, 'pointerup'));
            expect(revealShown(wrap)).toBe(false);
            expect(row.style.transform).toBe('translateX(0px)');   // still animates out
        });

        it('does not reveal the backdrop for a rightward drag', () => {
            // Arming crosses the slop in EITHER direction, but the row is clamped to 0
            // going right — a still row over a red rectangle is the arrangement iOS
            // draws a seam around.
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { wrap, row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.move(ev(260));                      // dx = +60
            expect(revealShown(wrap)).toBe(false);
            expect(row.style.transform).toBe('translateX(0px)');
        });

        it('rests a row still animating when the host goes away', () => {
            // These hosts render into light DOM, so a disconnect is often a MOVE: the
            // subtree comes back, and would come back composited over a backdrop.
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { wrap, row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.move(ev(150));
            c.end(ev(150, 'pointerup'));
            c.hostDisconnected();                 // inside the snap-back window
            expect(row.style.transform).toBe('');
            expect(revealShown(wrap)).toBe(false);
        });

        it('release() frees a row un-wired mid-gesture, and the controller with it', () => {
            // A row can stop being swipeable with the finger down (the queue recomputes
            // it per render). No pointer event can reach end() afterwards.
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { wrap, row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.move(ev(120));
            c.release(row);
            expect(row.style.transform).toBe('');
            expect(revealShown(wrap)).toBe(false);
            const other = makeRow();              // the controller must not stay wedged
            c.start(ev(200, 'pointerdown'), other.row, 'row2');
            c.move(ev(150));
            expect(other.row.style.transform).toBe('translateX(-50px)');
        });

        it('keeps `swiping` true for a fresh drag started during the trailing click', () => {
            // The previous gesture's 0 ms timer used to survive into the new drag and
            // flip `swiping` false under the moving finger, re-opening the click guard
            // every consumer uses to suppress the trailing click.
            const c = new SwipeToDismissController(host, { onCommit: vi.fn() });
            const { row } = makeRow();
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.move(ev(150));
            c.end(ev(150, 'pointerup'));
            c.start(ev(200, 'pointerdown'), row, 'row1');
            c.move(ev(120));
            vi.runAllTimers();
            expect(c.swiping).toBe(true);
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
