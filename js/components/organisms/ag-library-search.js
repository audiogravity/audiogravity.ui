/**
 * @module AgLibrarySearch
 * @description Library search view. Full-text search across artists, albums,
 * and tracks. Source badges are driven by the `sources` property passed from
 * the parent — no hardcoded source list.
 *
 * @element ag-library-search
 *
 * @attr  {string} source-id - Active library source ID
 * @attr  {string} zone-id   - Roon zone ID (required for Roon sources)
 * @prop  {Array}  sources   - Available sources: [{id, label, group, location}]
 *
 * @fires lib-open-np       - Bubbles. No detail — navigate to Now Playing after play
 * @fires lib-source-change - Bubbles. detail: { sourceId, zoneId, location, serverName }
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { getHraConnection, hraHasSubscription } from '../../library-store.js';
import { coverUrl, loadWithState } from '../utils-lit.js';
import { queueItem, queueWithFeedback, playWithFeedback } from '../../library-api.js';
import { FavoritesController } from '../../core/FavoritesController.js';
import { iconSearch } from '../../ag-icons.js';
import '../molecules/ag-library-list-row.js';
import '../molecules/ag-hra-search-filters.js';

/**
 * The HRA advanced criteria, unset. Their names are the query parameters the core
 * takes, so the search builds its request by walking this object rather than by
 * listing seven fields again.
 * @type {Readonly<Record<string, string>>}
 */
const EMPTY_HRA_FILTERS = Object.freeze({
    artist: '', composer: '', label: '', release: '', format: '', mood: '', sort: '',
});

export class AgLibrarySearch extends LitElement {
    static properties = {
        sourceId:  { type: String, attribute: 'source-id' },
        zoneId:    { type: String, attribute: 'zone-id' },
        sources:   { type: Array },
        _query:    { state: true },
        _results:  { state: true },
        _loading:  { state: true },
        _error:    { state: true },
        _hraFilters: { state: true },
        _hraSubscribed: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId  = '';
        this.zoneId    = '';
        this.sources   = [];
        this._query    = '';
        this._results  = null;
        this._loading  = false;
        // loadWithState writes here on a failure. It went nowhere: undeclared and never
        // rendered, so HRA answering "this search took too long, try again" — its
        // documented cold case — showed up as "No results for …", which is a different
        // statement entirely and the wrong advice.
        this._error    = '';
        this._debounce = null;
        /** Generation counter: an answer that resolves under an older token is dropped. */
        this._searchToken = 0;
        /**
         * @type {{artist: string, composer: string, label: string, release: string,
         *         format: string, mood: string, sort: string}}
         * The HRA advanced criteria currently in effect, as the form applied them.
         */
        this._hraFilters = { ...EMPTY_HRA_FILTERS };
        /**
         * @type {boolean} Whether the HRA account may search the catalogue —
         * hraHasSubscription() of the last connection read, so a plain boolean.
         * A purchases-only account has nothing searchable: the catalogue search
         * answers NO SUBSCRIPTION, and its purchases live in the browse's Vault.
         */
        this._hraSubscribed = true;
        this._fav      = new FavoritesController(this);   // streaming album ★ state
    }

    /** True for the streaming sources that support album favorites. */
    get _isStreaming() {
        return ['src_qobuz', 'src_tidal', 'src_highresaudio'].includes(this.sourceId);
    }

    /** @returns {boolean} Whether the active source is HIGHRESAUDIO. */
    get _isHighresaudio() { return this.sourceId === 'src_highresaudio'; }

    /** @returns {boolean} Whether an HRA criterion is set, which changes where the search goes. */
    get _hasHraFilters() {
        return this._isHighresaudio && !this.isEmptyHraFilters;
    }

    updated(changed) {
        // The filter row is rendered for HIGHRESAUDIO only, so leaving the source
        // destroys it and coming back builds an empty one. Its values must go with it:
        // kept, they narrowed every later search with no control on screen to undo it.
        if (changed.has('sourceId') && !this._isHighresaudio && !this.isEmptyHraFilters) {
            this._hraFilters = { ...EMPTY_HRA_FILTERS };
        }
        // What the account may search is the browse's question too, and the store
        // answers both from one cache. Read on every arrival at HRA: an account
        // change invalidates that cache, so coming back re-asks.
        if (changed.has('sourceId') && this._isHighresaudio) this._loadHraConnection();
    }

    /** @private Read whether the account may search the catalogue. */
    async _loadHraConnection() {
        const conn = await getHraConnection();
        if (this._isHighresaudio) this._hraSubscribed = hraHasSubscription(conn);
    }

    /** @returns {boolean} True when no HRA criterion is set. */
    get isEmptyHraFilters() {
        return !Object.values(this._hraFilters).some(Boolean);
    }

    /**
     * @returns {boolean} Whether an HRA criterion NARROWS the catalogue. The order is
     * not one of them: it arranges an answer, it does not produce one. Measured on the
     * box 2026-08-31 — an order on its own, in either direction, returns an empty list
     * rather than the head of the catalogue, and so does a request with no criterion at
     * all. Asking anyway would spend the slowest call HRA has on a certain nothing.
     */
    get _hraNarrowed() {
        const { sort, ...narrowing } = this._hraFilters;
        return this._isHighresaudio && Object.values(narrowing).some(Boolean);
    }

    /**
     * @private The advanced form was applied or cleared: run what it asks for.
     *
     * A criterion is a search of its own — HRA's advanced endpoint requires no term,
     * and `label=ECM` alone fills a page. This used to run only when the
     * box held something, so filling in a filter and pressing Search did nothing at
     * all, silently: the one visible symptom of a rule borrowed from the plain search.
     *
     * @param {CustomEvent} e
     */
    _onHraFilters(e) {
        this._hraFilters = e.detail;
        // The typing debounce may still be armed: left alone it fires a second,
        // unfiltered request after this one, and the slower filtered answer can land
        // first and be overwritten by it.
        clearTimeout(this._debounce);
        if (this._query.trim() || this._hasHraFilters) this._search();
        else this._results = null;   // cleared with an empty box: nothing left to show
    }

    _onInput(e) {
        this._query = e.target.value;
        clearTimeout(this._debounce);
        // Emptying the box does not empty the screen when the advanced form is set:
        // its criteria are a search on their own, and that is the one still standing.
        if (!this._query.trim() && !this._hraNarrowed) { this._results = null; this._error = ''; return; }
        this._debounce = setTimeout(() => this._search(), 400);
    }

    _onKeydown(e) {
        if (e.key === 'Enter') { clearTimeout(this._debounce); this._search(); }
        if (e.key === 'Escape') this._clearQuery();
    }

    /**
     * @private Empty the search box. The advanced criteria are not the box's, so they
     * stay — and what is on screen was narrowed by the words too, so it is asked
     * again rather than left standing for a search nobody is running any more.
     */
    _clearQuery() {
        this._query = '';
        clearTimeout(this._debounce);
        if (this._hasHraFilters) this._search();
        else this._results = null;
    }

    /** Return the group key of the currently active source. */
    _activeGroup() {
        return this.sources.find(s => s.id === this.sourceId)?.group ?? this.sourceId;
    }

    /** True if the given source badge should appear active. */
    _isActive(src) {
        return src.group === this._activeGroup();
    }

    _switchSource(src) {
        if (this._isActive(src)) return;
        this._query   = '';
        this._results = null;
        this.dispatchEvent(new CustomEvent('lib-source-change', {
            detail: { sourceId: src.id, zoneId: '', location: src.location ?? '', serverName: src.label },
            bubbles: true,
        }));
    }

    /** Find the device description URL for the current source (UPnP only). */
    _location() {
        return this.sources.find(s => s.id === this.sourceId)?.location ?? '';
    }

    async _search() {
        if (!this.sourceId) return;
        if (!this._query.trim() && !this._hraNarrowed) {
            // An order with nothing to arrange: HRA answers with an empty list, so
            // this says why instead of showing "no results" for a search that never
            // had a chance — and instead of spending its slowest call to learn it.
            this._results = null;
            this._error = this._hasHraFilters
                ? 'An order arranges results — add something to search for.'
                : '';
            return;
        }
        this._error = '';
        // Said here rather than discovered as a failed request: the catalogue
        // search answers NO SUBSCRIPTION for this account on every query, so
        // running it would only dress the same fact as an error.
        if (this._isHighresaudio && !this._hraSubscribed) {
            this._results = null;
            this._error = 'This HIGHRESAUDIO account has no streaming subscription, and '
                        + 'search covers the catalogue. Its purchases are in the browse, '
                        + 'under Vault.';
            return;
        }
        const q = this._query.trim();
        // A slow filtered search (HRA takes tens of seconds on a cold one) can resolve
        // after a later, faster one. The token is checked where the answer comes back.
        const token = ++this._searchToken;
        await loadWithState(this, async () => {
            // Filtered, the search goes to HRA's own advanced endpoint, which answers
            // with albums only — so the artist and track sections are absent rather
            // than stale. Unfiltered, nothing changes: the ordinary search still
            // covers all three, on every source.
            if (this._hasHraFilters) {
                // The criteria are named after the parameters the core takes, so the
                // request is the form itself minus what is unset — nothing to keep in
                // step when a criterion is added or dropped.
                const params = new URLSearchParams({ limit: '50' });
                if (q) params.set('q', q);
                for (const [key, value] of Object.entries(this._hraFilters)) {
                    if (value) params.set(key, value);
                }
                const albums = await apiGet(`/library/highresaudio-search?${params}`);
                if (token !== this._searchToken) return;   // superseded while we waited
                this._results = { query: q, source_id: this.sourceId, artists: [], albums, tracks: [] };
                return;
            }
            const params = new URLSearchParams({
                source_id: this.sourceId,
                q,
                limit:     '50',
            });
            if (this.zoneId) params.set('zone_id', this.zoneId);
            const loc = this._location();
            if (loc) params.set('location', loc);
            const results = await apiGet(`/library/search?${params}`);
            if (token !== this._searchToken) return;
            this._results = results;
        });
        // Same guard as the browse: a known purchases-only account's ★ request is
        // refused upstream and never cached, so it would repeat on every search.
        if (this._isStreaming && !(this._isHighresaudio && !this._hraSubscribed)) {
            this._fav.load(this.sourceId);   // non-blocking — album ★ state
        }
    }

    _itemOpts(itemId, itemType, artistId, itemTitle, action) {
        return {
            sourceId:    this.sourceId,
            zoneId:      this.zoneId,
            itemId,
            itemType,
            action,
            artistId,
            hierarchy:   'search',
            searchQuery: this._query,
            itemTitle,
        };
    }

    async _play(itemId, itemType, artistId, itemTitle) {
        const ok = await playWithFeedback(
            () => queueItem(this._itemOpts(itemId, itemType, artistId, itemTitle, 'play')),
        );
        if (ok) this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
    }

    async _addToQueue(itemId, itemType, artistId, itemTitle) {
        await queueWithFeedback(
            () => queueItem(this._itemOpts(itemId, itemType, artistId, itemTitle, 'add')),
            itemTitle || itemType,
        );
    }

    _renderRow(item, type) {
        const sub   = type === 'track'  ? `${item.artist ?? ''} — ${item.album ?? ''}`
                    : type === 'album'  ? `${item.artist ?? ''} · ${item.year ?? ''}`
                    : item.name ?? item.title;
        const label = type === 'track' ? item.title : (item.title ?? item.name);
        // An artist is a navigational entity, not a playable item — tapping it
        // drills down to its albums instead of queueing (which the backends
        // reject: only track / album / playlist are queueable). No add action.
        if (type === 'artist') {
            // Drill-down resolves albums via /library/albums?artist_id=…, which is
            // unsupported for UPnP/DLNA (ContentDirectory-only) and unreliable for
            // Roon (its search item_keys are session-scoped and can't be navigated
            // on the browse hierarchy — use the dedicated Roon browser instead).
            // For those sources the artist row stays inert rather than opening a
            // dead-end / wrong-node view. BACKLOG: proper Roon search drill-down.
            const src = this.sourceId ?? '';
            const drillable = !src.startsWith('upnp:') && src !== 'src_roon' && src !== 'src_mono-sgen';
            return html`
                <ag-library-list-row
                    cover=${coverUrl(item.cover_token)}
                    fallback="album"
                    title=${label}
                    subtitle=${sub}
                    @row-click=${drillable ? () => this.dispatchEvent(new CustomEvent('lib-open-artist', {
                        detail: { artistId: item.id, artistName: item.name ?? label },
                        bubbles: true,
                    })) : null}
                ></ag-library-list-row>
            `;
        }
        return html`
            <ag-library-list-row
                cover=${coverUrl(item.cover_token)}
                fallback=${type === 'track' ? 'track' : 'album'}
                title=${label}
                subtitle=${sub}
                actionable
                ?favoritable=${type === 'album' && this._isStreaming}
                ?favorite=${type === 'album' && this._fav.has(item.id)}
                @fav-toggle=${(e) => this._fav.toggle(this.sourceId, item.id, e.detail.favorite)}
                @row-click=${() => this._play(item.id, type, item.artist, label)}
                @row-action=${() => this._addToQueue(item.id, type, item.artist, label)}
            ></ag-library-list-row>
        `;
    }

    render() {
        const { _query, _results, _loading, _error } = this;
        const hasResults = _results && (_results.tracks?.length || _results.albums?.length || _results.artists?.length);
        // Something was asked for — by typing, or by the advanced form on its own. The
        // second is why this is not just `_query`: a search on criteria alone would
        // otherwise sit under "Search your library", as if nothing had been asked.
        const asked = Boolean(_query) || this._hraNarrowed;

        return html`
            <div class="lib-search-bar">
                <svg viewBox="0 0 24 24">${iconSearch}</svg>
                <input
                    class="lib-search-input"
                    type="search"
                    placeholder="Artists, albums, tracks…"
                    .value=${_query}
                    @input=${this._onInput}
                    @keydown=${this._onKeydown}
                    autocomplete="off"
                />
                ${_query ? html`
                    <button class="lib-search-cancel" @click=${() => this._clearQuery()}>
                        Cancel
                    </button>
                ` : nothing}
            </div>

            ${this._isHighresaudio && this._hraSubscribed ? html`
                <ag-hra-search-filters
                    @hra-filters-change=${(e) => this._onHraFilters(e)}
                ></ag-hra-search-filters>
            ` : nothing}

            ${this.sources.length > 0 ? html`
                <div class="lib-src-badges">
                    ${this.sources.map(src => html`
                        <button
                            class="lib-src-badge ${this._isActive(src) ? 'active' : ''}"
                            @click=${() => this._switchSource(src)}
                        >${src.label}</button>
                    `)}
                </div>
            ` : nothing}

            ${_loading ? html`<div class="lib-loading">Searching…</div>` : nothing}

            ${!_loading && _error ? html`<div class="lib-empty">${_error}</div>` : nothing}

            ${hasResults ? html`
                ${_results.artists?.length ? html`
                    <span class="lib-results-label">Artists</span>
                    ${_results.artists.map(a => this._renderRow({ ...a, title: a.name }, 'artist'))}
                ` : nothing}
                ${_results.albums?.length ? html`
                    <span class="lib-results-label">Albums</span>
                    ${_results.albums.map(a => this._renderRow(a, 'album'))}
                ` : nothing}
                ${_results.tracks?.length ? html`
                    <span class="lib-results-label">Tracks</span>
                    ${_results.tracks.map(t => this._renderRow(t, 'track'))}
                ` : nothing}
            ` : nothing}

            ${!_loading && !_error && !hasResults && asked ? html`
                <div class="lib-empty">
                    ${_query ? `No results for "${_query}"` : 'No results for those criteria'}
                </div>
            ` : nothing}

            ${!asked && !_error ? html`
                <div class="lib-empty" style="padding-top:60px">
                    Search your library
                </div>
            ` : nothing}

            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-search', AgLibrarySearch);
