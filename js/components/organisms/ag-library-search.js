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
import { coverUrl, loadWithState } from '../utils-lit.js';
import { queueItem, queueWithFeedback } from '../../library-api.js';
import { showToast } from '../../ui-helpers.js';
import { iconSearch } from '../../ag-icons.js';
import '../molecules/ag-library-list-row.js';

export class AgLibrarySearch extends LitElement {
    static properties = {
        sourceId:  { type: String, attribute: 'source-id' },
        zoneId:    { type: String, attribute: 'zone-id' },
        sources:   { type: Array },
        _query:    { state: true },
        _results:  { state: true },
        _loading:  { state: true },
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
        this._debounce = null;
    }

    _onInput(e) {
        this._query = e.target.value;
        clearTimeout(this._debounce);
        if (!this._query.trim()) { this._results = null; return; }
        this._debounce = setTimeout(() => this._search(), 400);
    }

    _onKeydown(e) {
        if (e.key === 'Enter') { clearTimeout(this._debounce); this._search(); }
        if (e.key === 'Escape') { this._query = ''; this._results = null; }
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
        if (!this.sourceId || !this._query.trim()) return;
        await loadWithState(this, async () => {
            const params = new URLSearchParams({
                source_id: this.sourceId,
                q:         this._query.trim(),
                limit:     '50',
            });
            if (this.zoneId) params.set('zone_id', this.zoneId);
            const loc = this._location();
            if (loc) params.set('location', loc);
            this._results = await apiGet(`/library/search?${params}`);
        });
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
        try {
            await queueItem(this._itemOpts(itemId, itemType, artistId, itemTitle, 'play'));
            this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
        } catch (e) {
            console.error('[search] play failed:', e);
        }
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
        return html`
            <ag-library-list-row
                cover=${coverUrl(item.cover_token)}
                fallback=${type === 'track' ? 'track' : 'album'}
                title=${label}
                subtitle=${sub}
                actionable
                @row-click=${() => this._play(item.id, type, item.artist, label)}
                @row-action=${() => this._addToQueue(item.id, type, item.artist, label)}
            ></ag-library-list-row>
        `;
    }

    render() {
        const { _query, _results, _loading } = this;
        const hasResults = _results && (_results.tracks?.length || _results.albums?.length || _results.artists?.length);

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
                    <button class="lib-search-cancel" @click=${() => { this._query = ''; this._results = null; }}>
                        Cancel
                    </button>
                ` : nothing}
            </div>

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

            ${!_loading && !hasResults && _query ? html`
                <div class="lib-empty">No results for "${_query}"</div>
            ` : nothing}

            ${!_query ? html`
                <div class="lib-empty" style="padding-top:60px">
                    Search your library
                </div>
            ` : nothing}

            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-search', AgLibrarySearch);
