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
import { SwipeToDismissController, swipeRow, SINGLE } from '../../core/SwipeToDismissController.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-connector-badge.js';

export class AgRadioCard extends LitElement {
    static properties = {
        station:    { type: Object },
        favorite:   { type: Boolean },
        inLibrary:  { type: Boolean, attribute: 'in-library' },
        editable:   { type: Boolean },
        swipeable:  { type: Boolean },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.station   = null;
        this.favorite  = false;
        this.inLibrary = false;
        this.editable  = false;
        this.swipeable = false;
        this._swipe = new SwipeToDismissController(this, {
            onCommit: () => { if (this.station) this._emit('radio-swipe-remove', { station: this.station }); },
        });
    }

    _emit = (name, detail) => {
        this.dispatchEvent(new CustomEvent(name, {
            bubbles: true, composed: true, detail,
        }));
    };

    _onTap = () => {
        // Suppress the play action when the tap was actually a swipe-in-progress.
        if (this._swipe.swiping) return;
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

    render() {
        const s = this.station;
        if (!s) return nothing;

        const bitrate = s.bitrate ? `${s.bitrate} kbps` : '';
        const meta    = [s.country, bitrate].filter(Boolean).join(' · ');
        // Proxy the favicon through the backend cover endpoint — bypasses
        // the strict ``img-src`` CSP (radio favicons live on arbitrary hosts)
        // and re-uses the existing cover cache.
        const logoUrl = s.favicon ? coverUrl(`url:${s.favicon}`) : '';

        return html`
            <div class="ag-swipe-wrap lib-radio-card-wrap ${this.swipeable ? 'swipeable' : ''}">
                ${this.swipeable ? html`
                    <div class="ag-swipe-reveal" aria-hidden="true">Remove</div>
                ` : nothing}
                <div class="lib-radio-card"
                     ${swipeRow(this._swipe, SINGLE, this.swipeable)}
                     @click=${this._onTap}
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
