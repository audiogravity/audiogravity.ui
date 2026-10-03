/**
 * @module AgBackToTop
 * @description Back-to-top button for a scrolling pane: round, in the pane's bottom-right
 * corner, shown once the pane has scrolled by more than its own height, with a ring round it
 * that fills with the reading. A press brings the pane back to its top — smoothly, or at once
 * for a reader who asked for less motion — and hands keyboard focus to the pane, since the
 * button itself is gone once the top is reached.
 *
 * Put it last in the pane it follows: it holds itself to the pane's bottom-right corner
 * (sticky, back-to-top.css), so a wheel or a swipe that starts on it still scrolls the pane,
 * and at the end of the pane it rests under the last line instead of over it. Its distance
 * from the pane's edges is the pane's own padding — include the safe-area inset in the bottom
 * one where the pane runs to the edge of the screen.
 *
 * A pane is not focusable by itself, and must not become so for good: Chromium rings a
 * focused element as soon as a key is pressed, so a click in the text then an arrow key would
 * frame the whole pane. The press makes it focusable for that one focus, without a ring
 * (back-to-top.css), and gives it back as it was when the focus leaves — the pattern of
 * GOV.UK's skip links. A pane with a tabindex of its own is a stop its container chose: it is
 * focused as it is.
 *
 * The same button as audiogravity.app's landing and online manual
 * (audiogravity.site/assets/to-top.js), here for the app's Manual window, whose chapters
 * scroll in a pane of their own rather than in the page.
 *
 * Cost when idle: nothing. The ring is drawn on each frame the pane moves, and only then —
 * one passive listener, one paint per frame at most — and again when the pane changes size
 * (a rotation, a resized window) or an image in it loads (the length to read changes).
 *
 * @element ag-back-to-top
 *
 * @prop {?HTMLElement} target - The scrolling pane to follow and bring back up.
 *
 * @dependency css/components/back-to-top.css
 */
import { LitElement, html } from 'lit';
import { iconArrowUp } from '../../ag-icons.js';
import { scrollBehavior } from '../../core/scroll-behavior.js';

/** Class of a pane focused by a press, whose ring back-to-top.css takes off. */
const FOCUS_TARGET = 'ag-btt-focus-target';

export class AgBackToTop extends LitElement {
    static properties = {
        target:   { attribute: false },
        _visible: { state: true },
        _read:    { state: true },
    };

    createRenderRoot() {
        return this; // Light DOM — styled by css/components/back-to-top.css
    }

    constructor() {
        super();
        /** @type {?HTMLElement} */
        this.target = null;
        /** Whether the pane has scrolled by more than its own height. */
        this._visible = false;
        /** Share of the pane read, 0 to 1. */
        this._read = 0;
        /** @type {?HTMLElement} the pane the listeners are on */
        this._followed = null;
        /** @type {?ResizeObserver} watches the followed pane's size */
        this._resize = null;
        this._queued = false;
        this._onScroll = this._onScroll.bind(this);
        this._paint = this._paint.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.target) this._follow(this.target);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._follow(null);
    }

    willUpdate(changed) {
        if (changed.has('target') && this.isConnected) this._follow(this.target);
    }

    /**
     * Move the listeners to a new pane, and read its position at once.
     * @param {?HTMLElement} pane - The pane to follow, or null to stop following.
     */
    _follow(pane) {
        if (pane === this._followed) return;
        if (this._followed) {
            this._followed.removeEventListener('scroll', this._onScroll);
            this._followed.removeEventListener('load', this._onScroll, true);
            this._resize?.disconnect();
            this._resize = null;
        }
        this._followed = pane;
        if (pane) {
            pane.addEventListener('scroll', this._onScroll, { passive: true });
            // An image's `load` does not bubble: caught on its way down instead.
            pane.addEventListener('load', this._onScroll, true);
            if (typeof ResizeObserver === 'function') {
                this._resize = new ResizeObserver(this._onScroll);
                this._resize.observe(pane);
            }
            this._paint();
        } else {
            this._visible = false;
            this._read = 0;
        }
    }

    /** Ask for one paint on the next frame, however many events arrive before it. */
    _onScroll() {
        if (this._queued) return;
        this._queued = true;
        requestAnimationFrame(this._paint);
    }

    /** Read the pane's position: whether to show the button, and how much is read. */
    _paint() {
        this._queued = false;
        const pane = this._followed;
        if (!pane) return;
        const max = pane.scrollHeight - pane.clientHeight;
        // Rounded to a tenth of a percent: finer than the ring can show, coarser than the
        // scroll events, so a slow scroll does not re-render on every pixel.
        this._read = max > 0 ? Math.round(Math.min(1, Math.max(0, pane.scrollTop / max)) * 1000) / 1000 : 0;
        this._visible = pane.scrollTop > pane.clientHeight;
    }

    /** Bring the pane back to its top, and give it the keyboard focus. */
    _onClick() {
        const pane = this._followed;
        if (!pane) return;
        pane.scrollTo({ top: 0, behavior: scrollBehavior() });
        this._focusPane(pane);
    }

    /**
     * Focus the pane, made focusable — and ring-free — for this one focus when it is not
     * already; both are taken back when the focus leaves it.
     * @param {HTMLElement} pane - The pane to focus.
     */
    _focusPane(pane) {
        if (!pane.hasAttribute('tabindex')) {
            pane.setAttribute('tabindex', '-1');
            pane.classList.add(FOCUS_TARGET);
            pane.addEventListener('blur', () => {
                pane.removeAttribute('tabindex');
                pane.classList.remove(FOCUS_TARGET);
            }, { once: true });
        }
        pane.focus({ preventScroll: true });
    }

    render() {
        return html`
            <button type="button" class="plain-btn ag-btt ${this._visible ? 'is-visible' : ''}"
                aria-label="Back to top" @click=${this._onClick}>
                <svg class="ag-btt-ring" viewBox="0 0 52 52" aria-hidden="true">
                    <circle class="ag-btt-track" cx="26" cy="26" r="24" pathLength="100" />
                    <circle class="ag-btt-progress" cx="26" cy="26" r="24" pathLength="100"
                        style="stroke-dashoffset: ${(100 - 100 * this._read).toFixed(1)}" />
                </svg>
                <svg class="ag-btt-arrow" viewBox="0 0 24 24" aria-hidden="true">${iconArrowUp}</svg>
            </button>
        `;
    }
}

customElements.define('ag-back-to-top', AgBackToTop);
