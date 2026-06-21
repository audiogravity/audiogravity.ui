/**
 * @module AgTrackMeta
 * @description Render the metadata block of a track — title, optional artist,
 * optional album (with optional year suffix). The atom owns the DOM
 * structure and conditional rendering; typography is delegated to the parent.
 *
 * @element ag-track-meta
 *
 * @attr {string}  title             - Track title. Falls back to
 *                                     `placeholder-title` when empty.
 * @attr {string}  artist            - Track artist. Hidden when empty.
 * @attr {string}  album             - Album name. Only rendered when
 *                                     `show-album` is set.
 * @attr {number}  year              - Release year. Appended after the
 *                                     album as `` · YYYY`` when both
 *                                     present.
 * @attr {string}  placeholder-title - Text rendered when `title` is empty.
 * @attr {boolean} show-album        - When true, render the album line.
 *
 * Public CSS hooks (styled by parent via descendant selectors):
 *   `.ag-tm-title`, `.ag-tm-artist`, `.ag-tm-album`
 * Renaming any of these is a breaking change for consumers.
 *
 * @dependency css/components/track-meta.css
 */
import { LitElement, html, nothing } from 'lit';

export class AgTrackMeta extends LitElement {
    static properties = {
        title:            { type: String },
        artist:           { type: String },
        album:            { type: String },
        year:             { type: Number },
        placeholderTitle: { type: String,  attribute: 'placeholder-title' },
        showAlbum:        { type: Boolean, attribute: 'show-album' },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.title            = '';
        this.artist           = '';
        this.album            = '';
        this.year             = null;
        this.placeholderTitle = '';
        this.showAlbum        = false;
    }

    render() {
        const titleText = this.title || this.placeholderTitle;
        return html`
            ${titleText ? html`<div class="ag-tm-title">${titleText}</div>` : nothing}
            ${this.artist ? html`<div class="ag-tm-artist">${this.artist}</div>` : nothing}
            ${this.showAlbum && this.album ? html`
                <div class="ag-tm-album">${this.album}${this.year ? ` · ${this.year}` : ''}</div>
            ` : nothing}
        `;
    }
}

customElements.define('ag-track-meta', AgTrackMeta);
