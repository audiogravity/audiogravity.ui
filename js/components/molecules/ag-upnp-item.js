/**
 * @module AgUpnpItem
 * @description Row molecule for a single UPnP browse result.
 * A track carries Play and "+". An album or a playlist of the server carries them too —
 * they play or queue it whole — and still opens on a tap, to pick a track in it. Any
 * other container (a folder, an artist, a genre) only opens, behind its chevron.
 * Fires events so the parent organism handles navigation and playback.
 *
 * @element ag-upnp-item
 *
 * @attr {object}  .item   - UPnP item descriptor: { id, title, subtitle, hint, res, art_uri,
 *                           cover_token, upnp_class }
 * @attr {boolean} acting  - Whether this item is currently loading (play in progress)
 *
 * @fires upnp-navigate - Bubbles. detail: { item } — user tapped a container
 * @fires upnp-play     - Bubbles. detail: { item, action: 'play'|'add' } — user tapped play/add
 *
 * @dependency css/components/library-browser.css
 */
import { LitElement, html, nothing } from 'lit';
import { coverUrl } from '../utils-lit.js';
import { iconChevronRight, iconPlus, iconPlay } from '../../ag-icons.js';
import '../atoms/ag-library-cover.js';

/**
 * The kind of entry named to ag-library-cover, which draws the picture shown when the
 * server sends no artwork. Read from the entry's DIDL class: an album or a playlist is
 * music whose artwork is missing — the music note, as for a track — while any other
 * container (a folder, an artist, a genre) is something to open, and keeps the folder.
 * Album containers do come without artwork on some servers; deciding on `hint` alone
 * drew a folder for them.
 *
 * A music album only — or the bare `object.container.album`, which says no more. A
 * server that also shares pictures lists `object.container.album.photoAlbum`: taken for
 * an album, it got Play and "+", which could only fail — it holds no audio.
 *
 * @param {{hint?: string, upnp_class?: string}} item - A UPnP browse entry.
 * @returns {'track'|'album'|'playlist'|'container'} An ag-library-cover `fallback` name.
 */
export function upnpFallback(item) {
    if (item?.hint !== 'container') return 'track';
    const cls = item.upnp_class ?? '';
    if (cls === 'object.container.album' || cls.startsWith('object.container.album.musicAlbum')) {
        return 'album';
    }
    if (cls.startsWith('object.container.playlistContainer')) return 'playlist';
    return 'container';
}

/**
 * Whether an entry is a container played whole — an album or a playlist of the server.
 * Folders are not (decided with the user, 2026-11-11): one may hold nothing but other
 * folders, and read in depth it could fill the queue with thousands of tracks.
 *
 * @param {{hint?: string, upnp_class?: string}} item - A UPnP browse entry.
 * @returns {boolean}
 */
export function isPlayableContainer(item) {
    const kind = upnpFallback(item);
    return kind === 'album' || kind === 'playlist';
}

export class AgUpnpItem extends LitElement {
    static properties = {
        item:   { type: Object },
        acting: { type: Boolean },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.item   = null;
        this.acting = false;
    }

    _tap() {
        const { item } = this;
        if (!item || this.acting) return;
        if (item.hint === 'container') {
            this.dispatchEvent(new CustomEvent('upnp-navigate', { detail: { item }, bubbles: true }));
        } else if (item.res) {
            this.dispatchEvent(new CustomEvent('upnp-play', { detail: { item, action: 'play' }, bubbles: true }));
        }
    }

    _play(e, action) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('upnp-play', { detail: { item: this.item, action }, bubbles: true }));
    }

    render() {
        const { item, acting } = this;
        if (!item) return nothing;

        const isContainer = item.hint === 'container';
        const artUrl      = coverUrl(item.cover_token || (item.art_uri ? `url:${item.art_uri}` : null));
        // A track plays; so does an album or a playlist, whole. Other containers only open.
        const playable    = isContainer ? isPlayableContainer(item) : Boolean(item.res);

        return html`
            <div
                class="lib-browser-row ${acting ? 'busy' : ''}"
                @click=${() => this._tap()}
            >
                <ag-library-cover
                    cover=${artUrl || ''}
                    fallback=${upnpFallback(item)}
                ></ag-library-cover>
                <div class="lib-browser-meta">
                    <span class="lib-browser-t">${item.title}</span>
                    ${item.subtitle ? html`<span class="lib-browser-st">${item.subtitle}</span>` : nothing}
                </div>
                <div class="lib-browser-right">
                    ${playable
                        ? this._renderActions(acting)
                        : isContainer
                            ? html`<svg viewBox="0 0 24 24" width="12" height="12"
                                    fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round">${iconChevronRight}</svg>`
                            : nothing
                    }
                </div>
            </div>
        `;
    }

    /**
     * Play and "+" — for a track, or for an album or a playlist taken whole.
     *
     * @param {boolean} acting - A play of this entry is under way: Play shows it.
     * @returns {import('lit').TemplateResult}
     */
    _renderActions(acting) {
        return html`
            <button class="lib-lr-add" aria-label="Play"
                ?disabled=${acting}
                @click=${(e) => this._play(e, 'play')}>
                ${acting
                    ? html`<span style="font-size: var(--font-size-xxs);font-family:var(--font-mono)">…</span>`
                    : html`<svg viewBox="0 0 24 24" width="14" height="14"
                            fill="currentColor" stroke="none">
                            ${iconPlay}
                        </svg>`
                }
            </button>
            <button class="lib-lr-add" aria-label="Add to queue"
                @click=${(e) => this._play(e, 'add')}>
                <svg viewBox="0 0 24 24" width="14" height="14"
                    fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round">
                    ${iconPlus}
                </svg>
            </button>`;
    }
}

customElements.define('ag-upnp-item', AgUpnpItem);
