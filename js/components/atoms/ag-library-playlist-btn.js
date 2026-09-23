/**
 * @module AgLibraryPlaylistBtn
 * @description The playlist buttons of the library, in three modes: **add** an item to a
 * playlist (beside the ★ and the "+ queue" of album cards and rows, and beside the title in
 * the full-screen player), **remove** a track from one (on the rows of a playlist page),
 * and **open** a playlist (on playlist cards and rows, to see its tracks). Pure
 * presentational atom — the consumer decides whether the item can be offered
 * (`canAddToPlaylist` / `canOpenPlaylist` / `canEditPlaylist` in library-constants.js) and
 * handles the event; the button stops propagation so the parent card's click (play) never
 * fires.
 *
 * @element ag-library-playlist-btn
 *
 * @attr {string} mode    - "add" (default) | "remove" | "open"
 * @attr {string} variant - "row" (30×30 bordered, in a list row's action cell) |
 *                          "card" (24×24 overlay on a cover) |
 *                          "player" (44×44 bordered, beside the full-screen player's title)
 * @attr {string} label   - aria-label and tooltip (default: the mode's own)
 *
 * @fires playlist-add    - Bubbles, composed (mode "add"). No detail: the consumer knows its item.
 * @fires playlist-remove - Bubbles, composed (mode "remove").
 * @fires playlist-open   - Bubbles, composed (mode "open").
 *
 * @dependency css/components/library-cover.css (.lib-ac-pl, .lib-ac-open, .lib-lr-pl),
 *             css/components/now-playing-fullscreen.css (.npfs-pl-btn)
 *
 * @example
 * <ag-library-playlist-btn variant="card"
 *   @playlist-add=${() => requestPlaylistAdd({...})}></ag-library-playlist-btn>
 * <ag-library-playlist-btn mode="open" variant="card"
 *   @playlist-open=${() => this._openPlaylist(playlist)}></ag-library-playlist-btn>
 */
import { LitElement } from 'lit';
import { iconListMinus, iconListMusic, iconListPlus } from '../../ag-icons.js';
import { libIconButton } from '../utils-lit.js';

/** What each mode draws, says and fires. */
const MODES = {
    add:    { icon: iconListPlus,  label: 'Add to playlist',          event: 'playlist-add' },
    remove: { icon: iconListMinus, label: 'Remove from the playlist', event: 'playlist-remove' },
    open:   { icon: iconListMusic, label: 'Open the playlist',        event: 'playlist-open' },
};

/**
 * Class of the button, per variant. On a cover, "open" takes the bottom-left corner — a
 * playlist card has no ★ there — where "add" sits next to the ★. The player's class
 * lives with the player's styles.
 *
 * @param {string} variant
 * @param {string} mode
 * @returns {string}
 */
function buttonClass(variant, mode) {
    if (variant === 'card') return mode === 'open' ? 'lib-ac-open' : 'lib-ac-pl';
    if (variant === 'player') return 'npfs-pl-btn';
    return 'lib-lr-pl';
}

export class AgLibraryPlaylistBtn extends LitElement {
    static properties = {
        mode:    { type: String },
        variant: { type: String },
        label:   { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.mode    = 'add';
        this.variant = 'row';
        this.label   = '';
    }

    /** @returns {{icon: *, label: string, event: string}} The current mode, "add" if unknown. */
    get _mode() { return MODES[this.mode] ?? MODES.add; }

    _onTap = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.dispatchEvent(new CustomEvent(this._mode.event, { bubbles: true, composed: true }));
    };

    render() {
        const mode = this._mode;
        return libIconButton({
            cls: buttonClass(this.variant, MODES[this.mode] ? this.mode : 'add'),
            label: this.label || mode.label,
            icon: mode.icon,
            onClick: this._onTap,
        });
    }
}

customElements.define('ag-library-playlist-btn', AgLibraryPlaylistBtn);
