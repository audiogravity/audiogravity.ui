/**
 * @module AgRadioCard
 * @description List-row card for one internet-radio station. Renders cover +
 * name + meta + a cluster of inline action toggles (star = Favorites, plus /
 * check = My Live Radio, pencil = Edit). Tap on the row body plays the
 * station; tap on any action button reports a dedicated event.
 *
 * When ``swipeable`` is set, a left-swipe gesture progressively reveals a
 * delete affordance and commits ``radio-swipe-remove`` past a threshold. The
 * organism uses this single event to remove the station from whichever
 * collection the row currently belongs to.
 *
 * @element ag-radio-card
 *
 * @attr {object}  .station    - RadioStation object (uuid, name, url, codec, …).
 * @attr {boolean} favorite    - True when in Favorites; drives the star fill.
 * @attr {boolean} in-library  - True when in My Live Radio; drives the plus state.
 * @attr {boolean} editable    - Whether to show the edit pencil (custom stations).
 * @attr {boolean} swipeable   - Enables the left-swipe-to-remove gesture.
 *
 * @fires radio-play             - Bubbles. detail: { station }
 * @fires radio-favorite-toggle  - Bubbles. detail: { station, favorite: boolean }
 * @fires radio-library-toggle   - Bubbles. detail: { station, in_library: boolean }
 * @fires radio-edit             - Bubbles. detail: { station }
 * @fires radio-swipe-remove     - Bubbles. detail: { station } — swipe committed past threshold.
 *
 * @dependency css/components/library-radio.css
 */

import { LitElement, html, nothing } from 'lit';
import { coverUrl } from '../utils-lit.js';
import { iconStar, iconStarFilled, iconPencil, iconPlus, iconCheck } from '../../ag-icons.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-connector-badge.js';

// Distance (px) past which a horizontal pointer move commits the swipe.
const _SWIPE_COMMIT_PX = 140;
// Distance past which we start interpreting movement as a swipe rather than a tap.
const _SWIPE_SLOP_PX = 8;

export class AgRadioCard extends LitElement {
    static properties = {
        station:    { type: Object },
        favorite:   { type: Boolean },
        inLibrary:  { type: Boolean, attribute: 'in-library' },
        editable:   { type: Boolean },
        swipeable:  { type: Boolean },
        _swipeDx:   { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.station   = null;
        this.favorite  = false;
        this.inLibrary = false;
        this.editable  = false;
        this.swipeable = false;
        this._swipeDx  = 0;
        this._swipeStartX = null;
        this._swipeActive = false;
    }

    _emit = (name, detail) => {
        this.dispatchEvent(new CustomEvent(name, {
            bubbles: true, composed: true, detail,
        }));
    };

    _onTap = () => {
        // Suppress the play action when the tap was actually a swipe-in-progress.
        if (this._swipeActive) return;
        if (!this.station) return;
        this._emit('radio-play', { station: this.station });
    };

    _onStarTap = (e) => {
        e.stopPropagation();
        if (!this.station) return;
        this._emit('radio-favorite-toggle', { station: this.station, favorite: !this.favorite });
    };

    _onLibraryTap = (e) => {
        e.stopPropagation();
        if (!this.station) return;
        this._emit('radio-library-toggle', { station: this.station, in_library: !this.inLibrary });
    };

    _onEditTap = (e) => {
        e.stopPropagation();
        if (!this.station) return;
        this._emit('radio-edit', { station: this.station });
    };

    /* ─── Swipe-left gesture ────────────────────────────────────── */

    _onPointerDown = (e) => {
        if (!this.swipeable) return;
        // Mouse-wheel / right-click / touch beyond first finger: skip.
        if (e.button !== undefined && e.button !== 0) return;
        this._swipeStartX = e.clientX;
        this._swipeActive = false;
        const inner = e.currentTarget;
        try { inner.setPointerCapture(e.pointerId); } catch (_) { /* old Safari */ }
    };

    _onPointerMove = (e) => {
        if (!this.swipeable || this._swipeStartX === null) return;
        const dx = e.clientX - this._swipeStartX;
        if (!this._swipeActive && Math.abs(dx) > _SWIPE_SLOP_PX) {
            this._swipeActive = true;
        }
        if (this._swipeActive) {
            // Only left swipe — clamp positive deltas to zero so the card never
            // moves right (Safari rubber-band would otherwise feel uncanny).
            this._swipeDx = Math.min(0, dx);
        }
    };

    _onPointerEnd = (e) => {
        if (!this.swipeable || this._swipeStartX === null) return;
        const wasActive = this._swipeActive;
        const dx = this._swipeDx;
        this._swipeStartX = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
        // ``pointercancel`` arrives when the browser takes over the gesture
        // (scroll, system back-gesture, popup) — never treat it as a commit
        // even if dx crossed the threshold, the user didn't release.
        const committed = wasActive
            && e.type !== 'pointercancel'
            && dx <= -_SWIPE_COMMIT_PX
            && this.station;
        if (committed) {
            this._emit('radio-swipe-remove', { station: this.station });
        }
        // Snap-back animation handled by CSS transition on transform.
        this._swipeDx = 0;
        // Clear the swipe flag on the next tick — keeps _onTap suppressed for
        // the trailing click that some browsers fire after pointerup.
        setTimeout(() => { this._swipeActive = false; }, 0);
    };

    render() {
        const s = this.station;
        if (!s) return nothing;

        const bitrate = s.bitrate ? `${s.bitrate} kbps` : '';
        const meta    = [s.country, bitrate].filter(Boolean).join(' · ');
        // Proxy the favicon through the backend cover endpoint — bypasses
        // the strict ``img-src`` CSP (radio favicons live on arbitrary hosts)
        // and re-uses the existing cover cache.
        const logoUrl = s.favicon ? coverUrl(`url:${s.favicon}`) : '';

        const innerStyle = `transform: translateX(${this._swipeDx}px); transition: ${this._swipeStartX === null ? 'transform 180ms ease-out' : 'none'};`;

        return html`
            <div class="lib-radio-card-wrap ${this.swipeable ? 'swipeable' : ''}">
                ${this.swipeable ? html`
                    <div class="lib-radio-card-delete" aria-hidden="true">Remove</div>
                ` : nothing}
                <div class="lib-radio-card"
                     style=${innerStyle}
                     @click=${this._onTap}
                     @pointerdown=${this._onPointerDown}
                     @pointermove=${this._onPointerMove}
                     @pointerup=${this._onPointerEnd}
                     @pointercancel=${this._onPointerEnd}
                     role="button" tabindex="0">
                    <ag-library-cover
                        cover=${logoUrl}
                        fallback="radio"
                    ></ag-library-cover>
                    <div class="lib-radio-col">
                        <span class="lib-radio-name">${s.name}</span>
                        ${meta ? html`<span class="lib-radio-meta">${meta}</span>` : nothing}
                    </div>
                    <div class="lib-radio-card-actions">
                        ${s.codec
                            ? html`<ag-connector-badge .connector=${s.codec.toLowerCase()}></ag-connector-badge>`
                            : nothing}
                        ${this.editable ? html`
                            <button class="lib-radio-edit" aria-label="Edit station" @click=${this._onEditTap}>
                                <svg viewBox="0 0 24 24" width="16" height="16"
                                     fill="none" stroke="currentColor" stroke-width="1.5"
                                     stroke-linecap="round" stroke-linejoin="round">
                                    ${iconPencil}
                                </svg>
                            </button>
                        ` : nothing}
                        <button class="lib-radio-lib ${this.inLibrary ? 'on' : ''}"
                                aria-label=${this.inLibrary ? 'Remove from My Live Radio' : 'Add to My Live Radio'}
                                @click=${this._onLibraryTap}>
                            <svg viewBox="0 0 24 24" width="18" height="18"
                                 fill="none" stroke="currentColor" stroke-width="1.8"
                                 stroke-linecap="round" stroke-linejoin="round">
                                ${this.inLibrary ? iconCheck : iconPlus}
                            </svg>
                        </button>
                        <button class="lib-radio-star ${this.favorite ? 'on' : ''}"
                                aria-label=${this.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                @click=${this._onStarTap}>
                            <svg viewBox="0 0 24 24" width="18" height="18"
                                 fill="none" stroke="currentColor" stroke-width="1.5"
                                 stroke-linejoin="round">
                                ${this.favorite ? iconStarFilled : iconStar}
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-radio-card', AgRadioCard);
