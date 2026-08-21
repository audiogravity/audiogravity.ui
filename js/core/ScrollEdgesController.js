/**
 * @module ScrollEdgesController
 * @description Marks the edges of a strip that still hides content, so a bar can fade
 * the side that continues instead of cutting a label in half with nothing to say so.
 *
 * Every horizontal strip in the app hides its scrollbar (it would sit across the
 * labels on a bar that short), which leaves overflow to be discovered by dragging.
 * That was survivable while the longest strip held five items; the HIGHRESAUDIO
 * browse now offers fifteen pills, most of them off-screen.
 *
 * It writes two classes — `has-left` / `has-right` — straight onto a target element,
 * and asks the host to re-render for one thing only: whether the strip overflows AT
 * ALL, which decides whether the chevrons exist. Dragging the strip therefore costs
 * two class toggles, not a component render: on this box a re-render walks every
 * album row on the page, and CPU spent there is CPU taken from playback.
 *
 * Writing classes is safe next to Lit as long as the target's `class` attribute is a
 * static string in the template — Lit sets such an attribute once and never touches
 * it again. Bind it to a changing value and Lit would wipe these two on every render.
 *
 * BACKLOG: four other strips need the same markers — see audiogravity.ops/BACKLOG.md.
 *
 * Cost when idle: nothing. One passive `scroll` listener, one ResizeObserver, and a
 * one-shot re-measure when webfonts land (they change label widths after first paint,
 * and the observed box does not move when its own content grows).
 */

/** Slack, in pixels, when comparing scroll offsets. */
// Fractional layout (a 0.5px border, a zoomed page) means scrollLeft rarely lands
// exactly on 0 or on the maximum. Compared strictly, the fade at the far end never
// switches off — a marker that stays lit at the end of the list is a marker that lies.
const EDGE_SLACK = 1;

export class ScrollEdgesController {
    /** @param {import('lit').ReactiveControllerHost} host */
    constructor(host) {
        this.host = host;
        /** @type {boolean} True while content is hidden past the left edge. */
        this.left = false;
        /** @type {boolean} True while content is hidden past the right edge. */
        this.right = false;
        /** @type {boolean} True while the strip hides content on either side. */
        this.overflows = false;
        /** @type {Element | null} */
        this._el = null;
        /** @type {Element | null} */
        this._target = null;
        this._ro = null;
        this._onScroll = () => this.measure();
        host.addController(this);
    }

    /** Re-measure after the host is moved back into the document. */
    hostConnected() { this.measure(); }

    hostDisconnected() { this.detach(); }

    /**
     * Watch a scrolling strip, replacing any strip watched before.
     *
     * Safe to call on every `updated()`: re-attaching the same pair returns without
     * touching the layout, so the host does not have to track whether it already did
     * — and reading the strip's geometry after each render would force a full layout
     * on every album page appended.
     *
     * @param {Element | null | undefined} el - The element with `overflow-x: auto`.
     * @param {Element | null} [target] - Element the classes go on (default: `el`).
     * @returns {void}
     */
    attach(el, target = null) {
        const mark = target ?? el ?? null;
        if (el && el === this._el && mark === this._target) return;
        this.detach();
        if (!el) return;
        this._el = el;
        this._target = mark;
        // Passive: this listener must never be able to hold up a finger mid-drag.
        el.addEventListener('scroll', this._onScroll, { passive: true });
        // A width change answers the question differently without a scroll ever
        // happening — a rotation, an iPad split view, a sidebar opening.
        if (typeof ResizeObserver === 'function') {
            this._ro = new ResizeObserver(this._onScroll);
            this._ro.observe(el);
        }
        // A webfont swapping in widens every label inside a box whose own size never
        // changes, so neither the observer nor a render would catch it.
        document.fonts?.ready?.then(() => this.measure());
        this.measure();
    }

    /**
     * Stop watching the current strip, and take the markers off with it.
     * @returns {void}
     */
    detach() {
        if (this._el) this._el.removeEventListener('scroll', this._onScroll);
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
        this._target?.classList.remove('has-left', 'has-right');
        this._el = null;
        this._target = null;
        this.left = false;
        this.right = false;
        this.overflows = false;
    }

    /**
     * Re-read both edges, write the markers, and ask the host to re-render only when
     * the strip started or stopped overflowing (the chevrons appear and disappear
     * with that, and with nothing else).
     * @returns {void}
     */
    measure() {
        const el = this._el;
        if (!el) return;
        // A strip in a hidden view reports no width at all; its edges are unknowable
        // rather than absent, and answering "nothing is hidden" would drop the markers
        // and never bring them back on a browser without a ResizeObserver.
        if (!el.clientWidth) return;
        const left  = el.scrollLeft > EDGE_SLACK;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_SLACK;
        if (left === this.left && right === this.right) return;
        this.left = left;
        this.right = right;
        this._target?.classList.toggle('has-left', left);
        this._target?.classList.toggle('has-right', right);
        const overflows = left || right;
        if (overflows === this.overflows) return;
        this.overflows = overflows;
        this.host.requestUpdate();
    }
}
