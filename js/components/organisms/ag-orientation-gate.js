/**
 * @module AgOrientationGate
 * @description Full-screen overlay that enforces portrait orientation where the
 * OS can't be locked (iOS, which ignores the manifest orientation and has no
 * Screen Orientation lock API). It renders a "rotate to portrait" prompt that
 * CSS reveals only when the installed PWA is shown in landscape on a touch
 * device (phone or tablet) while the portrait lock is enabled
 * (`body.pwa-standalone.lock-portrait`, see css/components/orientation-gate.css).
 *
 * On Android the manifest + Screen Orientation API already prevent landscape, so
 * this overlay never appears there; it is the iOS enforcement + a universal
 * fallback. On mount it also (re-)applies the Screen Orientation lock for the
 * current setting so an installed Android PWA honours the user's choice.
 *
 * While the overlay is shown it marks the rest of the app `inert` (so keyboard /
 * assistive tech can't reach the hidden controls behind the opaque cover), and it
 * offers an escape hatch that turns the lock off — otherwise a device physically
 * fixed in landscape (or the very Settings toggle needed to disable the lock,
 * which sits behind the overlay) would be unreachable.
 *
 * @element ag-orientation-gate
 * @dependency css/components/orientation-gate.css - .orientation-gate styles
 */
import { LitElement, html } from 'lit';
import { iconSmartphone } from '../../ag-icons.js';
import { applyOrientationLock } from '../../orientation-lock.js';

export class AgOrientationGate extends LitElement {
    createRenderRoot() {
        return this; // Light DOM — picks up .orientation-gate from the global stylesheet
    }

    constructor() {
        super();
        this._sync = this._syncInert.bind(this);
        this._mq = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.classList.add('orientation-gate');
        // Note: the lock itself (body class + touch Screen Orientation lock) is
        // applied from a platform-neutral startup path (common.js / login.js), not
        // here — this component is purely the visual overlay + a11y + escape hatch.

        // Keep the gated app out of the tab / AT order while the overlay is shown.
        // The overlay is CSS-driven, so re-sync on rotation and on lock changes.
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            this._mq = window.matchMedia('(orientation: landscape)');
            this._mq.addEventListener('change', this._sync);
        }
        window.addEventListener('orientation-lock-changed', this._sync);
        this._syncInert();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._mq?.removeEventListener('change', this._sync);
        window.removeEventListener('orientation-lock-changed', this._sync);
        this._setBackgroundInert(false);
    }

    /** Reflect the overlay's (CSS-resolved) visibility onto the background inertness. */
    _syncInert() {
        const shown = getComputedStyle(this).display !== 'none';
        this._setBackgroundInert(shown);
    }

    /**
     * Toggle `inert` on every top-level app element except this overlay.
     * @param {boolean} on - true while the overlay is shown
     */
    _setBackgroundInert(on) {
        for (const el of document.body.children) {
            if (el !== this) el.toggleAttribute('inert', on);
        }
    }

    /** Escape hatch: turn the portrait lock off (persisted) and reveal the app. */
    _dismiss() {
        if (window.AppState) window.AppState.lockPortrait = false;
        window.MemoryCache?.set?.('lockPortrait', false);
        applyOrientationLock(false); // clears the class → CSS hides the overlay
    }

    render() {
        return html`
            <div class="orientation-gate-inner" role="alertdialog" aria-label="Rotate your device to portrait">
                <span class="orientation-gate-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                         stroke-linecap="round" stroke-linejoin="round">${iconSmartphone}</svg>
                </span>
                <p class="orientation-gate-title">Rotate your device</p>
                <p class="orientation-gate-msg">Audiogravi<sup>ty</sup> is designed for portrait. Turn your device upright to continue.</p>
                <button class="action-btn secondary orientation-gate-dismiss" @click=${this._dismiss}>
                    Continue in landscape
                </button>
            </div>
        `;
    }
}

customElements.define('ag-orientation-gate', AgOrientationGate);
