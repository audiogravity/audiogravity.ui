/**
 * @module AgLibraryFavBtn
 * @description Star toggle for adding/removing a streaming album to Favorites,
 * used on album cards and list rows (parallel to ag-library-add-btn). Pure
 * presentational atom — the consumer sets `favorite` and handles the `fav-toggle`
 * event; the button stops propagation so the parent card's click (play) never fires.
 *
 * @element ag-library-fav-btn
 *
 * @attr {boolean} favorite - filled star when true (already in Favorites)
 * @attr {string}  variant  - "row" (14px inline) | "card" (24×24 overlay), like ag-library-add-btn
 *
 * @fires fav-toggle - Bubbles. detail: { favorite: boolean } — the DESIRED new state.
 *
 * @dependency css/components/library-cover.css (.lib-ac-fav / .lib-lr-fav)
 *
 * @example
 * <ag-library-fav-btn variant="card" ?favorite=${fav}
 *   @fav-toggle=${(e) => this._toggleFav(album, e.detail.favorite)}></ag-library-fav-btn>
 */

import { LitElement, html } from 'lit';
import { iconStar, iconStarFilled } from '../../ag-icons.js';

export class AgLibraryFavBtn extends LitElement {
    static properties = {
        favorite: { type: Boolean },
        variant:  { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.favorite = false;
        this.variant  = 'row';
    }

    _onTap = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('fav-toggle', {
            bubbles: true, composed: true,
            detail: { favorite: !this.favorite },
        }));
    };

    render() {
        const cls   = this.variant === 'card' ? 'lib-ac-fav' : 'lib-lr-fav';
        const label = this.favorite ? 'Remove from Favorites' : 'Add to Favorites';
        return html`
            <button class="${cls}${this.favorite ? ' on' : ''}" title=${label} aria-label=${label}
                    @click=${this._onTap}>
                <svg viewBox="0 0 24 24" fill=${this.favorite ? 'currentColor' : 'none'}
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${this.favorite ? iconStarFilled : iconStar}
                </svg>
            </button>
        `;
    }
}

customElements.define('ag-library-fav-btn', AgLibraryFavBtn);
