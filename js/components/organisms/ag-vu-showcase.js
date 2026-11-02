/**
 * @module ag-vu-showcase
 * @description The level meter's showcase: two large VU meters and what plays, over the
 * whole screen — for a tablet set beside the hi-fi (the mock-up the user chose,
 * 2026-11-01).
 *
 * Opened by the full-screen player's button (window event `vu-showcase-open`, detail
 * `{source_id}`), closed by its Exit button; it says so on `vu-showcase-state` (detail
 * `{open}`), for the full-screen player to pause its own meter, out of sight under it. Pro:
 * a box without it gets the licence panel instead, a licence not read yet nothing, and a
 * licence that stops being Pro while it is open closes it — its dials would be refused.
 * While it is open:
 * - the screen stays on (the Screen Wake Lock API, where the browser has it), the lock
 *   asked again each time the page comes back to the front: the browser drops it when
 *   the page is hidden;
 * - the portrait lock is lifted (orientation-lock.js) and put back, on exit, as the
 *   device's setting says — a tablet in landscape shows the dials side by side, and in
 *   portrait one above the other;
 * - what plays comes from the player's state stream, the one the full-screen player
 *   follows (library-store's subscribePlayerState).
 *
 * @element ag-vu-showcase
 */

import { LitElement, html, nothing } from 'lit';
import '../molecules/ag-vu-meter.js';
import '../molecules/ag-format-strip.js';
import { subscribePlayerState } from '../../library-store.js';
import { applyOrientationLock } from '../../orientation-lock.js';
import { openLicensePanel, proState } from '../../license-tiers.js';
import { LicenseController } from '../../core/LicenseController.js';
import { coverUrl, pickPrimaryCoverToken } from '../utils-lit.js';
import { iconMinimize } from '../../ag-icons.js';

/** The window event that opens the showcase. */
export const SHOWCASE_OPEN_EVENT = 'vu-showcase-open';

/** The window event the showcase sends when it opens or closes, detail `{open}`. */
export const SHOWCASE_STATE_EVENT = 'vu-showcase-state';

export class AgVuShowcase extends LitElement {
    static properties = {
        _open:  { state: true },
        _state: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._open = false;
        this._state = null;
        this._unsubscribe = null;
        this._wakeLock = null;
        /** Keeps `_license`: a licence that stops being Pro closes the showcase. */
        this._licenseCtl = new LicenseController(this, (license) => {
            if (this._open && proState(license) === 'locked') this.close();
        });
        this._onOpen = (e) => this.open(e.detail?.source_id ?? null);
        this._onVisibility = () => {
            if (this._open && document.visibilityState === 'visible') this._keepAwake();
        };
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener(SHOWCASE_OPEN_EVENT, this._onOpen);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener(SHOWCASE_OPEN_EVENT, this._onOpen);
        this.close();
    }

    /**
     * Open the showcase.
     *
     * @param {string|null} sourceId - The source to follow; null for the active one.
     */
    open(sourceId = null) {
        if (this._open) return;
        const pro = proState(this._license);
        if (pro !== 'open') {
            // Pro (the user's decision, 2026-11-01): the licence panel instead. Nothing while
            // the licence is not read: its stream would be refused on a box without Pro.
            if (pro === 'locked') openLicensePanel(this._license);
            return;
        }
        this._open = true;
        this._unsubscribe = subscribePlayerState((s) => { this._state = s; }, { sourceId });
        applyOrientationLock(false);
        document.addEventListener('visibilitychange', this._onVisibility);
        this._keepAwake();
        window.dispatchEvent(new CustomEvent(SHOWCASE_STATE_EVENT, { detail: { open: true } }));
    }

    /** Close the showcase: the stream, the screen lock and the portrait lock go back. */
    close() {
        if (!this._open) return;
        this._open = false;
        this._unsubscribe?.();
        this._unsubscribe = null;
        document.removeEventListener('visibilitychange', this._onVisibility);
        this._releaseWakeLock();
        applyOrientationLock(window.AppState?.lockPortrait ?? true);
        window.dispatchEvent(new CustomEvent(SHOWCASE_STATE_EVENT, { detail: { open: false } }));
    }

    async _keepAwake() {
        if (!navigator.wakeLock?.request) return;
        try {
            const lock = await navigator.wakeLock.request('screen');
            if (this._open) this._wakeLock = lock;
            else lock.release?.().catch?.(() => {});
        } catch {
            // Refused (a page in the background, a battery saver): the screen may sleep.
        }
    }

    _releaseWakeLock() {
        const lock = this._wakeLock;
        this._wakeLock = null;
        lock?.release?.().catch?.(() => {});
    }

    render() {
        if (!this._open) return nothing;
        const s = this._state;
        const cover = coverUrl(pickPrimaryCoverToken(s, { swapped: false }));
        const byline = [s?.artist, s?.album].filter(Boolean).join(' · ');
        return html`
            <div class="ag-vus-panel" role="dialog" aria-modal="true" aria-label="Level meter showcase">
                <div class="ag-vus-top">
                    <button class="action-btn secondary compact ag-vus-exit" @click=${() => this.close()}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMinimize}</svg>
                        Exit
                    </button>
                </div>
                ${s?.level_meter ? html`
                    <ag-vu-meter class="ag-vus-meters" layout="auto" fit></ag-vu-meter>
                ` : s ? html`
                    <p class="ag-vus-note">The level meter follows what the box's own player plays.</p>
                ` : nothing}
                <div class="ag-vus-track">
                    <div class="ag-vus-cover" style=${cover ? `background-image:url('${cover}')` : ''}></div>
                    <div class="ag-vus-text">
                        <div class="ag-vus-title">${s?.title ?? ''}</div>
                        ${byline ? html`<div class="ag-vus-byline">${byline}</div>` : nothing}
                    </div>
                    <div class="ag-vus-format"><ag-format-strip .format=${s?.format ?? null}></ag-format-strip></div>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-vu-showcase', AgVuShowcase);
