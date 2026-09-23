/**
 * @module AgLibraryPlaylistBtn
 * @description "Add to playlist" button, beside the ★ and the "+ queue" of album cards
 * and list rows, and beside the title in the full-screen player. Pure presentational
 * atom — the consumer decides whether the item can be offered (`canAddToPlaylist` in
 * library-constants.js) and handles the `playlist-add` event; the button stops
 * propagation so the parent card's click (play) never fires.
 *
 * @element ag-library-playlist-btn
 *
 * @attr {string} variant - "row" (30×30 bordered, in a list row's action cell) |
 *                          "card" (24×24 overlay on a cover, next to the ★) |
 *                          "player" (44×44 bordered, beside the full-screen player's title)
 * @attr {string} label   - aria-label and tooltip (default: "Add to playlist")
 *
 * @fires playlist-add - Bubbles, composed. No detail: the consumer knows its item.
 *
 * @dependency css/components/library-cover.css (.lib-ac-pl / .lib-lr-pl),
 *             css/components/now-playing-fullscreen.css (.npfs-pl-btn)
 *
 * @example
 * <ag-library-playlist-btn variant="card"
 *   @playlist-add=${() => requestPlaylistAdd({...})}></ag-library-playlist-btn>
 */
import { LitElement } from 'lit';
import { iconListPlus } from '../../ag-icons.js';
import { libIconButton } from '../utils-lit.js';

/** Class of the button, per variant. The player's lives with the player's styles. */
const VARIANT_CLASS = { row: 'lib-lr-pl', card: 'lib-ac-pl', player: 'npfs-pl-btn' };

export class AgLibraryPlaylistBtn extends LitElement {
    static properties = {
        variant: { type: String },
        label:   { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.variant = 'row';
        this.label   = 'Add to playlist';
    }

    _onTap = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('playlist-add', { bubbles: true, composed: true }));
    };

    render() {
        const cls = VARIANT_CLASS[this.variant] ?? VARIANT_CLASS.row;
        return libIconButton({ cls, label: this.label, icon: iconListPlus, onClick: this._onTap });
    }
}

customElements.define('ag-library-playlist-btn', AgLibraryPlaylistBtn);
