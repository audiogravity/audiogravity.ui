/**
 * @module AgLibraryBrowse
 * @description Library browse home view. Shows albums with infinite-scroll pagination.
 * Loads the first PAGE_SIZE albums on mount, then fetches subsequent pages as the user
 * scrolls toward the bottom (IntersectionObserver on a sentinel element).
 *
 * For streaming sources, displays category pills that each fetch from a different
 * backend endpoint — a fixed set for Qobuz and Tidal, and for HIGHRESAUDIO the shop
 * categories as the service publishes them. The bar scrolls sideways when the pills
 * outgrow it, and fades the edge that still hides some (ScrollEdgesController).
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
import { coverUrl, loadWithState, svgIcon } from '../utils-lit.js';
import { getHraCategories, getHraGenres } from '../../library-store.js';
import { queueItem, queueWithFeedback, playWithFeedback } from '../../library-api.js';
import { FavoritesController } from '../../core/FavoritesController.js';
import { ScrollEdgesController } from '../../core/ScrollEdgesController.js';
import { keepInView } from '../../core/keep-in-view.js';
import { iconBack, iconChevronRight } from '../../ag-icons.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-library-add-btn.js';
import '../atoms/ag-library-fav-btn.js';
import '../molecules/ag-library-list-row.js';
import { ROON_IDS } from '../library-constants.js';

const PAGE_SIZE = 50;

// Local-library pills map to a server-side `sort`, not to client-side juggling.
// Pagination is server-side — 50 albums a page — so anything the client sorts orders a
// window, not the library. 'Recent' was worse than redundant: it sliced the first 50
// alphabetically and labelled them recent.
//
// MPD only. Roon browses its own library through its own paged API, so the core never
// holds the full list and cannot order it; there is no add-date either. Offering these
// pills there gave three buttons that could not work — which is the defect being fixed,
// reproduced on another source.
const MPD_PILLS    = [['all', 'All'], ['recent', 'Recent'], ['az', 'A–Z']];
/** Local-library pill → the `sort` the core applies over the whole library before paging. */
const MPD_SORT     = { all: 'title', az: 'title', recent: 'added' };
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
// HIGHRESAUDIO publishes fourteen shop categories and the core lists them, so the
// pills are built from the answer rather than hard-coded. Three were hard-coded
// before — under names we had invented ('Discover' for High-Res Essentials,
// "Editor's Picks" for Editors Choice) — which showed three of the fourteen and
// renamed two of the three. HRA's own wording is what their listeners recognise.
const HRA_FAVORITES_PILL = ['favorites', 'Favorites'];
// Genres are HRA's second way of arranging the same catalogue — 26 of them, 186
// sub-genres. They do not belong on the shelf bar: that bar is HRA's shop in HRA's
// order, and 212 more buttons on the end of it would bury the fourteen shelves. The
// pill opens a second strip instead, which drills one level down in place.
const HRA_GENRES_PILL = ['genres', 'Genres'];
/** Label of the pill that stands for a whole genre rather than one of its sub-genres. */
const HRA_WHOLE_GENRE_LABEL = 'All';
/**
 * Prefix marking a pill that addresses an HRA shop category by title. The title is a
 * key, not a display string: it is what the core takes on
 * /library/highresaudio-category, and HRA publishes each one once — the four German
 * titles included, relabelled for display and left untouched here.
 */
const HRA_CAT = 'cat:';


export class AgLibraryBrowse extends LitElement {
    static properties = {
        sourceId:     { type: String, attribute: 'source-id' },
        zoneId:       { type: String, attribute: 'zone-id' },
        // Artist drill-down: when set, the browse lists only this artist's albums
        // (via /library/albums?artist_id=…) with an "Albums by <name>" header.
        artistId:     { type: String, attribute: 'artist-id' },
        artistName:   { type: String, attribute: 'artist-name' },
        _albums:      { state: true },
        _hraCategories: { state: true },
        _hraGenres:   { state: true },
        _genre:       { state: true },
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
        /** @type {Array<{title: string, label: string}>} HRA shop categories, one pill each. */
        this._hraCategories = [];
        /** @type {Array<{title: string, path: string, subgenres: Array<object>}>} HRA genres. */
        this._hraGenres   = [];
        /** @type {string|null} Selected genre path ('Jazz' or 'Jazz/Bebop'), null on the list. */
        this._genre       = null;
        this._fav         = new FavoritesController(this);   // streaming album ★ state
        this._edges       = new ScrollEdgesController(this); // filter-bar overflow markers
        this._genreEdges  = new ScrollEdgesController(this); // genre-strip overflow markers
        this._filter      = 'all';
        this._loading     = false;
        this._loadingMore = false;
        this._hasMore     = false;
        this._error       = null;
        this._offset      = 0;
        /** Generation counter: a page that resolves under an older token is dropped. */
        this._loadToken   = 0;
        this._observer    = null;
    }

    /** @returns {boolean} Whether the active source is Qobuz. */
    get _isQobuz() { return this.sourceId === 'src_qobuz'; }

    /** @returns {boolean} Whether the active source is Tidal. */
    get _isTidal() { return this.sourceId === 'src_tidal'; }

    /** @returns {boolean} Whether the active source is HIGHRESAUDIO. */
    get _isHighresaudio() { return this.sourceId === 'src_highresaudio'; }

    /** @returns {boolean} Whether the active source is Roon (paged and ordered by Roon). */
    get _isRoon() { return ROON_IDS.has(this.sourceId); }

    /** @returns {boolean} Whether the active source is a streaming service (pills-driven). */
    get _isStreaming() { return this._isQobuz || this._isTidal || this._isHighresaudio; }

    updated(changed) {
        // Reload on a source switch or when entering/leaving/changing artist mode.
        if ((changed.has('sourceId') || changed.has('artistId')) && this.sourceId) {
            this._filter = this._isStreaming ? 'favorites' : 'all';
            this._genre = null;
            Promise.resolve().then(() => this._load());
        }
        this._syncObserver();
        // Each strip is watched by its own controller; the wrapper it marks is the
        // strip's parent, so no second query is needed to find it.
        const watch = (ctrl, strip) => {
            const el = this.querySelector(`[data-strip="${strip}"]`);
            ctrl.attach(el, el?.parentElement ?? null);
        };
        watch(this._edges, 'filters');
        watch(this._genreEdges, 'genres');
        // Only when the pills themselves can have changed. Measuring on every update
        // would read the strip's geometry right after a DOM mutation — a forced layout
        // per appended album page, and per ★ toggled anywhere in the app.
        if (changed.has('sourceId') || changed.has('artistId') || changed.has('_hraCategories')) {
            this._edges.measure();
        }
        if (changed.has('_hraGenres') || changed.has('_genre') || changed.has('_filter')) {
            this._genreEdges.measure();
        }
    }

    /** @private Fill the HRA genre tree; a failure leaves the strip empty and retryable. */
    async _loadHraGenres() {
        const genres = await getHraGenres();
        if (this._isHighresaudio) this._hraGenres = genres;
    }

    /**
     * @private Fill the HRA category pills. Driven from `_load()` rather than from a
     * source switch: a source restored at boot only changes once, so a core that was
     * still warming up its HRA session would leave the bar showing Favorites alone
     * with nothing able to ask again. Refresh reloads, so Refresh now repairs it.
     */
    async _loadHraCategories() {
        const cats = await getHraCategories();
        // The source can have changed while the answer was in flight.
        if (this._isHighresaudio) this._hraCategories = cats;
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
        if (this._isHighresaudio && !this._hraCategories.length) this._loadHraCategories();
        // Same for the genres, and for the same reason: the pill cannot ask again once
        // it is the chosen one (_setFilter returns early), so a tree that failed to
        // arrive would stay missing. Refresh reloads, and Refresh repairs both.
        if (this._isHighresaudio && this._filter === HRA_GENRES_PILL[0]
            && !this._hraGenres.length) {
            this._loadHraGenres();
        }
        this._detachObserver();
        // Every load opens a new generation. A page requested under the previous sort can
        // still be in flight — switching pill now reloads on MPD too, which it did not
        // before — and it would append onto the fresh list, mixing two orders and pushing
        // _offset past albums nobody ever fetched. The token is checked after each await,
        // where the result comes back, not before it is asked for.
        const token = ++this._loadToken;
        this._albums      = [];
        this._offset      = 0;
        this._hasMore     = false;
        this._loadingMore = false;   // a stale in-flight page must not hold the gate shut
        if (this._isStreaming) this._fav.load(this.sourceId);   // non-blocking — star state fills in
        await loadWithState(this, async () => {
            const page = await this._fetchPage(0);
            if (token !== this._loadToken) return;   // superseded while we waited
            this._albums  = page;
            this._offset  = page.length;
            this._hasMore = page.length === PAGE_SIZE;
        });
    }

    async _loadMore() {
        if (this._loadingMore || !this._hasMore) return;
        this._loadingMore = true;
        const token = this._loadToken;
        try {
            const page = await this._fetchPage(this._offset);
            if (token !== this._loadToken) return;   // a reload happened; this page is stale
            this._albums  = [...this._albums, ...page];
            this._offset += page.length;
            this._hasMore = page.length === PAGE_SIZE;
        } catch (e) {
            console.error('[browse] load more failed:', e);
        } finally {
            if (token === this._loadToken) this._loadingMore = false;
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
            ...(this._isRoon ? {} : { sort: MPD_SORT[this._filter] ?? 'title' }),
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

    /** @private HRA-specific fetch: favorites (My Album), or one of the shop categories. */
    async _fetchHighresaudioPage(offset) {
        const params = new URLSearchParams({
            offset: String(offset),
            limit:  String(PAGE_SIZE),
        });
        if (this._filter === HRA_GENRES_PILL[0]) {
            // Nothing to show until a genre is picked: the strip below is the choice.
            if (!this._genre) return [];
            params.set('genre', this._genre);
            return apiGet(`/library/highresaudio-genre?${params}`);
        }
        if (this._filter.startsWith(HRA_CAT)) {
            // The category is addressed by its title — including the four HRA publishes
            // in German, which the core relabels for display but still keys on.
            params.set('category', this._filter.slice(HRA_CAT.length));
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
        // 'Recent' used to cap the list at 50 and disable infinite scroll, because it was
        // a slice rather than an order. It is a sort over the whole library now, so every
        // pill scrolls through everything.
        const active = this._hasMore;
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
        const ok = await playWithFeedback(() => queueItem(this._albumOpts(album, 'play')));
        // Only reveal the player when something is actually going to play.
        if (ok) this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
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
        const previous = this._filter;
        this._filter = f;
        if (f === HRA_GENRES_PILL[0]) {
            // Fetched on the first visit to the genres rather than with the source: 26
            // genres and 186 sub-genres are a page nobody asked for until they do.
            this._genre = null;
            if (!this._hraGenres.length) this._loadHraGenres();
        }
        // Streaming pills hit different endpoints, so they always reloaded. MPD pills used
        // to reorder whatever was already in memory, which is why 'All' and 'A–Z' looked
        // identical (the core already sorts by title) and 'Recent' showed the alphabetical
        // head. They are server-side sorts now, so they reload too — but only when the sort
        // actually changes, so All ⇄ A–Z costs nothing.
        if (this._isStreaming || (!this._isRoon && MPD_SORT[previous] !== MPD_SORT[f])) this._load();
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
        // Nothing to do: the core returns the pages already ordered by the requested sort.
        // Re-sorting here would only reorder the pages held in memory — the defect this
        // replaced.
        return this._albums;
    }

    /**
     * @private The pills of the active source: `[filter, label]` pairs, empty for Roon
     * (which pages and orders its own library, so a pill could not act on it).
     * @returns {Array<[string, string]>}
     */
    get _pills() {
        if (this._isQobuz) return QOBUZ_PILLS;
        if (this._isTidal) return TIDAL_PILLS;
        if (this._isHighresaudio) {
            return [
                HRA_FAVORITES_PILL,
                HRA_GENRES_PILL,
                ...this._hraCategories.map((c) => [`${HRA_CAT}${c.title}`, c.label]),
            ];
        }
        return this._isRoon ? [] : MPD_PILLS;
    }

    /**
     * @private The pills of the genre strip: the 26 genres while none is picked, and
     * once one is, that genre followed by its sub-genres — so the whole genre stays
     * one tap away and the level below is reachable without a third strip.
     * @returns {Array<[string, string]>}
     */
    get _genrePills() {
        if (!this._genre) return this._hraGenres.map((g) => [g.path, g.title]);
        const top = this._hraGenres.find((g) => g.path === this._genre.split('/')[0]);
        if (!top) return [];
        // The whole genre reads as "All", not as its own name repeated: HRA gives two
        // of its genres a sub-genre of the same name (Soundtrack/Soundtrack,
        // Hip-Hop/Hip-Hop), which put two identical buttons side by side — and "All"
        // says what the button does anyway. The genre itself is named in the header.
        return [
            [top.path, HRA_WHOLE_GENRE_LABEL],
            ...(top.subgenres ?? []).map((s) => [s.path, s.title]),
        ];
    }

    /**
     * @private Pick a genre or sub-genre, or go back to the list with null.
     * @param {string|null} path
     */
    _setGenre(path) {
        if (path === this._genre) return;
        this._genre = path;
        this._load();
    }

    /** @private Section header label based on the active streaming pill (or artist). */
    get _sectionLabel() {
        if (this.artistId) return `Albums by ${this.artistName || 'artist'}`;
        if (!this._isStreaming) return 'Albums';
        // In the genres, the shelf is the genre itself — its own name says far more
        // than the word "Genres" repeated above every grid.
        if (this._filter === HRA_GENRES_PILL[0]) {
            // The whole path, so a sub-genre is read in the genre it belongs to — the
            // strip no longer names the genre once "All" took the first button.
            return this._genre ? this._genre.split('/').join(' · ') : HRA_GENRES_PILL[1];
        }
        const entry = this._pills.find(([f]) => f === this._filter);
        return entry ? entry[1] : 'Albums';
    }

    /**
     * @private Advance the pill bar by clicking a chevron: bring the first pill still
     * cut off on that side into view. Centring it (what keepInView does) lands on a
     * pill boundary instead of mid-label, and leaves its neighbours reachable.
     * @param {1 | -1} dir - 1 for the right-hand chevron, -1 for the left-hand one.
     */
    _scrollPills(dir, strip) {
        const bar = this.querySelector(`[data-strip="${strip}"]`);
        if (!bar) return;
        const pills = [...bar.querySelectorAll('.lib-pill')];
        const edge = bar.getBoundingClientRect();
        const target = dir > 0
            ? pills.find((p) => p.getBoundingClientRect().right > edge.right + 1)
            : pills.reverse().find((p) => p.getBoundingClientRect().left < edge.left - 1);
        keepInView(target);
    }

    /**
     * @private One chevron of the pill bar. Both are rendered as soon as the bar
     * overflows at all, and the one with nowhere to go is disabled rather than
     * dropped: they sit in the layout beside the bar, so removing one would resize
     * the bar mid-scroll — and a bar that narrows can overflow again, which is how a
     * marker starts flickering against itself.
     * @param {1 | -1} dir
     */
    _renderPillNav(dir, strip) {
        const next = dir > 0;
        // Named after the strip it moves: the two bars can be on screen together, and
        // a reader hearing "More filters" twice has no way to tell them apart.
        const what = strip === 'genres' ? 'genres' : 'filters';
        return html`
            <button
                class="lib-filters-nav no-swipe ${next ? 'next' : 'prev'}"
                aria-label=${`${next ? 'More' : 'Previous'} ${what}`}
                @click=${() => this._scrollPills(dir, strip)}
            >${svgIcon(next ? iconChevronRight : iconBack, { size: '16px' })}</button>
        `;
    }

    /**
     * @private One scrolling strip of pills, with its overflow markers. Two of them
     * exist on an HIGHRESAUDIO browse — the filters, and the genres they open — and
     * they are the same object down to the chevrons; only what they hold differs.
     *
     * @param {object} o
     * @param {string} o.strip - Strip name, the key its controller and chevrons use.
     * @param {import('../../core/ScrollEdgesController.js').ScrollEdgesController} o.edges
     * @param {Array<[string, string]>} o.pills - `[value, label]` pairs.
     * @param {string|null} o.active - The value of the pill to show as chosen.
     * @param {(value: string) => void} o.pick - Called with the value of a tapped pill.
     * @param {unknown} [o.lead] - Optional first button (a way back out of the strip).
     */
    _renderStrip({ strip, edges, pills, active, pick, lead = nothing }) {
        // Both chevrons, from the first hidden pill on: they sit beside the bar, so
        // dropping the one that cannot move would widen the bar mid-scroll — and a bar
        // that widens can stop overflowing, which is how a marker flickers against
        // itself. The one at the end of the strip is greyed and inert, in CSS.
        const nav = edges.overflows;
        return html`
            <div class="lib-filters-wrap">
                ${nav ? this._renderPillNav(-1, strip) : nothing}
                <div class="lib-filters" data-strip=${strip}>
                    ${lead}
                    ${pills.map(([value, label]) => html`
                        <button
                            class="lib-pill ${active === value ? 'on' : ''}"
                            @click=${() => pick(value)}
                        >${label}</button>
                    `)}
                </div>
                ${nav ? this._renderPillNav(1, strip) : nothing}
            </div>
        `;
    }

    /**
     * @private The filter bar: pills, and on a pointer that clicks rather than drags,
     * a chevron each side. It stays mounted while a page loads — replaced by the
     * loading line, it came back scrolled to the start with the pill the reader just
     * chose off-screen, and every pill jumped 20px sideways as the chevrons returned.
     */
    _renderFilters() {
        if (this.artistId) {
            return this._renderStrip({
                strip: 'filters',
                edges: this._edges,
                pills: [],
                active: null,
                pick: () => {},
                lead: html`
                    <button
                        class="lib-pill"
                        @click=${() => this.dispatchEvent(new CustomEvent('lib-artist-back', { bubbles: true }))}
                    >← Back</button>`,
            });
        }
        return this._renderStrip({
            strip: 'filters',
            edges: this._edges,
            pills: this._pills,
            active: this._filter,
            pick: (f) => this._setFilter(f),
        });
    }

    /**
     * @private The genre strip, under the filters and only while Genres is the chosen
     * pill. It drills in place: the list of genres, then that genre and its
     * sub-genres, with a way back to the list at the front.
     */
    _renderGenres() {
        if (!this._isHighresaudio || this._filter !== HRA_GENRES_PILL[0]) return nothing;
        return this._renderStrip({
            strip: 'genres',
            edges: this._genreEdges,
            pills: this._genrePills,
            active: this._genre,
            pick: (path) => this._setGenre(path),
            lead: this._genre ? html`
                <button
                    class="lib-pill"
                    @click=${() => this._setGenre(null)}
                >← ${HRA_GENRES_PILL[1]}</button>` : nothing,
        });
    }

    render() {
        const { _loading, _error, _loadingMore, _hasMore } = this;

        if (!this.sourceId) return html`<div class="lib-empty">Select a source</div>`;

        const filtered     = this._filtered();
        const recent       = filtered.slice(0, 10);
        const more         = filtered.slice(10);
        const showSentinel = _hasMore;

        // One template for every state, loading and error included: two templates in
        // this slot would each own their DOM, and switching between them would rebuild
        // the filter bar — losing where it was scrolled, which is the whole point of
        // keeping it up.
        // Nothing is chosen yet in the genres: the strip below IS the choice, so the
        // grid says so rather than reporting an absence of albums.
        const awaitingGenre = this._filter === HRA_GENRES_PILL[0] && !this._genre;

        return html`
            ${this._renderFilters()}
            ${this._renderGenres()}

            ${_error ? html`<div class="lib-empty">Error: ${_error}</div>`
              : _loading ? html`<div class="lib-loading">Loading…</div>`
              : awaitingGenre ? html`<div class="lib-empty">Choose a genre</div>`
              : html`
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
              `}
        `;
    }
}

customElements.define('ag-library-browse', AgLibraryBrowse);
