import { LitElement, html, nothing } from 'lit';
import { GESTURE_SLOP_PX } from '../../core/gesture-constants.js';

/**
 * @module AgPullTab
 * @description Manages two persistent controls for the Now Playing bar:
 *
 * 1. Pull-tab — centered at the bottom, visible when bar is dismissed.
 *    Tap or swipe up to restore the bar.
 *
 * 2. Side toggle — fixed to the right edge, always visible when a source
 *    is active. Shows ↓ to dismiss or ↑ to restore. Follows the bar via
 *    `--now-playing-height` CSS variable.
 *
 * Communicates with AgNowPlaying via document-level CustomEvents:
 * - Listens to  `ag-np-state`   — { dismissed: boolean, hasItems: boolean }
 * - Dispatches  `ag-np-restore` — triggers AgNowPlaying to slide back in
 *
 * @element ag-pull-tab
 */
export class AgPullTab extends LitElement {
    static properties = {
        /** @type {boolean} Whether the pull-tab (center bottom) is visible */
        _visible: { state: true },
        /** @type {boolean} Whether a source is active (controls side toggle) */
        _hasItems: { state: true },
        /** @type {boolean} Whether the bar is currently dismissed */
        _dismissed: { state: true },
    };

    constructor() {
        super();
        this._visible = false;
        this._hasItems = false;
        this._dismissed = false;
        this._touchStartY = 0;
        this._boundOnState = this._onNpState.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('ag-np-state', this._boundOnState);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('ag-np-state', this._boundOnState);
    }

    /**
     * Handle state broadcast from AgNowPlaying.
     * @param {CustomEvent} e
     */
    _onNpState(e) {
        this._hasItems = e.detail.hasItems;
        this._dismissed = e.detail.dismissed;
        this._visible = e.detail.dismissed && e.detail.hasItems;
    }

    /** Restore the Now Playing bar. */
    _restore() {
        document.dispatchEvent(new CustomEvent('ag-np-restore'));
    }

    _handleTouchStart(e) {
        this._touchStartY = e.touches[0].clientY;
    }

    _handleTouchEnd(e) {
        const deltaY = e.changedTouches[0].clientY - this._touchStartY;
        // Anything that is not a deliberate downward drag restores the bar: a tap, a
        // sloppy tap, or an upward swipe of any length.
        //
        // The old rule (`|deltaY| < 10 || deltaY < -30`) left a dead band between 10
        // and 30 px where nothing happened — which is exactly what a finger produces
        // on a small target. The @click fallback did not rescue it: the browser
        // cancels the synthetic click once the finger passes its own slop (~10 px),
        // so both paths failed together and the gesture had to be retried.
        if (deltaY < GESTURE_SLOP_PX) {
            e.preventDefault();
            this._restore();
        }
    }

    /**
     * The outer div is the TOUCH TARGET, not the visible tab.
     *
     * It stays anchored at `bottom:0` and aligns its content to `flex-end`, so the
     * visible 18 px bar keeps touching the screen edge while the extra height lands
     * ABOVE it — where a finger misses a small target. Both properties are load-
     * bearing, and breaking either was tried and shipped once: moving the container up
     * (for a safe-area inset) or aligning to `flex-start` lifts the bar off the edge,
     * and it stops reading as a tab growing out of the screen — it becomes an orphaned
     * rectangle floating over the page.
     *
     * 44 px is the Apple/Google minimum for a touch target; the tab used to offer 18.
     */
    render() {
        if (!this._hasItems) return nothing;

        if (!this._visible) return nothing;

        return html`
            <div
                role="button"
                aria-label="Restore Now Playing"
                title="Restore Now Playing"
                style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:56px;height:44px;display:flex;align-items:flex-end;justify-content:center;z-index:103;background:none;border:none;padding:0;-webkit-tap-highlight-color:transparent"
                @click="${this._restore}"
                @touchstart="${this._handleTouchStart}"
                @touchend="${this._handleTouchEnd}"
            >
                <div style="width:56px;height:18px;display:flex;align-items:center;justify-content:center;z-index:103;border-radius:6px 6px 0 0;background:var(--color-warning);border:1px solid var(--color-warning);border-bottom:none;cursor:pointer;pointer-events:none"><div style="width:28px;height:3px;background:rgba(0,0,0,0.4);border-radius:2px;pointer-events:none"></div></div>
            </div>
            ${!window.matchMedia('(pointer: coarse)').matches ? html`
            <button
                aria-label="Restore Now Playing"
                title="Restore Now Playing"
                style="position:fixed;right:0;bottom:var(--footer-height,0px);z-index:103;display:flex;align-items:center;justify-content:center;background:#000;border:1px solid #000;border-right:none;border-radius:var(--radius-sm,4px) 0 0 0;padding:var(--spacing-sm,6px) 6px;color:#fff;cursor:pointer;font-size:var(--font-size-sm,12px)"
                @click="${this._restore}"
            >∧</button>` : nothing}
        `;
    }
}

customElements.define('ag-pull-tab', AgPullTab);
