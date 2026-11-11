/**
 * @module AgLibraryUpnpBrowser
 * @description UPnP ContentDirectory tree browser. Navigates any UPnP server
 * (upmpdcli/Tidal, upmpdcli/Qobuz, MinimServer, …) by browsing ObjectIDs.
 * Navigation stack is kept client-side — the backend is fully stateless.
 *
 * Flow:
 *   1. On connect, call GET /library/upnp-browse?location=…&object_id=0 (root)
 *   2. Tap a container → push to stack, browse its ObjectID; the next pages of a long
 *      level load as the reader nears its end
 *   3. Play / "+" on a track → POST /library/upnp-play with action play|add — except a
 *      track played inside an album or a playlist, which plays that album from it on
 *   4. Play / "+" on an album or a playlist → POST /library/queue, the container whole
 *   5. Back button → pop stack, browse parent ObjectID
 *
 * @element ag-library-upnp-browser
 *
 * @attr {string} location     - Device description URL for the selected UPnP server
 * @attr {string} server-name  - Display name of the server (shown in topbar)
 * @attr {string} source-id    - The browsed server's source id, `upnp:<udn>`: the core reads
 *                               it as the server, and routes the queue requests by it
 *
 * @fires lib-upnp-back   - Bubbles. No detail — user pressed back at root level
 * @fires lib-open-np     - Bubbles. No detail — navigate to Now Playing after play
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { loadWithState } from '../utils-lit.js';
import {
    upnpPlay, queueItem, queueWithFeedback, playWithFeedback,
} from '../../library-api.js';
import { InfiniteScrollController } from '../../core/InfiniteScrollController.js';
import { upnpFallback, isPlayableContainer } from '../molecules/ag-upnp-item.js';
import '../molecules/ag-library-browser-topbar.js';
import '../molecules/ag-library-breadcrumbs.js';

/**
 * Entries asked for at a time. A level longer than this used to stop here: "474 albums"
 * showed 200, and nothing after "IRM" could be reached (MinimServer, 2026-11-11).
 */
export const PAGE_SIZE = 200;

/**
 * Entries listed before the next pages wait for a tap on "Show more" rather than coming
 * on their own as the reader scrolls. Every row stays in the page: MinimServer's
 * "6472 items" scrolled to its end took the page from 14 MB and 23,500 elements to
 * 42 MB and 470,000 (Chromium, 2026-11-11). Decided with the user: beyond this, more
 * rows only when asked for.
 */
export const AUTO_LOAD_ROWS = 1000;

export class AgLibraryUpnpBrowser extends LitElement {
    static properties = {
        location:     { type: String, attribute: 'location' },
        serverName:   { type: String, attribute: 'server-name' },
        sourceId:     { type: String, attribute: 'source-id' },
        _stack:       { state: true },  // [{objectId, title, kind}]
        _items:       { state: true },
        _levelTitle:  { state: true },
        _total:       { state: true },
        _hasMore:     { state: true },
        _loadingMore: { state: true },
        _loading:     { state: true },
        _error:       { state: true },
        _acting:      { state: true },  // objectId currently being played
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.location     = '';
        this.serverName   = '';
        this.sourceId     = '';
        this._stack       = [];
        this._items       = [];
        this._levelTitle  = '';
        this._total       = 0;
        this._hasMore     = false;
        this._loadingMore = false;
        this._loading     = false;
        this._error       = null;
        this._acting      = null;
        /** Bumped by every browse: a page that lands under an older value is dropped. */
        this._level       = 0;
        this._scroll      = new InfiniteScrollController(this, {
            selector: '#lib-upnp-sentinel',
            onNearEnd: () => this._loadMore(),
        });
    }

    updated(changed) {
        if (changed.has('location') && this.location) {
            this._stack = [];
            Promise.resolve().then(() => this._browse('0', this.serverName || 'Browse'));
        }
        this._scroll.sync(this._hasMore && this._autoLoads && !this._loading);
    }

    /**
     * One page of a level.
     *
     * @param {string} objectId - The level's ContentDirectory id.
     * @param {string} title - Its display title.
     * @param {number} offset - The first entry asked for.
     * @returns {Promise<{title?: string, total?: number, items?: object[]}>}
     */
    _fetchPage(objectId, title, offset) {
        const params = new URLSearchParams({
            location:  this.location,
            object_id: objectId,
            title,
            offset:    String(offset),
            limit:     String(PAGE_SIZE),
        });
        return apiGet(`/library/upnp-browse?${params}`);
    }

    /**
     * Whether the level holds more than what is listed, once `page` has landed. A
     * server may announce 0 when it does not know its count: a full page then says
     * there may be more, and an empty one that there is not.
     *
     * @param {object[]} page - The page just read.
     * @returns {boolean}
     */
    _moreAfter(page) {
        if (!page.length) return false;
        return this._total ? this._items.length < this._total : page.length === PAGE_SIZE;
    }

    /** @param {string} objectId @param {string} title */
    async _browse(objectId, title) {
        if (!this.location) return;
        // A new level: the pages still on their way for the old one are dropped (_loadMore).
        this._level      += 1;
        this._hasMore     = false;
        this._loadingMore = false;
        await loadWithState(this, async (isLatest) => {
            const data = await this._fetchPage(objectId, title, 0);
            // An answer overtaken by a later browse would write its list over the newer one.
            if (!isLatest()) return;
            this._levelTitle = data.title || title;
            this._total      = data.total  ?? 0;
            this._items      = data.items  ?? [];
            this._hasMore    = this._moreAfter(this._items);
        });
    }

    /** Whether the next page comes on its own as the reader nears the end. */
    get _autoLoads() {
        return this._items.length < AUTO_LOAD_ROWS;
    }

    /**
     * The next page of the level on screen, appended — asked for as the reader nears its
     * end, or by "Show more" past {@link AUTO_LOAD_ROWS}.
     * @returns {Promise<boolean>} Whether a page landed: InfiniteScrollController then looks
     *   at the end again. Not after a failure — the observer waits for the reader to
     *   scroll, rather than asking a server that has just failed, again and again.
     */
    async _loadMore() {
        if (this._loadingMore || !this._hasMore) return false;
        const level = this._level;
        const here  = this._stack.at(-1);
        this._loadingMore = true;
        try {
            const data = await this._fetchPage(here ? here.objectId : '0', this._levelTitle, this._items.length);
            if (level !== this._level) return false;   // the reader moved on: another list's page
            const page = data.items ?? [];
            this._items   = [...this._items, ...page];
            if (data.total) this._total = data.total;
            this._hasMore = this._moreAfter(page);
            return true;
        } catch (e) {
            console.error('[upnp-browser] load more failed:', e);
            return false;
        } finally {
            if (level === this._level) this._loadingMore = false;
        }
    }

    /** Navigate into a container item. */
    _browseInto(item) {
        this._stack = [...this._stack,
            { objectId: item.id, title: item.title, kind: upnpFallback(item) }];
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
     * The request a Play or a "+" sends for an entry, or null when it plays nothing.
     *
     * - An album or a playlist of the server, from its row: the whole of it, read by the
     *   core page after page.
     * - A track played inside an album or a playlist: that album from the track on — the
     *   tracks after it follow, the ones before it are left out, as on the HIGHRESAUDIO
     *   and Qobuz pages. The track's id goes with its position: the core finds it again
     *   where it is when it reads the album.
     * - Any other track, and every "+" on a track: that track alone.
     *
     * @param {{id: string, title: string, res?: string, hint?: string, upnp_class?: string,
     *   art_uri?: string, duration?: number}} item - The entry.
     * @param {'play'|'add'} action
     * @returns {(() => Promise<object>)|null}
     */
    _sender(item, action) {
        if (isPlayableContainer(item)) {
            return () => queueItem({
                sourceId:  this.sourceId,
                itemType:  upnpFallback(item),
                itemId:    item.id,
                itemTitle: item.title,
                action,
            });
        }
        if (!item.res) return null;
        const here = this._stack.at(-1);
        if (action === 'play' && (here?.kind === 'album' || here?.kind === 'playlist')) {
            // The row tapped, by its own place: a playlist may hold a track twice under
            // one id, and looking the id up found the first copy whichever was tapped.
            const at = this._items.filter((i) => i.res).indexOf(item);
            if (at >= 0) {
                return () => queueItem({
                    sourceId:    this.sourceId,
                    itemType:    here.kind,
                    itemId:      here.objectId,
                    itemTitle:   here.title,
                    action,
                    startIndex:  at,
                    startItemId: item.id,
                });
            }
        }
        return () => upnpPlay({
            sourceId:   this.sourceId,
            res:        item.res,
            title:      item.title,
            artUri:     item.art_uri,
            duration:   item.duration,
            serverName: this.serverName,
            action,
        });
    }

    /**
     * Play or enqueue an entry — a track, or an album or a playlist taken whole.
     * @param {{id: string, title: string, res?: string}} item
     * @param {string} action - 'play' | 'add'
     */
    async _play(item, action = 'play') {
        if (this._acting) return;
        const send = this._sender(item, action);
        if (!send) return;
        this._acting = item.id;
        try {
            // Enqueueing gets the same feedback as everywhere else in the library
            // (it used to fail silently here alone); playing only reports failures.
            if (action !== 'play') {
                await queueWithFeedback(send, item.title || 'Track');
                return;
            }
            if (await playWithFeedback(send)) {
                this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
            }
        } finally {
            this._acting = null;
        }
    }

    _onUpnpNavigate(e) { this._browseInto(e.detail.item); }

    _onUpnpPlay(e) { this._play(e.detail.item, e.detail.action); }

    render() {
        const { _loading, _error, _items, _levelTitle } = this;

        if (!this.location) {
            return html`<div class="lib-empty">Select a UPnP server first</div>`;
        }
        if (_loading) return html`<div class="lib-loading">Loading…</div>`;
        if (_error)   return html`<div class="lib-empty">Error: ${_error}</div>`;

        return html`
            <ag-library-browser-topbar
                heading=${_levelTitle || this.serverName || 'Browse'}
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
                ? html`<div class="lib-empty ag-hw-haunt">No items</div>`
                : _items.map(item => html`
                    <ag-upnp-item
                        .item=${item}
                        ?acting=${this._acting === item.id}
                        @upnp-navigate=${this._onUpnpNavigate}
                        @upnp-play=${this._onUpnpPlay}
                    ></ag-upnp-item>
                `)
            }
            ${this._hasMore && this._autoLoads
                ? html`<div id="lib-upnp-sentinel" style="height:1px"></div>
                    ${this._loadingMore ? html`<div class="lib-loading">Loading…</div>` : nothing}`
                : nothing}
            ${this._hasMore && !this._autoLoads ? html`
                <div class="lib-browser-more">
                    <button class="action-btn secondary compact"
                        aria-disabled=${this._loadingMore ? 'true' : 'false'}
                        aria-busy=${this._loadingMore ? 'true' : 'false'}
                        @click=${() => this._loadMore()}>Show more</button>
                </div>` : nothing}
            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-upnp-browser', AgLibraryUpnpBrowser);
