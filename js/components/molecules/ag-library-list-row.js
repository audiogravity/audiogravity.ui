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
 * @attr {boolean} playlistable - When true, render the "Add to playlist" button, between
 *                                the ★ and the "+ add" (the consumer decides with
 *                                `canAddToPlaylist` from library-constants.js)
 * @attr {boolean} openable     - When true, render the "Open the playlist" button (a
 *                                playlist row; `canOpenPlaylist`)
 * @attr {boolean} removable    - When true, render the "Remove from the playlist" button
 *                                (a track of the account's own playlist; `canEditPlaylist`)
 * @attr {number}  position     - The item's position in its list, shown before the cover
 *                                (the tracks of a playlist page); 0 shows none
 * @attr {string}  note         - A short text at the head of the controls — a track's
 *                                duration; empty shows none
 * @attr {boolean} wide         - The cover is a 2:1 banner (see ag-library-cover's `wide`).
 *                                The row keeps the height it always had and the thumbnail
 *                                takes twice the width, so the rhythm of a list mixing both
 *                                shapes does not change from one row to the next.
 *
 * @fires row-click   - Bubbles. Row body clicked.
 * @fires row-action  - Bubbles. Action button clicked (stopPropagation handled internally).
 * @fires fav-toggle  - Bubbles (from ag-library-fav-btn). detail: { favorite: boolean } — desired state.
 * @fires playlist-add    - Bubbles (from ag-library-playlist-btn). No detail.
 * @fires playlist-open   - Bubbles (from ag-library-playlist-btn). No detail.
 * @fires playlist-remove - Bubbles (from ag-library-playlist-btn). No detail.
 */

import { LitElement, html, nothing } from 'lit';
import { emit } from '../utils-lit.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-library-add-btn.js';
import '../atoms/ag-library-fav-btn.js';
import '../atoms/ag-library-playlist-btn.js';

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
        playlistable: { type: Boolean },
        openable:    { type: Boolean },
        removable:   { type: Boolean },
        position:    { type: Number },
        note:        { type: String },
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
        this.playlistable = false;
        this.openable    = false;
        this.removable   = false;
        this.position    = 0;
        this.note        = '';
        this.wide        = false;
    }

    /** @returns {boolean} Whether the row has anything in its trailing cell. */
    get _hasTrailing() {
        return Boolean(this.note || this.favoritable || this.openable || this.playlistable
            || this.removable || this.actionable);
    }

    _onRowClick = () => emit(this, 'row-click');

    _onAction = (e) => {
        e.stopPropagation();
        emit(this, 'row-action');
    };

    render() {
        return html`
            <div class="lib-list-row ${this.position ? 'lib-list-row--numbered' : ''}"
                @click=${this._onRowClick}>
                ${this.position ? html`<span class="lib-lr-n">${this.position}</span>` : nothing}
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
                ${this._hasTrailing ? html`
                    <div class="lib-lr-actions">
                        ${this.note ? html`<span class="lib-lr-note">${this.note}</span>` : nothing}
                        ${this.favoritable ? html`
                            <ag-library-fav-btn variant="row" ?favorite=${this.favorite}></ag-library-fav-btn>
                        ` : nothing}
                        ${this.openable ? html`
                            <ag-library-playlist-btn mode="open" variant="row"></ag-library-playlist-btn>
                        ` : nothing}
                        ${this.playlistable ? html`
                            <ag-library-playlist-btn variant="row"></ag-library-playlist-btn>
                        ` : nothing}
                        ${this.removable ? html`
                            <ag-library-playlist-btn mode="remove" variant="row"></ag-library-playlist-btn>
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
