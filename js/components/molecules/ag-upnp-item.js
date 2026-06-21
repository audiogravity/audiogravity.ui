/**
 * @module AgUpnpItem
 * @description Row molecule for a single UPnP browse result.
 * Renders containers (folder) and tracks differently.
 * Fires events so the parent organism handles navigation and playback.
 *
 * @element ag-upnp-item
 *
 * @attr {object}  .item   - UPnP item descriptor: { id, title, subtitle, hint, res, art_uri, cover_token }
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

        return html`
            <div
                class="lib-browser-row ${acting ? 'busy' : ''}"
                @click=${() => this._tap()}
            >
                <ag-library-cover
                    cover=${artUrl || ''}
                    fallback=${isContainer ? 'container' : 'track'}
                ></ag-library-cover>
                <div class="lib-browser-meta">
                    <span class="lib-browser-t">${item.title}</span>
                    ${item.subtitle ? html`<span class="lib-browser-st">${item.subtitle}</span>` : nothing}
                </div>
                <div class="lib-browser-right">
                    ${isContainer
                        ? html`<svg viewBox="0 0 24 24" width="12" height="12"
                                fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round">${iconChevronRight}</svg>`
                        : item.res ? html`
                                <button class="lib-lr-add" title="Play"
                                    ?disabled=${acting}
                                    @click=${(e) => this._play(e, 'play')}>
                                    ${acting
                                        ? html`<span style="font-size:10px;font-family:var(--font-mono)">…</span>`
                                        : html`<svg viewBox="0 0 24 24" width="14" height="14"
                                                fill="currentColor" stroke="none">
                                                ${iconPlay}
                                            </svg>`
                                    }
                                </button>
                                <button class="lib-lr-add" title="Add to queue"
                                    @click=${(e) => this._play(e, 'add')}>
                                    <svg viewBox="0 0 24 24" width="14" height="14"
                                        fill="none" stroke="currentColor" stroke-width="2"
                                        stroke-linecap="round">
                                        ${iconPlus}
                                    </svg>
                                </button>`
                        : nothing
                    }
                </div>
            </div>
        `;
    }
}

customElements.define('ag-upnp-item', AgUpnpItem);
