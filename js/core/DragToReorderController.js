/**
 * @module DragToReorderController
 * @description Lit Reactive Controller + `dragHandle` directive: move a row of a list by
 * holding its handle and sliding it up or down. The row follows the finger, the rows it
 * passes slide aside to make room for it, and the list scrolls by itself while the finger
 * stays near the top or the bottom of what shows of it. On release, `onCommit(key, toIndex)`
 * gets the row's identity and the index it was dropped at among the rows; the host
 * reorders its data, and the inline styles are dropped once it has rendered the new
 * order — so nothing jumps.
 *
 * Touch first. The handle takes the gesture whole: the directive stamps
 * `touch-action: none` on it, so a slide started there moves the row instead of
 * scrolling the page. Started anywhere else on the row, a gesture is the row's own — the
 * list's scroll, and swipe-to-remove: SwipeToDismissController ignores a gesture that
 * starts on a button, and the handle is one. A disabled handle (`enabled` false) gives
 * the touch back to the list.
 *
 * The rows are the elements matching `rowSelector` that share the dragged row's parent,
 * in document order — the order the host renders them in. They are moved imperatively
 * (`style.transform`), so a drag renders nothing: the host renders once, on commit. A
 * `pointercancel` — the system taking the touch — puts every row back and commits
 * nothing.
 *
 *   this._drag = new DragToReorderController(this, {
 *       rowSelector: '.my-row',
 *       onCommit: (key, toIndex) => this._move(key, toIndex),
 *   });
 *   // template, per row:
 *   <div class="my-row"> <button class="plain-btn" ${dragHandle(this._drag, item.id)}>…</button> … </div>
 */

import { nothing } from 'lit';
import { directive, PartType } from 'lit/directive.js';
import { AsyncDirective } from 'lit/async-directive.js';

/** How long the passed rows take to slide aside, and the dropped row to settle back (ms). */
export const SHIFT_MS = 150;

/** Height of the bands, at the top and the bottom of what shows of the list, where it scrolls by itself (px). */
export const EDGE_PX = 64;

/** Fastest scroll, with the finger at the very edge (px per frame). */
export const MAX_SCROLL_PX = 16;

/** Step of the search, from the bottom of a list's box up, for where the list shows (px). */
const COVER_STEP_PX = 4;

/**
 * The element that scrolls the list: the nearest ancestor whose content overflows a
 * scrolling box, else the document.
 * @param {Element} el
 * @returns {Element}
 */
function scrollerOf(el) {
    for (let n = el.parentElement; n; n = n.parentElement) {
        const { overflowY } = getComputedStyle(n);
        if (/(auto|scroll)/.test(overflowY) && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement || document.documentElement;
}

/**
 * The box a scroller shows its content in, in viewport coordinates, within the window.
 * @param {Element} scroller
 * @returns {{top: number, bottom: number}}
 */
function boxOf(scroller) {
    const box = (scroller === document.scrollingElement || scroller === document.documentElement)
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
    return { top: box.top, bottom: Math.min(window.innerHeight, box.bottom) };
}

/**
 * Where what shows of a list ends, in viewport coordinates: its scroller's box, less what
 * is drawn over the bottom of it. On a phone the app's content runs to the bottom of the
 * screen, under the mini-player — or its pull tab once folded (css/layout.css,
 * --bottom-clearance) —, and the band that scrolls the list lay under them, out of the
 * finger's reach (measured at 390×844 on 2026-11-10). Found by asking the page what it
 * draws, from the box's bottom up, along the finger's line; once a gesture — the bars do
 * not move under a held row. A list the page itself scrolls is taken whole: everything
 * is the page's. Without hit testing (jsdom), the box.
 * @param {Element} scroller
 * @param {number} x - The finger's viewport X.
 * @returns {number} Viewport Y.
 */
function visibleBottom(scroller, x) {
    const { top, bottom } = boxOf(scroller);
    if (typeof document.elementFromPoint !== 'function') return bottom;
    for (let y = bottom - 1; y > top; y -= COVER_STEP_PX) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || scroller.contains(hit)) return Math.min(bottom, y + 1);
    }
    return bottom;
}

/**
 * Drop the inline styles a drag put on a row, without letting them animate away.
 * @param {HTMLElement} row
 */
function rest(row) {
    row.style.transition = '';
    row.style.transform = '';
    row.style.zIndex = '';
    row.style.boxShadow = '';
}

export class DragToReorderController {
    /**
     * @param {import('lit').ReactiveControllerHost & HTMLElement} host - The list's component.
     * @param {Object} options
     * @param {string} options.rowSelector - What a row is: its parent holds the list.
     * @param {(key: *, toIndex: number) => void} options.onCommit - A row dropped at another
     *        index among the rows; called once, at the release.
     * @param {() => void} [options.onEnd] - Every gesture's end, committed or not: what the
     *        host held back while the finger was down can go through.
     * @param {() => number} [options.visibleTop] - Where the list starts to show, in viewport
     *        coordinates, when a sticky header covers the top of its scroller. What shows
     *        of the list is the scroller's box otherwise.
     */
    constructor(host, { rowSelector, onCommit, onEnd, visibleTop } = {}) {
        this.host = host;
        this._rowSelector = rowSelector;
        this._onCommit = onCommit;
        this._onEnd = onEnd;
        this._visibleTop = visibleTop;
        /** The gesture in progress, or null. */
        this._drag = null;
        /** The rows of a gesture let go without a move, sliding back: `{rows, timer}`, or null. */
        this._settling = null;
        this._tick = this._tick.bind(this);
        // Optional: the unit tests stand the host in with a bare object.
        host.addController?.(this);
    }

    /** True while a row is held. @returns {boolean} */
    get dragging() { return this._drag !== null; }

    /** The list left the page with a row held: put everything back, at once. */
    hostDisconnected() {
        if (this._drag) this._finish(false);
        this._settle();
    }

    /**
     * Put at rest, now, the rows of a gesture let go without a move and still sliding
     * back. A new gesture measures the rows and lifts one of them: their cleanup, run
     * later, took the lift — the shadow, the place above the others — from under the
     * finger, and the slide of the rows it passes.
     */
    _settle() {
        const s = this._settling;
        if (!s) return;
        this._settling = null;
        clearTimeout(s.timer);
        s.rows.forEach(rest);
    }

    /**
     * A finger down on a handle (wired by `dragHandle`): the row is held.
     * @param {PointerEvent} e
     * @param {HTMLElement} handle
     * @param {*} key - The row's identity, handed back to onCommit.
     */
    start(e, handle, key) {
        if (this._drag) return;                                   // one row at a time
        if (e.button !== undefined && e.button !== 0) return;    // primary button / touch only
        const row = handle.closest?.(this._rowSelector);
        if (!row?.parentElement) return;
        const rows = [...row.parentElement.children].filter((el) => el.matches?.(this._rowSelector));
        const from = rows.indexOf(row);
        if (from < 0) return;
        // No text selection, no emulated mouse events under the finger.
        e.preventDefault?.();
        // Measured at rest: rows still sliding back from a gesture let go a moment ago
        // would be measured on their way.
        this._settle();
        const rects = rows.map((r) => r.getBoundingClientRect());
        const scroller = scrollerOf(row);
        this._drag = {
            handle, key, row, rows, from, to: from,
            pointerId: e.pointerId,
            startY: e.clientY, y: e.clientY,
            scroller, startScroll: scroller.scrollTop,
            bottom: visibleBottom(scroller, e.clientX),
            tops: rects.map((r) => r.top), heights: rects.map((r) => r.height),
            frame: null,
        };
        try { handle.setPointerCapture?.(e.pointerId); } catch (_) { /* old Safari */ }
        // Lifted above the rows it passes, which slide aside with a short transition.
        row.style.transition = 'none';
        row.style.zIndex = '2';
        row.style.boxShadow = 'var(--shadow-lg)';
        for (const other of rows) if (other !== row) other.style.transition = `transform ${SHIFT_MS}ms ease`;
        this._drag.frame = requestAnimationFrame(this._tick);
    }

    /** @param {PointerEvent} e */
    move(e) {
        const d = this._drag;
        if (!d || e.pointerId !== d.pointerId) return;
        d.y = e.clientY;
        this._layout();
    }

    /**
     * The finger lifted (pointerup), or the system took the touch (pointercancel, which
     * never commits).
     * @param {PointerEvent} e
     */
    end(e) {
        const d = this._drag;
        if (!d || e.pointerId !== d.pointerId) return;
        this._finish(e.type !== 'pointercancel' && d.to !== d.from);
    }

    /**
     * The handle stopped being one while held — its row left the list, or the list's
     * order no longer lets it move: put everything back.
     * @param {HTMLElement} handle
     */
    release(handle) {
        if (this._drag?.handle === handle) this._finish(false);
    }

    /**
     * Where the held row is, in the coordinates the rows had when it was taken: the
     * finger's travel plus what the list scrolled since.
     * @returns {number} The row's offset from its place (px).
     */
    _offset() {
        const d = this._drag;
        return (d.y - d.startY) + (d.scroller.scrollTop - d.startScroll);
    }

    /**
     * Move the held row under the finger, and the rows it passed aside. A row is passed
     * once the held one's leading edge — its bottom going down, its top going up — is
     * past that row's middle: half a row of travel takes a neighbour's place, not a
     * whole one, which dragged behind the finger.
     */
    _layout() {
        const d = this._drag;
        const dy = this._offset();
        d.row.style.transform = `translateY(${dy}px)`;
        const h = d.heights[d.from];
        const top = d.tops[d.from] + dy;
        const bottom = top + h;
        let to = d.from;
        for (let i = 0; i < d.rows.length; i++) {
            if (i === d.from) continue;
            const theirs = d.tops[i] + d.heights[i] / 2;
            if (i < d.from && top < theirs) to = Math.min(to, i);
            if (i > d.from && bottom > theirs) to = Math.max(to, i);
        }
        d.to = to;
        for (let i = 0; i < d.rows.length; i++) {
            if (i === d.from) continue;
            const shift = (i >= to && i < d.from) ? h : (i <= to && i > d.from) ? -h : 0;
            d.rows[i].style.transform = shift ? `translateY(${shift}px)` : '';
        }
    }

    /**
     * What shows of the list, in viewport coordinates: its scroller's box, within the
     * window, below a sticky header when the host names where the list starts, and above
     * what covers its bottom (visibleBottom, found when the row was taken).
     * @returns {{top: number, bottom: number}}
     */
    _area() {
        const d = this._drag;
        const top = Math.max(0, boxOf(d.scroller).top, this._visibleTop?.() ?? 0);
        return { top, bottom: d.bottom };
    }

    /** Each frame while a row is held: scroll the list near its edges, the row along with it. */
    _tick() {
        const d = this._drag;
        if (!d) return;
        const { top, bottom } = this._area();
        let speed = 0;
        if (d.y < top + EDGE_PX) {
            speed = -MAX_SCROLL_PX * Math.min(1, (top + EDGE_PX - d.y) / EDGE_PX);
        } else if (d.y > bottom - EDGE_PX) {
            speed = MAX_SCROLL_PX * Math.min(1, (d.y - (bottom - EDGE_PX)) / EDGE_PX);
        }
        if (speed) {
            const before = d.scroller.scrollTop;
            d.scroller.scrollTop = before + speed;
            if (d.scroller.scrollTop !== before) this._layout();
        }
        d.frame = requestAnimationFrame(this._tick);
    }

    /**
     * End the gesture: commit and let the host render the new order, or put the rows back.
     * @param {boolean} committed
     */
    _finish(committed) {
        const d = this._drag;
        this._drag = null;
        cancelAnimationFrame(d.frame);
        try { d.handle.releasePointerCapture?.(d.pointerId); } catch (_) { /* ignore */ }
        if (committed) {
            this._onCommit?.(d.key, d.to);
            // The host renders the new order in a microtask, the rows still shifted;
            // their styles go in the same turn, before any frame paints the two together.
            Promise.resolve(this.host.updateComplete).then(() => d.rows.forEach(rest));
        } else {
            d.row.style.transition = `transform ${SHIFT_MS}ms ease`;
            for (const r of d.rows) r.style.transform = '';
            this._settling = { rows: d.rows, timer: setTimeout(() => this._settle(), SHIFT_MS + 20) };
        }
        this._onEnd?.();
    }
}

/**
 * Lit element directive that makes an element the handle of a row for a
 * {@link DragToReorderController}: it wires the pointer listeners and stamps
 * `touch-action: none`, so a slide from it moves the row rather than the page.
 * Disabled, it wires nothing and leaves the touch to the list.
 */
export class DragHandleDirective extends AsyncDirective {
    constructor(part) {
        super(part);
        if (part.type !== PartType.ELEMENT) {
            throw new Error('dragHandle() can only be used in an element binding');
        }
        this._el = null;
        this._ctrl = null;
        this._key = undefined;
        this._enabled = true;
        this._handlers = null;
    }

    render(_controller, _key, _enabled) { return nothing; }

    update(part, [controller, key, enabled = true]) {
        this._ctrl = controller;
        this._key = key;
        if (this._el !== part.element) { this._teardown(); this._el = part.element; }
        this._enabled = !!enabled;
        if (this._enabled) {
            if (!this._handlers) this._setup();
        } else if (this._handlers) {
            this._teardown();
        }
        return nothing;
    }

    _setup() {
        const el = this._el;
        if (!el) return;
        const start = (e) => this._ctrl?.start(e, el, this._key);
        const move  = (e) => this._ctrl?.move(e);
        const end   = (e) => this._ctrl?.end(e);
        el.addEventListener('pointerdown', start);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.style.touchAction = 'none';
        this._handlers = { start, move, end };
    }

    _teardown() {
        const el = this._el;
        if (el && this._handlers) {
            const { start, move, end } = this._handlers;
            el.removeEventListener('pointerdown', start);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', end);
            el.removeEventListener('pointercancel', end);
            el.style.touchAction = '';
            // Its row can leave the list with the finger still down: no pointer event can
            // reach end() then, so the gesture is let go here.
            this._ctrl?.release?.(el);
        }
        this._handlers = null;
    }

    disconnected() { this._teardown(); }
    reconnected() { if (this._enabled) this._setup(); }
}

/**
 * `${dragHandle(controller, key, enabled)}` — make an element the handle of its row.
 * @param {DragToReorderController} controller
 * @param {*} key - The row's identity, handed back to onCommit.
 * @param {boolean} [enabled=true] - When false, the handle moves nothing and the touch scrolls the list.
 */
export const dragHandle = directive(DragHandleDirective);
