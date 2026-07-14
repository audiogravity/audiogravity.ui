/**
 * @module SwipeToDismissController
 * @description Lit Reactive Controller + `swipeRow` directive for a left-swipe-to-
 * remove gesture on list rows / cards. One shared implementation for every AG list
 * that supports swipe-to-remove (radio stations, UPnP servers, UPnP renderers, the
 * playback queue), replacing four hand-maintained copies.
 *
 * The gesture is pointer-based (touch + mouse) and left-only; it commits past a
 * threshold. A TOUCH gesture that STARTS in the screen-edge band is ignored — that
 * band is reserved for the panel-open swipes (settings from the right edge, sidebar
 * from the left), so an edge swipe opens the panel without also removing a row; a
 * mouse is exempt (it never opens those panels). See gesture-constants.js. A
 * browser-initiated `pointercancel`
 * (vertical scroll / system gesture) never commits. The swiped row is transformed
 * IMPERATIVELY (`el.style.transform`)
 * during the drag, so a drag does not re-render the host — only the committed
 * removal does. The trailing `click` after a swipe is suppressed via `swiping`.
 *
 * Wire it with the `swipeRow` directive, which also stamps the two invariants the
 * gesture needs to coexist with the app: `.no-swipe` (so the global tab-swipe in
 * js/gestures.js ignores the row) and `touch-action: pan-y` (so vertical list
 * scroll passes through while horizontal pan is captured):
 *
 *   this._swipe = new SwipeToDismissController(this, { onCommit: (id) => this._remove(id) });
 *   // template, per row:
 *   <div class="my-row ag-swipe-row" ${swipeRow(this._swipe, item.id)}> … </div>
 *   // single-element host: pass SINGLE (or omit the key) and read it in onCommit:
 *   <div class="card ag-swipe-row" ${swipeRow(this._swipe)}> … </div>
 */

import { nothing } from 'lit';
import { directive, PartType } from 'lit/directive.js';
import { AsyncDirective } from 'lit/async-directive.js';
import { isScreenEdgeStart } from './gesture-constants.js';

const DEFAULT_COMMIT_PX = 140;
const DEFAULT_SLOP_PX = 8;

/** Key for a host with a single swipeable element (no per-row identity). */
export const SINGLE = Symbol('single-swipe-target');

export class SwipeToDismissController {
    /**
     * @param {import('lit').ReactiveControllerHost} host - The component host.
     * @param {Object} options
     * @param {(key: *) => void} options.onCommit - Called with the swiped row's key when a swipe commits.
     * @param {number} [options.commitPx=140] - Distance (px) past which the swipe commits.
     * @param {number} [options.slopPx=8] - Distance past which movement counts as a swipe, not a tap.
     */
    constructor(host, { onCommit, commitPx = DEFAULT_COMMIT_PX, slopPx = DEFAULT_SLOP_PX } = {}) {
        this.host = host;
        this._onCommit = onCommit;
        this._commitPx = commitPx;
        this._slopPx = slopPx;
        this._el = null;
        this._key = null;
        this._pointerId = null;   // isolates the active gesture from other concurrent pointers
        this._startX = 0;
        this._dx = 0;
        this._active = false;
        this._clearTimer = null;
        host.addController(this);
    }

    hostDisconnected() {
        if (this._clearTimer !== null) { clearTimeout(this._clearTimer); this._clearTimer = null; }
        this._el = null; this._key = null; this._pointerId = null;
        this._startX = 0; this._dx = 0; this._active = false;
    }

    /**
     * True while a swipe is in progress or just ended — read in tap/click handlers
     * to suppress the click the browser fires at the end of a swipe.
     * @returns {boolean}
     */
    get swiping() { return this._active; }

    /**
     * Begin a swipe (wired by `swipeRow` on pointerdown).
     * @param {PointerEvent} e
     * @param {HTMLElement} el - The swiped element (transformed imperatively).
     * @param {*} key - Row identity passed to onCommit (SINGLE for single-element hosts).
     */
    start(e, el, key) {
        if (e.button !== undefined && e.button !== 0) return;   // primary button / touch only
        // A TOUCH gesture that BEGINS in the screen-edge band is reserved for the
        // panel-open swipes (settings/config panel from the right edge, sidebar from
        // the left — both touch-only). Yield so a right-edge swipe opens the panel
        // WITHOUT also removing this row. A mouse never triggers those panels, so it
        // is exempt and can still start a drag anywhere. See gesture-constants.js.
        if (e.pointerType !== 'mouse' && isScreenEdgeStart(e.clientX)) return;
        if (this._pointerId !== null) return;                    // a gesture is already in flight
        this._el = el;
        this._key = key;
        this._pointerId = e.pointerId;
        this._startX = e.clientX;
        this._dx = 0;
        this._active = false;
        el.style.transition = 'none';
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* old Safari */ }
    }

    /** @param {PointerEvent} e */
    move(e) {
        if (this._pointerId === null || e.pointerId !== this._pointerId) return;
        const dx = e.clientX - this._startX;
        if (!this._active && Math.abs(dx) > this._slopPx) this._active = true;
        if (this._active) {
            this._dx = Math.min(0, dx);   // left only — clamp rightward drag to 0
            if (this._el) this._el.style.transform = `translateX(${this._dx}px)`;
        }
    }

    /**
     * Finish the gesture (wired on BOTH pointerup and pointercancel). Commits when
     * the pointer was released past the threshold; a `pointercancel` never commits.
     * @param {PointerEvent} e
     */
    end(e) {
        if (this._pointerId === null || e.pointerId !== this._pointerId) return;
        const el = this._el;
        const key = this._key;
        const wasActive = this._active;
        const committed = wasActive && e.type !== 'pointercancel' && this._dx <= -this._commitPx;
        try { el && el.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (el) {
            el.style.transition = 'transform 180ms ease-out';   // animate the snap-back
            el.style.transform = 'translateX(0px)';
        }
        this._el = null; this._key = null; this._pointerId = null; this._startX = 0; this._dx = 0;
        if (committed && this._onCommit) this._onCommit(key);
        // Keep `swiping` true through the trailing click (browsers fire it after
        // pointerup), then clear on the next tick — only if a swipe actually happened.
        if (this._clearTimer !== null) { clearTimeout(this._clearTimer); this._clearTimer = null; }
        if (wasActive) {
            this._active = true;
            this._clearTimer = setTimeout(() => { this._active = false; this._clearTimer = null; }, 0);
        } else {
            this._active = false;
        }
    }
}

/**
 * Lit element directive that wires a row for a {@link SwipeToDismissController}:
 * attaches the pointer listeners and stamps `.no-swipe` + `touch-action: pan-y` so
 * every consumer inherits the coexistence contract by construction.
 */
export class SwipeRowDirective extends AsyncDirective {
    constructor(part) {
        super(part);
        if (part.type !== PartType.ELEMENT) {
            throw new Error('swipeRow() can only be used in an element binding');
        }
        this._el = null;
        this._ctrl = null;
        this._key = SINGLE;
        this._enabled = true;
        this._handlers = null;
    }

    render(_controller, _key, _enabled) { return nothing; }

    update(part, [controller, key = SINGLE, enabled = true]) {
        this._ctrl = controller;
        this._key = key;
        if (this._el !== part.element) { this._teardown(); this._el = part.element; }
        this._enabled = !!enabled;
        if (this._enabled) {
            if (!this._handlers) this._setup();
            // Re-assert the contract every render: a sibling class=/style= binding on
            // the same element (e.g. an `active` class toggle) re-sets the whole
            // attribute and would otherwise wipe .no-swipe / touch-action. The
            // element part runs after those bindings in template order.
            this._stamp();
        } else if (this._handlers) {
            this._teardown();
        }
        return nothing;
    }

    /** Stamp the coexistence contract on the row (idempotent). */
    _stamp() {
        const el = this._el;
        if (!el) return;
        // .ag-swipe-row → position:relative so the (opaque) row paints ABOVE the
        // absolutely-positioned .ag-swipe-reveal; .no-swipe → opt out of the global
        // tab-swipe (js/gestures.js).
        el.classList.add('no-swipe', 'ag-swipe-row');
        el.style.touchAction = 'pan-y';    // vertical scroll passes through; horizontal is ours
        el.style.userSelect = 'none';      // don't select row text while dragging
    }

    _setup() {
        const el = this._el;
        if (!el) return;
        const start = (e) => this._ctrl && this._ctrl.start(e, el, this._key);
        const move  = (e) => this._ctrl && this._ctrl.move(e);
        const end   = (e) => this._ctrl && this._ctrl.end(e);
        el.addEventListener('pointerdown', start);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
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
            el.classList.remove('no-swipe', 'ag-swipe-row');
            el.style.touchAction = '';
            el.style.userSelect = '';
        }
        this._handlers = null;
    }

    disconnected() { this._teardown(); }
    reconnected() { if (this._enabled) { this._setup(); this._stamp(); } }
}

/**
 * `${swipeRow(controller, key, enabled)}` — wire an element as a swipe-to-remove row.
 * @param {SwipeToDismissController} controller
 * @param {*} [key=SINGLE] - Row identity passed to onCommit.
 * @param {boolean} [enabled=true] - When false, the gesture is not wired (e.g. a non-swipeable row).
 */
export const swipeRow = directive(SwipeRowDirective);
