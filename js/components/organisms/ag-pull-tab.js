import { LitElement, html, nothing } from 'lit';

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
        // Tap (< 10px) or swipe up (> 30px upward)
        if (Math.abs(deltaY) < 10 || deltaY < -30) {
            e.preventDefault();
            this._restore();
        }
    }

    render() {
        if (!this._hasItems) return nothing;

        if (!this._visible) return nothing;

        return html`
            <div
                role="button"
                aria-label="Restore Now Playing"
                title="Restore Now Playing"
                style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:56px;height:18px;display:flex;align-items:center;justify-content:center;z-index:103;border-radius:6px 6px 0 0;background:var(--color-warning,#f59e0b);border:1px solid var(--color-warning,#f59e0b);border-bottom:none;cursor:pointer"
                @click="${this._restore}"
                @touchstart="${this._handleTouchStart}"
                @touchend="${this._handleTouchEnd}"
            >
                <div style="width:28px;height:3px;background:rgba(0,0,0,0.4);border-radius:2px;pointer-events:none"></div>
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
