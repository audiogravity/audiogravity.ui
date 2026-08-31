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
 * @attr {number}  size      - Cell width in pixels (default 40); also the height unless `wide`
 * @attr {boolean} wide      - The artwork is a 2:1 banner, not a square cover: the cell is
 *                             `size` wide and half that high. HIGHRESAUDIO's editorial
 *                             playlists are the case this exists for — measured 2026-08-30,
 *                             32 of them sampled across the whole catalogue, every one
 *                             410 × 205. In a square cell `object-fit: cover` kept the
 *                             middle 205 × 205 and threw the rest away, which is half of a
 *                             composition laid out horizontally. A call site keeps whichever
 *                             dimension its layout owns: a card fixes its width (120 → 120 × 60),
 *                             a list row fixes its height (80 → 80 × 40, the row's usual 40).
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
        wide:     { type: Boolean },
        _failed:  { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.cover    = '';
        this.fallback = 'list';
        this.size     = 40;
        this.wide     = false;
        this._failed  = false;
    }

    updated(changed) {
        if (changed.has('cover') && this._failed) this._failed = false;
        // Both are written together: the height is derived from the width, so a `size`
        // change alone would otherwise leave a stale height on a cell already wide.
        if (changed.has('size') || changed.has('wide')) {
            this.style.setProperty('--ag-libcv-size', `${this.size}px`);
            this.style.setProperty('--ag-libcv-h', `${this.wide ? this.size / 2 : this.size}px`);
        }
    }

    _onError = () => { this._failed = true; };

    render() {
        const iconSvg = ICONS[this.fallback];
        if (!iconSvg && this.fallback) {
            console.warn(`[ag-library-cover] unknown fallback "${this.fallback}"`);
        }
        const showImg = this.cover && !this._failed;

        return html`
            <div class="ag-libcv ${this.wide ? 'ag-libcv--wide' : ''}">
                <svg class="ag-libcv-icon" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2">
                    ${iconSvg || ICONS.list}
                </svg>
                ${showImg ? html`
                    <img class="ag-libcv-img" src=${this.cover} alt="" loading="lazy" @error=${this._onError}>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-library-cover', AgLibraryCover);
