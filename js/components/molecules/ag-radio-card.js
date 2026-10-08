/**
 * @module AgRadioCard
 * @description List-row card for one internet-radio station. Renders cover +
 * name + meta + the actions that tell something about the station: the star
 * (Favorites) and, for a station not in My Live Radio yet, the plus that adds
 * it. Edit and "remove from My Live Radio" sit behind a "more" button (⋯) that
 * unfolds them under the row as worded buttons. Tap on the row body plays the
 * station; tap on any action button reports a dedicated event.
 *
 * Why the check mark left the row: it meant "in My Live Radio" and removed the
 * station when touched. In the My Live Radio list every row carried it, so it
 * told nothing, and it was a removal that looked like a confirmation.
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
 * @attr {boolean} in-library  - True when in My Live Radio: no plus, and the
 *                               "more" actions offer to remove it.
 * @attr {boolean} editable    - Whether the "more" actions offer Edit.
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
import { iconStar, iconStarFilled, iconPlus, iconEllipsis } from '../../ag-icons.js';
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
        _moreOpen:  { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.station   = null;
        this.favorite  = false;
        this.inLibrary = false;
        this.editable  = false;
        this.swipeable = false;
        this._moreOpen = false;
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

    _onMoreTap = (e) => {
        e.stopPropagation();
        this._moreOpen = !this._moreOpen;
    };

    _onEditTap = (e) => {
        e.stopPropagation();
        if (!this.station) return;
        this._moreOpen = false;
        this._emit('radio-edit', { station: this.station });
    };

    _onRemoveTap = (e) => {
        e.stopPropagation();
        if (!this.station) return;
        this._moreOpen = false;
        this._emit('radio-library-toggle', { station: this.station, in_library: false });
    };

    /**
     * Fold the actions away when the row starts showing another station. The list
     * re-renders by position, so after a removal the next station inherits this
     * element — it must not inherit an unfolded "remove" meant for the one gone.
     * The same station handed again (a list refresh) keeps the row as it was, and so
     * does the first render: there is no station before it to have moved away from.
     *
     * Fold too when "more" has nothing left to offer (the station left My Live Radio
     * by another way, on a row that cannot edit): otherwise the folded state would
     * stay armed, and the actions unfold on their own when the station comes back.
     * @param {Map<string, unknown>} changed - Properties changed since the last update.
     */
    willUpdate(changed) {
        const previous = changed.get('station');
        const anotherStation = changed.has('station') && previous !== undefined
            && previous?.uuid !== this.station?.uuid;
        if (anotherStation || !this._hasMore()) {
            this._moreOpen = false;
        }
    }

    /** Whether the "more" button has anything to offer for this row. */
    _hasMore() {
        return this.editable || this.inLibrary;
    }

    /**
     * The unfolded "more" actions: Edit for a saved station, removal for one in
     * My Live Radio. Worded, because two icons side by side is what they replace.
     * Compact, as every action on one item of a list — a tile's Start or Uninstall
     * (user's choice, 2026-10-08: at 44px on a phone they were the only large
     * buttons of the Radio view).
     * @param {object} s - The station.
     * @returns {import('lit').TemplateResult}
     */
    _renderMoreActions(s) {
        return html`
            <div class="lib-radio-more-actions" id="radio-more-${s.uuid}">
                ${this.editable ? html`
                    <button class="action-btn compact secondary" @click=${this._onEditTap}>Edit station</button>
                ` : nothing}
                ${this.inLibrary ? html`
                    <button class="action-btn compact warning" @click=${this._onRemoveTap}>Remove from My Live Radio</button>
                ` : nothing}
            </div>
        `;
    }

    render() {
        const s = this.station;
        if (!s) return nothing;

        const bitrate = s.bitrate ? `${s.bitrate} kbps` : '';
        const meta    = [s.country, bitrate].filter(Boolean).join(' · ');
        // Proxy the favicon through the backend cover endpoint — bypasses
        // the strict ``img-src`` CSP (radio favicons live on arbitrary hosts)
        // and re-uses the existing cover cache.
        const logoUrl = s.favicon ? coverUrl(`url:${s.favicon}`) : '';

        // The action glyphs are drawn at the same 18px. The pencil used to be
        // 16px, which made it read as the smallest and the hardest to aim at —
        // half of what made editing a station awkward (site#7); the other half
        // was the swipe gesture stealing the tap.
        const more = this._hasMore() && this._moreOpen;
        return html`
            <div class="ag-swipe-wrap lib-radio-card-wrap ${this.swipeable ? 'swipeable' : ''}">
                ${this.swipeable ? html`
                    <div class="ag-swipe-reveal" aria-hidden="true">Remove</div>
                ` : nothing}
                <!-- Announced as a button, but out of the keyboard's reach: it holds three
                     buttons, which a button cannot hold, and the swipe that removes a
                     station does not start on a button (SwipeToDismissController). A
                     departure from WCAG 2.1.1, accepted on 2026-09-29: the app is used
                     by touch. -->
                <div class="lib-radio-card ${more ? 'more-open' : ''}"
                     ${swipeRow(this._swipe, SINGLE, this.swipeable)}
                     @click=${this._onTap}
                     role="button">
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
                        ${this.inLibrary ? nothing : html`
                            <button class="lib-radio-lib"
                                    aria-label="Add to My Live Radio"
                                    @click=${this._onLibraryTap}>
                                <svg viewBox="0 0 24 24" width="18" height="18"
                                     fill="none" stroke="currentColor" stroke-width="1.8"
                                     stroke-linecap="round" stroke-linejoin="round">
                                    ${iconPlus}
                                </svg>
                            </button>
                        `}
                        <button class="lib-radio-star ${this.favorite ? 'on' : ''}"
                                aria-label=${this.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                @click=${this._onStarTap}>
                            <svg viewBox="0 0 24 24" width="18" height="18"
                                 fill="none" stroke="currentColor" stroke-width="1.5"
                                 stroke-linejoin="round">
                                ${this.favorite ? iconStarFilled : iconStar}
                            </svg>
                        </button>
                        ${this._hasMore() ? html`
                            <!-- aria-controls only while the actions exist: folded, they are
                                 not in the document, and the reference would point nowhere. -->
                            <button class="lib-radio-more ${more ? 'on' : ''}"
                                    aria-label="More actions"
                                    aria-expanded=${more ? 'true' : 'false'}
                                    aria-controls=${more ? `radio-more-${s.uuid}` : nothing}
                                    @click=${this._onMoreTap}>
                                <!-- Lucide draws the dots as r=1 circles stroked at 2: the
                                     stroke is what gives them their size, so it is set here,
                                     heavier than the outline glyphs beside them. -->
                                <svg viewBox="0 0 24 24" width="18" height="18"
                                     fill="none" stroke="currentColor" stroke-width="2.5"
                                     stroke-linecap="round" stroke-linejoin="round">
                                    ${iconEllipsis}
                                </svg>
                            </button>
                        ` : nothing}
                    </div>
                </div>
            </div>
            ${more ? this._renderMoreActions(s) : nothing}
        `;
    }
}

customElements.define('ag-radio-card', AgRadioCard);
