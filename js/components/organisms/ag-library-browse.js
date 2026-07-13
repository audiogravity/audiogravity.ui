/**
 * @module AgLibraryBrowse
 * @description Library browse home view. Shows albums with infinite-scroll pagination.
 * Loads the first PAGE_SIZE albums on mount, then fetches subsequent pages as the user
 * scrolls toward the bottom (IntersectionObserver on a sentinel element).
 *
 * For Qobuz sources, displays category pills (Favorites, New Releases, Selection,
 * Playlists) that each fetch from a different backend endpoint.
 *
 * @element ag-library-browse
 *
 * @attr {string} source-id  - Active library source ID (e.g. 'src_mpd', 'src_roon')
 * @attr {string} zone-id    - Roon zone ID (required for Roon sources)
 *
 * @fires lib-open-album  - Bubbles. detail: { album } — user tapped an album
 * @fires lib-queue-album - Bubbles. detail: { albumId, artistId, action } — play or add
 * @fires lib-open-np     - Bubbles. No detail — navigate to Now Playing after play
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { coverUrl, loadWithState } from '../utils-lit.js';
import { queueItem, queueWithFeedback } from '../../library-api.js';
import { FavoritesController } from '../../core/FavoritesController.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-library-add-btn.js';
import '../atoms/ag-library-fav-btn.js';
import '../molecules/ag-library-list-row.js';

const PAGE_SIZE = 50;

const MPD_PILLS    = [['all', 'All'], ['recent', 'Recent'], ['az', 'A–Z']];
const QOBUZ_PILLS  = [
    ['favorites',    'Favorites'],
    ['new-releases', 'New Releases'],
    ['editor-picks', 'Selection'],
    ['playlists',    'Playlists'],
];
const TIDAL_PILLS  = [
    ['favorites',    'Favorites'],
    ['new-releases', 'New Releases'],
    ['charts',       'Charts'],
    ['editorial',    'Editorial'],
    ['playlists',    'Playlists'],
];
const HRA_PILLS    = [
    ['favorites', 'Favorites'],
    ['discover',  'Discover'],
    ['editors',   "Editor's Picks"],
    ['bestsellers', 'Bestsellers'],
];
// Maps HRA browse pills to their HRA shop-category title (album grid).
const HRA_CATEGORIES = {
    editors:     'Editors Choice',
    bestsellers: 'Bestsellers',
};

export class AgLibraryBrowse extends LitElement {
    static properties = {
        sourceId:     { type: String, attribute: 'source-id' },
        zoneId:       { type: String, attribute: 'zone-id' },
        // Artist drill-down: when set, the browse lists only this artist's albums
        // (via /library/albums?artist_id=…) with an "Albums by <name>" header.
        artistId:     { type: String, attribute: 'artist-id' },
        artistName:   { type: String, attribute: 'artist-name' },
        _albums:      { state: true },
        _filter:      { state: true },
        _loading:     { state: true },
        _loadingMore: { state: true },
        _hasMore:     { state: true },
        _error:       { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId     = '';
        this.zoneId       = '';
        this.artistId     = '';
        this.artistName   = '';
        this._albums      = [];
        this._fav         = new FavoritesController(this);   // streaming album ★ state
        this._filter      = 'all';
        this._loading     = false;
        this._loadingMore = false;
        this._hasMore     = false;
        this._error       = null;
        this._offset      = 0;
        this._observer    = null;
    }

    /** @returns {boolean} Whether the active source is Qobuz. */
    get _isQobuz() { return this.sourceId === 'src_qobuz'; }

    /** @returns {boolean} Whether the active source is Tidal. */
    get _isTidal() { return this.sourceId === 'src_tidal'; }

    /** @returns {boolean} Whether the active source is HIGHRESAUDIO. */
    get _isHighresaudio() { return this.sourceId === 'src_highresaudio'; }

    /** @returns {boolean} Whether the active source is a streaming service (pills-driven). */
    get _isStreaming() { return this._isQobuz || this._isTidal || this._isHighresaudio; }

    updated(changed) {
        // Reload on a source switch or when entering/leaving/changing artist mode.
        if ((changed.has('sourceId') || changed.has('artistId')) && this.sourceId) {
            this._filter = this._isStreaming ? 'favorites' : 'all';
            Promise.resolve().then(() => this._load());
        }
        this._syncObserver();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._detachObserver();
    }

    // ------------------------------------------------------------------
    // Data loading
    // ------------------------------------------------------------------

    async _load() {
        if (!this.sourceId) return;
        this._detachObserver();
        this._albums  = [];
        this._offset  = 0;
        this._hasMore = false;
        if (this._isStreaming) this._fav.load(this.sourceId);   // non-blocking — star state fills in
        await loadWithState(this, async () => {
            const page    = await this._fetchPage(0);
            this._albums  = page;
            this._offset  = page.length;
            this._hasMore = page.length === PAGE_SIZE;
        });
    }

    async _loadMore() {
        if (this._loadingMore || !this._hasMore) return;
        this._loadingMore = true;
        try {
            const page    = await this._fetchPage(this._offset);
            this._albums  = [...this._albums, ...page];
            this._offset += page.length;
            this._hasMore = page.length === PAGE_SIZE;
        } catch (e) {
            console.error('[browse] load more failed:', e);
        } finally {
            this._loadingMore = false;
        }
    }

    async _fetchPage(offset) {
        // Artist drill-down bypasses the per-source pill routing: every source
        // resolves an artist's albums through /library/albums?artist_id=… .
        if (this.artistId) {
            const params = new URLSearchParams({
                source_id: this.sourceId,
                artist_id: this.artistId,
                offset:    String(offset),
                limit:     String(PAGE_SIZE),
            });
            if (this.zoneId) params.set('zone_id', this.zoneId);
            return apiGet(`/library/albums?${params}`);
        }
        if (this._isQobuz) return this._fetchQobuzPage(offset);
        if (this._isTidal) return this._fetchTidalPage(offset);
        if (this._isHighresaudio) return this._fetchHighresaudioPage(offset);
        const params = new URLSearchParams({
            source_id: this.sourceId,
            offset:    String(offset),
            limit:     String(PAGE_SIZE),
        });
        if (this.zoneId) params.set('zone_id', this.zoneId);
        return apiGet(`/library/albums?${params}`);
    }

    /** @private Qobuz-specific fetch: route to different endpoints per pill. */
    async _fetchQobuzPage(offset) {
        const params = new URLSearchParams({
            offset: String(offset),
            limit:  String(PAGE_SIZE),
        });
        switch (this._filter) {
            case 'new-releases':
            case 'editor-picks':
                params.set('type', this._filter);
                return apiGet(`/library/qobuz-featured?${params}`);
            case 'playlists':
                return apiGet(`/library/qobuz-playlists?${params}`);
            default:
                params.set('source_id', this.sourceId);
                return apiGet(`/library/albums?${params}`);
        }
    }

    /** @private HRA-specific fetch: favorites (My Album), the curated Discover grid,
     * or a shop category (Editor's Picks, Bestsellers). */
    async _fetchHighresaudioPage(offset) {
        const params = new URLSearchParams({
            offset: String(offset),
            limit:  String(PAGE_SIZE),
        });
        if (this._filter === 'discover') {
            return apiGet(`/library/highresaudio-discover?${params}`);
        }
        if (HRA_CATEGORIES[this._filter]) {
            params.set('category', HRA_CATEGORIES[this._filter]);
            return apiGet(`/library/highresaudio-category?${params}`);
        }
        params.set('source_id', this.sourceId);
        return apiGet(`/library/albums?${params}`);
    }

    /** @private Tidal-specific fetch: favorites albums or the user's playlists. */
    async _fetchTidalPage(offset) {
        const params = new URLSearchParams({
            offset: String(offset),
            limit:  String(PAGE_SIZE),
        });
        if (this._filter === 'new-releases') {
            return apiGet(`/library/tidal-featured?${params}`);
        }
        if (this._filter === 'charts') {
            return apiGet(`/library/tidal-charts?${params}`);
        }
        if (this._filter === 'editorial') {
            return apiGet(`/library/tidal-editorial?${params}`);
        }
        if (this._filter === 'playlists') {
            return apiGet(`/library/tidal-playlists?${params}`);
        }
        params.set('source_id', this.sourceId);
        return apiGet(`/library/albums?${params}`);
    }

    // ------------------------------------------------------------------
    // IntersectionObserver for infinite scroll
    // ------------------------------------------------------------------

    _syncObserver() {
        const noScroll = !this._isQobuz && this._filter === 'recent';
        const active = this._hasMore && !noScroll;
        if (!active) { this._detachObserver(); return; }
        if (this._observer) return;
        const sentinel = this.querySelector('#lib-browse-sentinel');
        if (!sentinel) return;
        this._observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) this._loadMore(); },
            { rootMargin: '0px 0px 200px 0px' },
        );
        this._observer.observe(sentinel);
    }

    _detachObserver() {
        if (this._observer) { this._observer.disconnect(); this._observer = null; }
    }

    // ------------------------------------------------------------------
    // Playback helpers
    // ------------------------------------------------------------------

    _albumOpts(album, action) {
        const TIDAL_PLAYLIST_FILTERS = ['playlists', 'editorial', 'charts'];
        const isPlaylist = (this._isQobuz && this._filter === 'playlists')
            || (this._isTidal && TIDAL_PLAYLIST_FILTERS.includes(this._filter));
        return {
            sourceId:  this.sourceId,
            zoneId:    this.zoneId,
            itemId:    album.id,
            itemType:  isPlaylist ? 'playlist' : 'album',
            action,
            artistId:  album.artist,
            hierarchy: 'browse',
        };
    }

    async _playAlbum(album) {
        try {
            await queueItem(this._albumOpts(album, 'play'));
            this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
        } catch (e) {
            console.error('[browse] play album failed:', e);
        }
    }

    async _addAlbumToQueue(album) {
        await queueWithFeedback(
            () => queueItem(this._albumOpts(album, 'add')),
            album.title || 'Album',
        );
    }

    // ------------------------------------------------------------------
    // Filter change
    // ------------------------------------------------------------------

    _setFilter(f) {
        if (f === this._filter) return;
        this._filter = f;
        if (this._isStreaming) this._load();
    }

    // ------------------------------------------------------------------
    // Render helpers
    // ------------------------------------------------------------------

    _renderAlbumCard(album) {
        const cover = coverUrl(album.cover_token);
        return html`
            <div class="lib-album-card" @click=${() => this._playAlbum(album)}>
                <div class="lib-ac-wrap">
                    <ag-library-cover
                        cover=${cover}
                        fallback="album"
                        size="120"
                    ></ag-library-cover>
                    <ag-library-add-btn
                        variant="card"
                        @click=${(e) => { e.stopPropagation(); this._addAlbumToQueue(album); }}
                    ></ag-library-add-btn>
                    ${this._isStreaming ? html`
                        <ag-library-fav-btn
                            variant="card"
                            ?favorite=${this._fav.has(album.id)}
                            @fav-toggle=${(e) => this._fav.toggle(this.sourceId, album.id, e.detail.favorite)}
                        ></ag-library-fav-btn>
                    ` : nothing}
                </div>
                <div class="lib-ac-t">${album.title}</div>
                <div class="lib-ac-a">${album.artist ?? ''}</div>
                ${album.year ? html`<div class="lib-ac-fmt">${album.year}</div>` : nothing}
            </div>
        `;
    }

    _renderListRow(album) {
        return html`
            <ag-library-list-row
                cover=${coverUrl(album.cover_token)}
                fallback="album"
                title=${album.title}
                subtitle=${album.artist ?? ''}
                actionable
                @row-click=${() => this._playAlbum(album)}
                @row-action=${() => this._addAlbumToQueue(album)}
            ></ag-library-list-row>
        `;
    }

    _filtered() {
        const { _albums, _filter } = this;
        if (!this._isStreaming) {
            if (_filter === 'recent') return _albums.slice(0, 50);
            if (_filter === 'az')     return [..._albums].sort((a, b) => a.title.localeCompare(b.title));
        }
        return _albums;
    }

    /** @private Section header label based on the active streaming pill (or artist). */
    get _sectionLabel() {
        if (this.artistId) return `Albums by ${this.artistName || 'artist'}`;
        const pills = this._isQobuz ? QOBUZ_PILLS
            : this._isTidal ? TIDAL_PILLS
            : this._isHighresaudio ? HRA_PILLS
            : null;
        if (!pills) return 'Albums';
        const entry = pills.find(([f]) => f === this._filter);
        return entry ? entry[1] : 'Albums';
    }

    render() {
        const { _loading, _error, _filter, _loadingMore, _hasMore } = this;

        if (!this.sourceId) return html`<div class="lib-empty">Select a source</div>`;
        if (_loading)       return html`<div class="lib-loading">Loading…</div>`;
        if (_error)         return html`<div class="lib-empty">Error: ${_error}</div>`;

        const pills        = this._isQobuz ? QOBUZ_PILLS
            : this._isTidal ? TIDAL_PILLS
            : this._isHighresaudio ? HRA_PILLS
            : MPD_PILLS;
        const filtered     = this._filtered();
        const recent       = filtered.slice(0, 10);
        const more         = filtered.slice(10);
        const noScroll     = !this._isQobuz && _filter === 'recent';
        const showSentinel = _hasMore && !noScroll;

        return html`
            <div class="lib-filters">
                ${this.artistId ? html`
                    <button
                        class="lib-pill"
                        @click=${() => this.dispatchEvent(new CustomEvent('lib-artist-back', { bubbles: true }))}
                    >← Back</button>
                ` : pills.map(([f, label]) => html`
                    <button
                        class="lib-pill ${_filter === f ? 'on' : ''}"
                        @click=${() => this._setFilter(f)}
                    >${label}</button>
                `)}
            </div>

            ${recent.length > 0 ? html`
                <div class="lib-section-hd">
                    <span class="lib-sh-t">${this._sectionLabel}</span>
                    <span class="lib-sh-more" @click=${() => this._load()}>Refresh</span>
                </div>
                <div class="lib-album-row">
                    ${recent.map(a => this._renderAlbumCard(a))}
                </div>
            ` : html`<div class="lib-empty">No albums found</div>`}

            ${more.length > 0 ? html`
                <div class="lib-section-hd">
                    <span class="lib-sh-t">More</span>
                </div>
                ${more.map(a => this._renderListRow(a))}
            ` : nothing}

            ${showSentinel  ? html`<div id="lib-browse-sentinel" style="height:1px"></div>` : nothing}
            ${_loadingMore  ? html`<div class="lib-loading">Loading…</div>` : nothing}

            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-browse', AgLibraryBrowse);
