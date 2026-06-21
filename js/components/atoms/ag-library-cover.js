/**
 * @module AgLibraryCover
 * @description Library cover cell — a fixed-size square that shows an album/track
 * cover image when available, with a built-in SVG fallback glyph otherwise.
 * The fallback glyph is always rendered behind the image so a load error
 * (handled via ``@error``) seamlessly reveals it; the failed state lives in
 * component state so Lit re-renders without out-of-template DOM mutation.
 *
 * @element ag-library-cover
 *
 * @attr {string}  cover     - Resolved cover URL (empty/falsy → show fallback only)
 * @attr {string}  fallback  - Fallback glyph name. One of:
 *                              list | album | container | track | radio | next | queue | play
 * @attr {number}  size      - Cell size in pixels (default 40)
 *
 * @dependency css/components/library-cover.css
 *
 * @example
 * <ag-library-cover cover="/api/.../cover?token=..." fallback="album"></ag-library-cover>
 */

import { LitElement, html, nothing } from 'lit';
import {
    iconQueue, iconAlbum, iconTrack, iconFolder,
    iconRadio, iconUpNext, iconQueueEdit, iconPlay,
} from '../../ag-icons.js';

// Keys are the atom's public `fallback` attribute API; intentionally remapped
// to the canonical ag-icons.js names (e.g. `container` → iconFolder).
const ICONS = {
    list:      iconQueue,
    album:     iconAlbum,
    track:     iconTrack,
    container: iconFolder,
    radio:     iconRadio,
    next:      iconUpNext,
    queue:     iconQueueEdit,
    play:      iconPlay,
};

export class AgLibraryCover extends LitElement {
    static properties = {
        cover:    { type: String },
        fallback: { type: String },
        size:     { type: Number },
        _failed:  { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.cover    = '';
        this.fallback = 'list';
        this.size     = 40;
        this._failed  = false;
    }

    updated(changed) {
        if (changed.has('cover') && this._failed) this._failed = false;
        if (changed.has('size')) this.style.setProperty('--ag-libcv-size', `${this.size}px`);
    }

    _onError = () => { this._failed = true; };

    render() {
        const iconSvg = ICONS[this.fallback];
        if (!iconSvg && this.fallback) {
            console.warn(`[ag-library-cover] unknown fallback "${this.fallback}"`);
        }
        const showImg = this.cover && !this._failed;

        return html`
            <div class="ag-libcv">
                <svg class="ag-libcv-icon" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2">
                    ${iconSvg || ICONS.list}
                </svg>
                ${showImg ? html`
                    <img class="ag-libcv-img" src=${this.cover} alt="" @error=${this._onError}>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-library-cover', AgLibraryCover);
