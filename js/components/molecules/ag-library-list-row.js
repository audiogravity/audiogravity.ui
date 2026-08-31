/**
 * @module AgLibraryListRow
 * @description Shared list-row layout used in library browse / search / queue views:
 * cover thumbnail + title + subtitle + optional "+ add to queue" action button.
 * The row click and the action button click are reported as two separate events
 * so the consumer can drive different behaviours (play vs queue).
 *
 * The trailing controls share ONE cell (`.lib-lr-actions`) rather than taking one
 * each. The row is a three-column grid, so a row carrying both the star and the +
 * — every album row of a streaming search — put the fourth item on a second line,
 * left-aligned under the cover.
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
 * @attr {boolean} wide         - The cover is a 2:1 banner (see ag-library-cover's `wide`).
 *                                The row keeps the height it always had and the thumbnail
 *                                takes twice the width, so the rhythm of a list mixing both
 *                                shapes does not change from one row to the next.
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
        wide:        { type: Boolean },
    };

    /** The row's thumbnail height, in pixels — the atom's own default, kept whatever the shape. */
    static COVER_HEIGHT = 40;

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
        this.wide        = false;
    }

    _onRowClick = () => emit(this, 'row-click');

    _onAction = (e) => {
        e.stopPropagation();
        emit(this, 'row-action');
    };

    render() {
        return html`
            <div class="lib-list-row" @click=${this._onRowClick}>
                <ag-library-cover
                    cover=${this.cover}
                    fallback=${this.fallback}
                    ?wide=${this.wide}
                    size=${this.wide ? AgLibraryListRow.COVER_HEIGHT * 2 : AgLibraryListRow.COVER_HEIGHT}
                ></ag-library-cover>
                <div class="lib-lr-col">
                    <span class="lib-lr-t">${this.title}</span>
                    ${this.subtitle ? html`<span class="lib-lr-a">${this.subtitle}</span>` : nothing}
                </div>
                ${this.favoritable || this.actionable ? html`
                    <div class="lib-lr-actions">
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
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-library-list-row', AgLibraryListRow);
