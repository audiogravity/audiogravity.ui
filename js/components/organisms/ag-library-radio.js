/**
 * @module AgLibraryRadio
 * @description Internet-radio view inside the library. Three sub-tabs:
 *   - My Live Radio — user-curated collection (custom stations + saved RBI hits).
 *                     Default sub-tab; hosts the "Add custom station" form.
 *   - Favorites     — starred subset, can include stations not in the library.
 *   - Search        — debounced query box + country / genre / hi-res filters.
 *
 * Two orthogonal membership sets — ``_libraryUuids`` and ``_favoriteUuids`` —
 * are loaded on mount so every card across the three sub-tabs reflects its
 * correct dual-membership state without re-fetching on tab switch.
 *
 * Card actions:
 *   - tap body                     → ``radioPlay`` (queue stream on MPD)
 *   - star toggle                  → add/remove from Favorites
 *   - plus toggle                  → add/remove from My Live Radio
 *   - pencil (custom stations)     → open the edit form
 *   - left-swipe past threshold    → remove from the current sub-tab's list
 *
 * @element ag-library-radio
 * @dependency css/components/library-radio.css
 */
import { LitElement, html, nothing } from 'lit';
import {
    radioSearch,
    radioLibrary, radioAddToLibrary, radioAddCustomStation, radioRemoveFromLibrary,
    radioFavorites, radioAddFavorite, radioRemoveFavorite,
    radioEditStation, radioPlay,
} from '../../radio-api.js';
import { RADIO_COUNTRIES, RADIO_GENRES } from '../library-constants.js';
import '../molecules/ag-radio-card.js';

const _SEARCH_DEBOUNCE_MS = 300;

export class AgLibraryRadio extends LitElement {
    static properties = {
        _view:           { state: true }, // 'library' | 'favorites' | 'search'
        _stations:       { state: true },
        _libraryUuids:   { state: true },
        _favoriteUuids:  { state: true },
        _loading:        { state: true },
        _error:          { state: true },
        _searchQuery:    { state: true },
        _searchCountry:  { state: true },
        _searchGenre:    { state: true },
        _searchHiRes:    { state: true },
        _customFormOpen: { state: true },
        _customForm:     { state: true },
        _customSaving:   { state: true },
        _customEditUuid: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._view          = 'library';
        this._stations      = [];
        this._libraryUuids  = new Set();
        this._favoriteUuids = new Set();
        this._loading       = false;
        this._error         = '';
        this._searchQuery   = '';
        this._searchCountry = '';
        this._searchGenre   = '';
        this._searchHiRes   = false;
        this._searchDebounceTimer = null;
        // UUIDs with a star or plus mutation in flight — prevents spam-tap
        // reordering (rapid add+remove could otherwise resolve out of order
        // and leave the local Set out of sync with the backend).
        this._pendingFavoriteUuids = new Set();
        this._pendingLibraryUuids  = new Set();
        // Custom-station form (visible only in the My Live Radio sub-tab).
        this._customFormOpen = false;
        this._customForm     = { title: '', url: '', image_url: '', genre: '' };
        this._customSaving   = false;
        this._customEditUuid = null;
    }

    connectedCallback() {
        super.connectedCallback();
        // Initial load: populate the library list + both membership sets so
        // every sub-tab is rendering accurate badges from the first frame.
        this._loadAll();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearTimeout(this._searchDebounceTimer);
    }

    // ------------------------------------------------------------------
    // Data loaders
    // ------------------------------------------------------------------

    async _loadAll() {
        await Promise.all([this._loadLibrary(), this._refreshFavoriteSet()]);
    }

    async _loadLibrary() {
        try {
            const lib = await radioLibrary();
            this._libraryUuids = new Set(lib.map(e => e.station.uuid));
            if (this._view === 'library') {
                this._stations = lib.map(e => e.station);
            }
        } catch (e) {
            this._libraryUuids = new Set();
        }
    }

    async _refreshFavoriteSet() {
        try {
            const favs = await radioFavorites();
            this._favoriteUuids = new Set(favs.map(f => f.station.uuid));
        } catch (e) {
            this._favoriteUuids = new Set();
        }
    }

    async _loadFavorites() {
        try {
            const favs = await radioFavorites();
            this._favoriteUuids = new Set(favs.map(f => f.station.uuid));
            if (this._view === 'favorites') {
                this._stations = favs.map(f => f.station);
            }
        } catch (e) {
            this._favoriteUuids = new Set();
        }
    }

    async _loadSearch() {
        this._loading = true;
        this._error   = '';
        try {
            const { stations } = await radioSearch({
                q:            this._searchQuery || undefined,
                country_code: this._searchCountry || undefined,
                tag:          this._searchGenre || undefined,
                hi_res_only:  this._searchHiRes || undefined,
                limit:        80,
            });
            this._stations = stations;
        } catch (e) {
            this._error    = 'Search failed';
            this._stations = [];
        } finally {
            this._loading = false;
        }
    }

    // ------------------------------------------------------------------
    // View switching
    // ------------------------------------------------------------------

    _switchView(view) {
        if (this._view === view) return;
        this._view = view;
        this._error = '';
        // Close any open custom-station form when leaving My Live Radio.
        if (view !== 'library') this._customFormOpen = false;
        if (view === 'library') {
            this._loadLibrary();
        } else if (view === 'favorites') {
            this._loadFavorites();
        } else if (view === 'search') {
            if (this._searchQuery || this._searchCountry || this._searchGenre || this._searchHiRes) {
                this._loadSearch();
            } else {
                this._stations = [];
            }
        }
    }

    // ------------------------------------------------------------------
    // Search input handling (debounced)
    // ------------------------------------------------------------------

    _onSearchInput = (e) => {
        this._searchQuery = e.target.value;
        this._scheduleSearch();
    };

    _onCountryChange = (e) => {
        this._searchCountry = e.target.value;
        this._scheduleSearch(/* immediate */ true);
    };

    _onGenreChange = (e) => {
        this._searchGenre = e.target.value;
        this._scheduleSearch(/* immediate */ true);
    };

    _onHiResChange = (e) => {
        this._searchHiRes = e.target.checked;
        this._scheduleSearch(/* immediate */ true);
    };

    /**
     * Reschedule the search load. ``immediate`` (used by filter selects)
     * cancels any pending debounce so a stale text-input timer can't fire
     * after the user picked a country/genre/hi-res — which would otherwise
     * race two searches and render whichever returned last.
     */
    _scheduleSearch(immediate = false) {
        clearTimeout(this._searchDebounceTimer);
        if (immediate) {
            this._loadSearch();
        } else {
            this._searchDebounceTimer = setTimeout(() => this._loadSearch(), _SEARCH_DEBOUNCE_MS);
        }
    }

    // ------------------------------------------------------------------
    // Card actions
    // ------------------------------------------------------------------

    _onPlay = async (e) => {
        const { station } = e.detail;
        try {
            await radioPlay(station.uuid);
        } catch (err) {
            this._error = 'Playback failed — check the MPD output is free';
        }
    };

    /**
     * Membership-flag dispatch table. Both card events (favorite + library)
     * share the same shape — set/clear a flag, update a local UUID Set, drop
     * the row from ``_stations`` if we're on that flag's tab — so they're
     * handled by one parameterised helper rather than two near-identical
     * methods. Backend DELETE endpoints are idempotent (always 204) so no
     * 404 handling is needed.
     */
    _MEMBERSHIP = {
        favorite: {
            uuidsKey: '_favoriteUuids',
            pendingKey: '_pendingFavoriteUuids',
            add:    radioAddFavorite,
            remove: radioRemoveFavorite,
            view:   'favorites',
            errMsg: 'Could not update favourite',
        },
        library: {
            uuidsKey: '_libraryUuids',
            pendingKey: '_pendingLibraryUuids',
            add:    radioAddToLibrary,
            remove: radioRemoveFromLibrary,
            view:   'library',
            errMsg: 'Could not update My Live Radio',
        },
    };

    async _toggleMembership(kind, station, value) {
        const cfg = this._MEMBERSHIP[kind];
        const pending = this[cfg.pendingKey];
        if (pending.has(station.uuid)) return;
        pending.add(station.uuid);
        try {
            if (value) {
                await cfg.add(station.uuid);
                this[cfg.uuidsKey] = new Set([...this[cfg.uuidsKey], station.uuid]);
            } else {
                await cfg.remove(station.uuid);
                const next = new Set(this[cfg.uuidsKey]);
                next.delete(station.uuid);
                this[cfg.uuidsKey] = next;
                if (this._view === cfg.view) {
                    this._stations = this._stations.filter(s => s.uuid !== station.uuid);
                }
            }
        } catch (err) {
            this._error = cfg.errMsg;
        } finally {
            pending.delete(station.uuid);
        }
    }

    _onFavoriteToggle = (e) => this._toggleMembership('favorite', e.detail.station, e.detail.favorite);
    _onLibraryToggle  = (e) => this._toggleMembership('library',  e.detail.station, e.detail.in_library);

    _onSwipeRemove = (e) => {
        // Swipe means "remove from the currently displayed list" — direct
        // dispatch to the right flag toggle (Search disables the gesture
        // entirely so we don't need to defend against `view === 'search'`).
        const station = e.detail.station;
        if (this._view === 'favorites') this._toggleMembership('favorite', station, false);
        else if (this._view === 'library') this._toggleMembership('library', station, false);
    };

    // ------------------------------------------------------------------
    // Custom-station form
    // ------------------------------------------------------------------

    _openCustomForm = () => {
        this._customForm = { title: '', url: '', image_url: '', genre: '' };
        this._customEditUuid = null;
        this._customFormOpen = true;
    };

    _openEditForm = (station) => {
        this._customForm = {
            title:     station.name || '',
            url:       station.url || '',
            image_url: station.favicon || '',
            genre:     station.tags || '',
        };
        this._customEditUuid = station.uuid;
        this._customFormOpen = true;
    };

    _closeCustomForm = () => {
        this._customFormOpen = false;
        this._customEditUuid = null;
    };

    _updateCustomField(field, value) {
        this._customForm = { ...this._customForm, [field]: value };
    }

    _submitCustomForm = async (e) => {
        e.preventDefault();
        if (this._customSaving) return;
        const { title, url, image_url, genre } = this._customForm;
        if (!title.trim() || !/^https?:\/\//.test(url.trim())) {
            this._error = 'Title required and URL must start with http(s)://';
            return;
        }
        this._customSaving = true;
        this._error = '';
        const payload = {
            title:     title.trim(),
            url:       url.trim(),
            image_url: image_url.trim() || undefined,
            genre:     genre.trim() || undefined,
        };
        try {
            if (this._customEditUuid) {
                await radioEditStation(this._customEditUuid, payload);
            } else {
                await radioAddCustomStation(payload);
            }
            this._customFormOpen = false;
            this._customEditUuid = null;
            await this._loadLibrary();
        } catch (err) {
            this._error = err?.detail || 'Could not save station';
        } finally {
            this._customSaving = false;
        }
    };

    _onCardEdit = (e) => {
        this._openEditForm(e.detail.station);
    };

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    render() {
        return html`
            <div class="lib-radio">
                ${this._renderTabs()}
                ${this._view === 'search'   ? this._renderSearchControls()  : nothing}
                ${this._view === 'library'  ? this._renderLibraryHeader()   : nothing}
                ${this._renderBody()}
            </div>
        `;
    }

    _renderTabs() {
        const tabs = [
            { key: 'library',   label: 'My Live Radio' },
            { key: 'favorites', label: 'Favorites'     },
            { key: 'search',    label: 'Search'        },
        ];
        return html`
            <div class="lib-radio-tabs">
                ${tabs.map(t => html`
                    <button class="lib-radio-tab ${this._view === t.key ? 'on' : ''}"
                            @click=${() => this._switchView(t.key)}>
                        ${t.label}
                    </button>
                `)}
            </div>
        `;
    }

    _renderSearchControls() {
        return html`
            <div class="lib-radio-search-wrap">
                <input
                    class="lib-radio-search-input"
                    type="search"
                    placeholder="Search radio stations…"
                    .value=${this._searchQuery}
                    @input=${this._onSearchInput}
                />
                <div class="lib-radio-filters">
                    <select class="lib-radio-filter" @change=${this._onCountryChange}>
                        ${RADIO_COUNTRIES.map(c => html`
                            <option value=${c.code} ?selected=${c.code === this._searchCountry}>${c.label}</option>
                        `)}
                    </select>
                    <select class="lib-radio-filter" @change=${this._onGenreChange}>
                        ${RADIO_GENRES.map(g => html`
                            <option value=${g.tag} ?selected=${g.tag === this._searchGenre}>${g.label}</option>
                        `)}
                    </select>
                    <label class="lib-radio-hires-toggle">
                        <input type="checkbox"
                               .checked=${this._searchHiRes}
                               @change=${this._onHiResChange} />
                        Hi-Res only
                    </label>
                </div>
            </div>
        `;
    }

    _renderBody() {
        if (this._loading) {
            return html`<div class="lib-radio-loading">Loading…</div>`;
        }
        if (this._error) {
            return html`<div class="lib-radio-empty">${this._error}</div>`;
        }
        if (this._stations.length === 0) {
            return html`<div class="lib-radio-empty">${this._emptyMessage()}</div>`;
        }
        // Edit is available on any saved station (RBI or custom) — the user
        // can rename / fix logo / paste a better stream URL. Hidden on Search
        // results since those rows aren't owned yet.
        const inSearch = this._view === 'search';
        const swipeable = !inSearch;
        return html`
            <div class="lib-radio-list"
                 @radio-play=${this._onPlay}
                 @radio-favorite-toggle=${this._onFavoriteToggle}
                 @radio-library-toggle=${this._onLibraryToggle}
                 @radio-swipe-remove=${this._onSwipeRemove}
                 @radio-edit=${this._onCardEdit}>
                ${this._stations.map(s => html`
                    <ag-radio-card
                        .station=${s}
                        ?favorite=${this._favoriteUuids.has(s.uuid)}
                        ?in-library=${this._libraryUuids.has(s.uuid)}
                        ?editable=${!inSearch}
                        ?swipeable=${swipeable}
                    ></ag-radio-card>
                `)}
            </div>
        `;
    }

    _emptyMessage() {
        if (this._view === 'library')   return 'No stations in My Live Radio yet. Add a custom one above, or tap + on any Search result.';
        if (this._view === 'favorites') return 'No favourites yet. Tap ★ on any station to save it here.';
        if (this._view === 'search')    return 'Type a query or pick a filter to find stations.';
        return 'No stations available.';
    }

    _renderLibraryHeader() {
        if (!this._customFormOpen) {
            return html`
                <div class="lib-radio-fav-header">
                    <button class="lib-radio-add-btn" @click=${this._openCustomForm}>
                        + Add custom station
                    </button>
                </div>
            `;
        }
        const isEdit = !!this._customEditUuid;
        const f = this._customForm;
        return html`
            <form class="lib-radio-custom-form" @submit=${this._submitCustomForm}>
                <div class="lib-radio-form-title">
                    ${isEdit ? 'Edit station' : 'Add custom station'}
                </div>
                <input
                    class="lib-radio-search-input"
                    type="text"
                    placeholder="Title (e.g. Radio Paradise FLAC)"
                    required
                    .value=${f.title}
                    @input=${e => this._updateCustomField('title', e.target.value)}
                />
                <input
                    class="lib-radio-search-input"
                    type="url"
                    placeholder="Stream URL (https://…)"
                    required
                    pattern="https?://.+"
                    .value=${f.url}
                    @input=${e => this._updateCustomField('url', e.target.value)}
                />
                <input
                    class="lib-radio-search-input"
                    type="url"
                    placeholder="Image URL (optional)"
                    .value=${f.image_url}
                    @input=${e => this._updateCustomField('image_url', e.target.value)}
                />
                <input
                    class="lib-radio-search-input"
                    type="text"
                    placeholder="Genre (optional, e.g. jazz, classical)"
                    .value=${f.genre}
                    @input=${e => this._updateCustomField('genre', e.target.value)}
                />
                <div class="lib-radio-form-actions">
                    <button type="button" class="lib-radio-tab" @click=${this._closeCustomForm}>Cancel</button>
                    <button type="submit" class="lib-radio-tab on" ?disabled=${this._customSaving}>
                        ${this._customSaving ? 'Saving…' : (isEdit ? 'Update' : 'Save')}
                    </button>
                </div>
            </form>
        `;
    }
}

customElements.define('ag-library-radio', AgLibraryRadio);
