/**
 * @module AgLibraryUpnpBrowser
 * @description UPnP ContentDirectory tree browser. Navigates any UPnP server
 * (upmpdcli/Tidal, upmpdcli/Qobuz, MinimServer, …) by browsing ObjectIDs.
 * Navigation stack is kept client-side — the backend is fully stateless.
 *
 * Flow:
 *   1. On connect, call GET /library/upnp-browse?control_url=…&object_id=0 (root)
 *   2. Tap a container → push to stack, browse its ObjectID
 *   3. Tap an item (track) → POST /library/upnp-play with action play|add
 *   4. Back button → pop stack, browse parent ObjectID
 *
 * @element ag-library-upnp-browser
 *
 * @attr {string} control-url  - SOAP endpoint for the selected UPnP server
 * @attr {string} server-name  - Display name of the server (shown in topbar)
 * @attr {string} source-id    - MPD source ID used for playback (e.g. 'src_mpd')
 *
 * @fires lib-upnp-back   - Bubbles. No detail — user pressed back at root level
 * @fires lib-open-np     - Bubbles. No detail — navigate to Now Playing after play
 */
import { LitElement, html } from 'lit';
import { apiGet } from '../../api.js';
import { loadWithState } from '../utils-lit.js';
import { upnpPlay } from '../../library-api.js';
import '../molecules/ag-upnp-item.js';
import '../molecules/ag-library-browser-topbar.js';
import '../molecules/ag-library-breadcrumbs.js';

export class AgLibraryUpnpBrowser extends LitElement {
    static properties = {
        controlUrl:  { type: String, attribute: 'control-url' },
        serverName:  { type: String, attribute: 'server-name' },
        sourceId:    { type: String, attribute: 'source-id' },
        _stack:      { state: true },  // [{objectId, title}]
        _items:      { state: true },
        _levelTitle: { state: true },
        _total:      { state: true },
        _loading:    { state: true },
        _error:      { state: true },
        _acting:     { state: true },  // objectId currently being played
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.controlUrl  = '';
        this.serverName  = '';
        this.sourceId    = '';
        this._stack      = [];
        this._items      = [];
        this._levelTitle = '';
        this._total      = 0;
        this._loading    = false;
        this._error      = null;
        this._acting     = null;
    }

    updated(changed) {
        if (changed.has('controlUrl') && this.controlUrl) {
            this._stack = [];
            Promise.resolve().then(() => this._browse('0', this.serverName || 'Browse'));
        }
    }

    /** @param {string} objectId @param {string} title */
    async _browse(objectId, title) {
        if (!this.controlUrl) return;
        await loadWithState(this, async () => {
            const params = new URLSearchParams({
                control_url: this.controlUrl,
                object_id:   objectId,
                title,
                limit: '200',
            });
            const data = await apiGet(`/library/upnp-browse?${params}`);
            this._levelTitle = data.title || title;
            this._total      = data.total  ?? 0;
            this._items      = data.items  ?? [];
        });
    }

    /** Navigate into a container item. */
    _browseInto(item) {
        this._stack = [...this._stack, { objectId: item.id, title: item.title }];
        this._browse(item.id, item.title);
    }

    /** Go back one level in the stack. */
    _browseBack() {
        if (this._stack.length === 0) {
            this.dispatchEvent(new CustomEvent('lib-upnp-back', { bubbles: true }));
            return;
        }
        const newStack = this._stack.slice(0, -1);
        this._stack = newStack;
        const parent = newStack.at(-1);
        if (parent) {
            this._browse(parent.objectId, parent.title);
        } else {
            this._browse('0', this.serverName || 'Browse');
        }
    }

    /** Reset to root. */
    _browseRoot() {
        this._stack = [];
        this._browse('0', this.serverName || 'Browse');
    }

    /**
     * Play or enqueue a track item via MPD.
     * @param {{id: string, title: string, res: string}} item
     * @param {string} action - 'play' | 'add'
     */
    async _play(item, action = 'play') {
        if (!item.res || this._acting) return;
        this._acting = item.id;
        try {
            await upnpPlay({
                sourceId:   this.sourceId,
                res:        item.res,
                title:      item.title,
                artUri:     item.art_uri,
                duration:   item.duration,
                serverName: this.serverName,
                action,
            });
            if (action === 'play') {
                this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
            }
        } catch (e) {
            console.error('[upnp-browser] play failed:', e);
        } finally {
            this._acting = null;
        }
    }

    _onUpnpNavigate(e) { this._browseInto(e.detail.item); }

    _onUpnpPlay(e) { this._play(e.detail.item, e.detail.action); }

    render() {
        const { _loading, _error, _items, _levelTitle } = this;

        if (!this.controlUrl) {
            return html`<div class="lib-empty">Select a UPnP server first</div>`;
        }
        if (_loading) return html`<div class="lib-loading">Loading…</div>`;
        if (_error)   return html`<div class="lib-empty">Error: ${_error}</div>`;

        return html`
            <ag-library-browser-topbar
                title=${_levelTitle || this.serverName || 'Browse'}
                @browser-back=${() => this._browseBack()}
                @browser-refresh=${() => {
                    const cur = this._stack.at(-1);
                    this._browse(cur ? cur.objectId : '0', _levelTitle);
                }}
            ></ag-library-browser-topbar>
            <ag-library-breadcrumbs
                .stack=${this._stack}
                root-label=${this.serverName || 'Root'}
                @breadcrumb-root=${() => this._browseRoot()}
            ></ag-library-breadcrumbs>
            ${_items.length === 0
                ? html`<div class="lib-empty">No items</div>`
                : _items.map(item => html`
                    <ag-upnp-item
                        .item=${item}
                        ?acting=${this._acting === item.id}
                        @upnp-navigate=${this._onUpnpNavigate}
                        @upnp-play=${this._onUpnpPlay}
                    ></ag-upnp-item>
                `)
            }
            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-upnp-browser', AgLibraryUpnpBrowser);
