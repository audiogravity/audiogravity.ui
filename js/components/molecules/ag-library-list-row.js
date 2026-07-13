/**
 * @module AgLibraryListRow
 * @description Shared list-row layout used in library browse / search / queue views:
 * cover thumbnail + title + subtitle + optional "+ add to queue" action button.
 * The row click and the action button click are reported as two separate events
 * so the consumer can drive different behaviours (play vs queue).
 *
 * @element ag-library-list-row
 *
 * @attr {string}  cover        - Cover URL (empty → ag-library-cover shows fallback)
 * @attr {string}  fallback     - Fallback glyph passed to ag-library-cover (see its docs)
 * @attr {string}  title        - Main label
 * @attr {string}  subtitle     - Secondary label (optional)
 * @attr {boolean} actionable   - When true, render the trailing "+ add" button
 * @attr {string}  action-label - aria/tooltip for the action button (default: "Add to queue")
 * @attr {boolean} favoritable  - When true, render the trailing ★ Favorites toggle
 * @attr {boolean} favorite     - Filled star (item already in Favorites)
 *
 * @fires row-click   - Bubbles. Row body clicked.
 * @fires row-action  - Bubbles. Action button clicked (stopPropagation handled internally).
 * @fires fav-toggle  - Bubbles (from ag-library-fav-btn). detail: { favorite: boolean } — desired state.
 */

import { LitElement, html, nothing } from 'lit';
import { emit } from '../utils-lit.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-library-add-btn.js';
import '../atoms/ag-library-fav-btn.js';

export class AgLibraryListRow extends LitElement {
    static properties = {
        cover:       { type: String },
        fallback:    { type: String },
        title:       { type: String },
        subtitle:    { type: String },
        actionable:  { type: Boolean },
        actionLabel: { type: String, attribute: 'action-label' },
        favoritable: { type: Boolean },
        favorite:    { type: Boolean },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.cover       = '';
        this.fallback    = 'list';
        this.title       = '';
        this.subtitle    = '';
        this.actionable  = false;
        this.actionLabel = 'Add to queue';
        this.favoritable = false;
        this.favorite    = false;
    }

    _onRowClick = () => emit(this, 'row-click');

    _onAction = (e) => {
        e.stopPropagation();
        emit(this, 'row-action');
    };

    render() {
        return html`
            <div class="lib-list-row" @click=${this._onRowClick}>
                <ag-library-cover cover=${this.cover} fallback=${this.fallback}></ag-library-cover>
                <div class="lib-lr-col">
                    <span class="lib-lr-t">${this.title}</span>
                    ${this.subtitle ? html`<span class="lib-lr-a">${this.subtitle}</span>` : nothing}
                </div>
                ${this.favoritable ? html`
                    <ag-library-fav-btn variant="row" ?favorite=${this.favorite}></ag-library-fav-btn>
                ` : nothing}
                ${this.actionable ? html`
                    <ag-library-add-btn
                        label=${this.actionLabel}
                        @click=${this._onAction}>
                    </ag-library-add-btn>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-library-list-row', AgLibraryListRow);
