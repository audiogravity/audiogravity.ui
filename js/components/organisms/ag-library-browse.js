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
import {
    getHraCategories, getHraGenres, getHraLabels, getHraPlaylistGroups,
    getHraConnection, hraHasSubscription,
} from '../../library-store.js';
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
// HRA keeps two separate playlist trees — the selections it publishes, and the
// account's own — with independent id sequences. They share the second strip, the
// way the genres do, rather than doubling the shelf bar.
const HRA_PLAYLISTS_PILL = ['playlists', 'Playlists'];
// Third entry: the shelf heading. It is NOT the pill label plus the word "playlists" —
// that reading gave "Mine playlists". A button and a heading are not the same sentence.
/** The tree HRA publishes itself — the only one with shelves under it. */
const HRA_PLAYLIST_EDITORIAL = 'editorial';
const HRA_PLAYLIST_KINDS = [
    [HRA_PLAYLIST_EDITORIAL, 'Editorial', 'Editorial playlists'],
    ['mine', 'Mine', 'My playlists'],
    ['genre', 'Genre', 'Playlists by genre'],
    ['theme', 'Theme', 'Playlists by theme'],
];
// The last two are not trees of their own: they are HRA's own groupings OF the
// editorial tree, so they ask for `editorial` and name the grouping beside it. Kept in
// the same strip because that is what they are to a reader — a fourth way into the same
// selections, beside the account's own.
const HRA_PLAYLIST_GROUP_KINDS = new Set(['genre', 'theme']);
// The albums the account bought — HRA's VirtualVault, a second tree beside the
// streaming catalogue with its own routes. It sits with Favorites, ahead of the two
// ways of arranging the catalogue: both are the listener's own. And it is the ONLY
// pill an account without a subscription gets: HRA still signs such an account in,
// and answers NO SUBSCRIPTION to everything but its purchases — so a bar that
// offered Favorites or a shelf would offer buttons that fail.
const HRA_VAULT_PILL = ['vault', 'Vault'];
// The shelves HRA files its editorial selections on — its own `category` field,
// filtered server-side. Hard-coded rather than fetched: HRA publishes no endpoint
// listing them, and the four are documented (three at §5.4 of their spec, `Moods`
// measured live on 2026-08-28). Leading with "All" is what makes them a filter and
// not a partition: fourteen selections carry no category at all — measured by
// walking the whole tree, and they are titles like *Mr. Slowhand — Eric Clapton*,
// not rubbish. Any shelf HRA adds later still appears under All until it is listed
// here, and asking for an unknown one answers empty rather than failing.
const HRA_PLAYLIST_ALL = '';
const HRA_PLAYLIST_CATEGORIES = [
    [HRA_PLAYLIST_ALL, 'All'],
    ['New Releases', 'New Releases'],
    ['Recommended', 'Recommended'],
    ['Popular', 'Popular'],
    ['Moods', 'Moods'],
];
// HIGHRESAUDIO's menu, as its publisher laid it out: seven shelves, each opening a
// strip of its own, instead of the eighteen pills that used to run in a single bar with
// the fourteen shop categories spilling off the end of it.
const HRA_CATEGORIES_PILL = ['categories', 'Categories'];
const HRA_CHARTS_PILL     = ['charts', 'Charts'];
const HRA_LABELS_PILL     = ['labels', 'Labels'];
// The order HIGHRESAUDIO asked for, for the entries they named. Everything they publish
// and did not name follows, in their own order: the shelf shows the catalogue as it is,
// it does not curate it. Keyed on the TITLE — the stable half of the pair, the one that
// already addresses the endpoint — not on the label, which is display text the core is
// free to re-word (four of these are German keys it relabels; a wording tweak there
// would silently send the category to the back of the strip and change where the shelf
// lands). Lothar wrote 'New Release', 'Recently Added'… — these are those six, by key.
const HRA_CATEGORY_ORDER = [
    'Neuheiten',                 // New Release
    'Neue Alben hinzugefügt',    // Recently Added
    'Top Alben',                 // Top Albums
    'Hörtipps',                  // Listening Tips
    'High-Res Essentials',
    'Editors Choice',
];
const HRA_LABEL_ORDER = ['2L', 'audite', 'ECM', 'Pentatone', 'Warner', 'Universal', 'Sony'];

/**
 * Order a listed shelf by a preferred sequence, keeping everything else behind it.
 *
 * @param {Array<{title: string, label: string}>} items - What the core listed.
 * @param {Array<string>} preferred - Titles to bring to the front, in that order.
 * @returns {Array<{title: string, label: string}>} A new array; nothing is dropped.
 */
function orderByTitle(items, preferred) {
    const rank = (it) => {
        const i = preferred.indexOf(it.title);
        return i === -1 ? preferred.length : i;
    };
    return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Label of the pill that stands for a whole genre rather than one of its sub-genres. */
const HRA_WHOLE_GENRE_LABEL = 'All';
/** What a card or a row says to tell a playlist from an album, on every streaming source. */
const PLAYLIST_TAG = 'Playlist';


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
        _hraLabels:   { state: true },
        _hraPlaylistGroups: { state: true },
        _genre:       { state: true },
        _category:    { state: true },
        _label:       { state: true },
        _playlistKind: { state: true },
        _playlistCategory: { state: true },
        _playlistGroup: { state: true },
        _hraSubscribed: { state: true },
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
        /** @type {string} Which HRA playlist tree is shown: 'editorial' or 'mine'. */
        this._playlistKind = HRA_PLAYLIST_KINDS[0][0];
        /** @type {string} Which HRA shelf the editorial tree is narrowed to; '' = all. */
        this._playlistCategory = HRA_PLAYLIST_ALL;
        /** @type {Array<{title: string, label: string}>} HRA record labels, one pill each. */
        this._hraLabels   = [];
        /** @type {Record<string, Array<{title: string, label: string}>>} Playlist groupings. */
        this._hraPlaylistGroups = { genre: [], theme: [] };
        /** @type {string} Chosen shop category (its addressing title); '' = none yet. */
        this._category    = '';
        /** @type {string} Chosen record label (its title); '' = none yet. */
        this._label       = '';
        /** @type {string} Chosen playlist genre or theme (its title); '' = none yet. */
        this._playlistGroup = '';
        /**
         * @type {boolean} Whether the HRA account may stream the catalogue — always
         * `hraHasSubscription(...)` of the last connection read, so "unknown" is
         * already folded to true (the state every account had before the core
         * reported it) and every reader may treat this as a plain boolean.
         */
        this._hraSubscribed = true;
        this._fav         = new FavoritesController(this);   // streaming album ★ state
        this._edges       = new ScrollEdgesController(this); // filter-bar overflow markers
        this._genreEdges  = new ScrollEdgesController(this); // genre-strip overflow markers
        this._playlistEdges = new ScrollEdgesController(this); // playlist-strip markers
        this._shelfEdges  = new ScrollEdgesController(this); // shelf-strip markers
        this._entryEdges  = new ScrollEdgesController(this); // categories / labels strip
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

    /** @returns {boolean} Whether the HRA purchases are on screen. */
    get _isVault() { return this._isHighresaudio && this._filter === HRA_VAULT_PILL[0]; }

    /**
     * @returns {boolean} Whether the grid offers the ★. The star writes the item id to
     * the service's ALBUM favourites, so it may only be offered where the grid holds
     * albums. A purchase is not one — a Vault id is not a catalogue id, and an account
     * without a subscription is refused the favourites anyway. Nor is a playlist: the
     * star on a playlist card sent `editorial:42` to HRA's My Album, an id that route
     * has never heard of. Same conflation as the untagged card, same answer.
     */
    get _showsFavorites() {
        return this._isStreaming && !this._isVault && !this._showsPlaylists;
    }

    updated(changed) {
        // Reload on a source switch or when entering/leaving/changing artist mode.
        if ((changed.has('sourceId') || changed.has('artistId')) && this.sourceId) {
            // For HRA the landing pill depends on the account; the last known
            // subscription state decides here, and _load() re-decides once the
            // connection has answered — same expression both times, so the bar and
            // the filter cannot disagree for a frame.
            this._filter = !this._isStreaming ? 'all'
                : this._isHighresaudio ? this._hraLandingFilter : 'favorites';
            this._genre = null;
            this._category = '';
            this._label = '';
            this._playlistKind = HRA_PLAYLIST_KINDS[0][0];
            this._playlistCategory = HRA_PLAYLIST_ALL;
            this._playlistGroup = '';
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
        watch(this._playlistEdges, 'playlists');
        watch(this._shelfEdges, 'shelves');
        watch(this._entryEdges, 'entries');
        // Only when the pills themselves can have changed. Measuring on every update
        // would read the strip's geometry right after a DOM mutation — a forced layout
        // per appended album page, and per ★ toggled anywhere in the app.
        // `_hraSubscribed` too: the bar itself jumps between one pill (Vault) and seven
        // when the subscription state is learned, and the old code only healed that by
        // accident — the categories arriving used to re-measure it. Without this, a
        // non-subscribed read followed by a subscribed one left the bar overflowing
        // with its markers still saying it did not (review).
        if (changed.has('sourceId') || changed.has('artistId') || changed.has('_hraSubscribed')) {
            this._edges.measure();
        }
        if (changed.has('_hraGenres') || changed.has('_genre') || changed.has('_filter')) {
            this._genreEdges.measure();
        }
        // The entries strip is filled asynchronously, and it holds the fourteen pills
        // that used to overflow the filter bar — so it is the one that most needs its
        // markers remeasured once its list lands.
        if (changed.has('_hraCategories') || changed.has('_hraLabels') || changed.has('_filter')) {
            this._entryEdges.measure();
        }
        if (changed.has('_hraPlaylistGroups') || changed.has('_playlistKind')) {
            this._shelfEdges.measure();
        }
    }

    /** @private Fill the HRA genre tree; a failure leaves the strip empty and retryable. */
    async _loadHraGenres() {
        const genres = await getHraGenres();
        if (this._isHighresaudio) this._hraGenres = genres;
    }

    /** @private Fill the HRA label strip; a failure leaves it empty and retryable. */
    async _loadHraLabels() {
        const labels = await getHraLabels();
        // The source can have changed while the answer was in flight.
        if (!this._isHighresaudio) return;
        this._hraLabels = labels;
        this._openFirstEntry(HRA_LABELS_PILL[0], '_label', this._labelPills);
    }

    /**
     * @private Fill one playlist grouping strip.
     * @param {'genre'|'theme'} kind
     */
    async _loadHraPlaylistGroups(kind) {
        const groups = await getHraPlaylistGroups(kind);
        // A new object, not a mutated one: Lit compares by reference to decide whether
        // to re-render, so writing into the existing map would fill the strip in state
        // and leave the previous one on screen.
        if (!this._isHighresaudio) return;
        this._hraPlaylistGroups = { ...this._hraPlaylistGroups, [kind]: groups };
        // The same visibility test _openFirstEntry leads with, which this inline copy
        // had lost (review): _playlistKind survives leaving the Playlists shelf, so a
        // slow list landing after the reader moved to Favorites would otherwise pick a
        // group and reload — blanking the grid they are reading, for a strip that is
        // no longer on screen.
        if (this._filter === HRA_PLAYLISTS_PILL[0]
            && this._playlistKind === kind && !this._playlistGroup && groups.length) {
            this._playlistGroup = groups[0].title;
            this._load();
        }
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
        if (!this._isHighresaudio) return;
        this._hraCategories = cats;
        this._openFirstEntry(HRA_CATEGORIES_PILL[0], '_category', this._categoryPills);
    }

    /**
     * @private Choose a shelf's first entry once its list has landed, if that shelf is
     * on screen with nothing chosen. The strip is filled asynchronously, so the reader
     * can be standing in front of it before there is anything to pick — and without
     * this the grid would stay empty until they tapped, on a shelf that has no
     * "everything" view to fall back on.
     *
     * @param {string} filter - The shelf this list belongs to.
     * @param {'_category'|'_label'} prop - Where the choice is kept.
     * @param {Array<[string, string]>} pills - The strip, already ordered.
     */
    _openFirstEntry(filter, prop, pills) {
        if (this._filter !== filter || this[prop] || !pills.length) return;
        this[prop] = pills[0][0];
        this._load();
    }

    /**
     * @private Read whether the account holds a subscription. The absent-means-
     * subscribed contract lives in {@link hraHasSubscription}, not here.
     */
    async _loadHraConnection() {
        const conn = await getHraConnection();
        if (this._isHighresaudio) this._hraSubscribed = hraHasSubscription(conn);
    }

    /**
     * @private Where a fresh HRA browse lands: its purchases when the account
     * cannot stream the catalogue, the favourites otherwise. The one home of that
     * decision — `updated()` uses it with the last known subscription state, and
     * `_load()` re-applies it once the connection has actually answered.
     * @returns {string}
     */
    get _hraLandingFilter() {
        return this._hraSubscribed ? HRA_FAVORITES_PILL[0] : HRA_VAULT_PILL[0];
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
        // Every load opens a new generation. A page requested under the previous sort can
        // still be in flight — switching pill now reloads on MPD too, which it did not
        // before — and it would append onto the fresh list, mixing two orders and pushing
        // _offset past albums nobody ever fetched. The token is checked after each await,
        // where the result comes back, not before it is asked for.
        //
        // Taken BEFORE the connection await below, not after: taken late, a
        // superseded HRA load resumed on a source that had already rendered, wrote
        // its filter, blanked the fresh grid with a newer token and re-fetched under
        // the wrong sort. Everything an older generation does past its await is now
        // refused, connection included.
        const token = ++this._loadToken;
        if (this._isHighresaudio) {
            // Awaited, unlike the two lists below: it decides which pills exist at
            // all, and which one a fresh source lands on. An account without a
            // subscription must land on its purchases, not on a Favorites request
            // that HRA refuses — and it must never ask for the shelves or the tree.
            await this._loadHraConnection();
            if (token !== this._loadToken) return;   // superseded while we waited
            if (!this._hraSubscribed) {
                this._filter = this._hraLandingFilter;
            } else {
                // Each shelf's list is fetched only while that shelf is open — the
                // filter bar no longer holds any of them, so a browse landing on
                // Favorites has no use for the fourteen categories or the seven
                // labels. The condition also repairs a list that failed to arrive:
                // the strip cannot ask again once its shelf is the chosen one
                // (_setFilter returns early), so Refresh is what retries.
                if (this._filter === HRA_CATEGORIES_PILL[0] && !this._hraCategories.length) {
                    this._loadHraCategories();
                }
                if (this._filter === HRA_LABELS_PILL[0] && !this._hraLabels.length) {
                    this._loadHraLabels();
                }
                if (this._filter === HRA_GENRES_PILL[0] && !this._hraGenres.length) {
                    this._loadHraGenres();
                }
                if (this._showsPlaylistGroups
                    && !(this._hraPlaylistGroups[this._playlistKind] ?? []).length) {
                    this._loadHraPlaylistGroups(this._playlistKind);
                }
            }
        }
        this._detachObserver();
        this._albums      = [];
        this._offset      = 0;
        this._hasMore     = false;
        this._loadingMore = false;   // a stale in-flight page must not hold the gate shut
        // The ★ Set is the account's too: for a known purchases-only account the
        // request is refused upstream and never cached, so it would be re-sent, and
        // re-refused, on every single load.
        if (this._isStreaming && !(this._isHighresaudio && !this._hraSubscribed)) {
            this._fav.load(this.sourceId);   // non-blocking — star state fills in
        }
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
        if (this._filter === HRA_VAULT_PILL[0]) {
            return apiGet(`/library/highresaudio-vault?${params}`);
        }
        if (this._filter === HRA_CHARTS_PILL[0]) {
            return apiGet(`/library/highresaudio-charts?${params}`);
        }
        if (this._filter === HRA_PLAYLISTS_PILL[0]) {
            if (this._showsPlaylistGroups) {
                // Nothing to ask for until a genre or a theme is picked — the strip
                // below is the choice, as it is in the genres.
                if (!this._playlistGroup) return [];
                // A grouping browses the editorial tree; it is not a third tree.
                params.set('type', HRA_PLAYLIST_EDITORIAL);
                params.set('group_type', this._playlistKind);
                params.set('group', this._playlistGroup);
                return apiGet(`/library/highresaudio-playlists?${params}`);
            }
            params.set('type', this._playlistKind);
            // Only the editorial tree has shelves; the account's own playlists carry
            // no category, and the core ignores the parameter there anyway.
            if (this._showsEditorialShelves && this._playlistCategory) {
                params.set('category', this._playlistCategory);
            }
            return apiGet(`/library/highresaudio-playlists?${params}`);
        }
        if (this._filter === HRA_CATEGORIES_PILL[0]) {
            // Nothing until the list has landed and its first entry has been chosen.
            if (!this._category) return [];
            // Addressed by its title — including the four HRA publishes in German,
            // which the core relabels for display but still keys on.
            params.set('category', this._category);
            return apiGet(`/library/highresaudio-category?${params}`);
        }
        if (this._filter === HRA_LABELS_PILL[0]) {
            if (!this._label) return [];
            params.set('label', this._label);
            return apiGet(`/library/highresaudio-label?${params}`);
        }
        if (this._filter === HRA_GENRES_PILL[0]) {
            // Nothing to show until a genre is picked: the strip below is the choice.
            if (!this._genre) return [];
            params.set('genre', this._genre);
            return apiGet(`/library/highresaudio-genre?${params}`);
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

    /**
     * @returns {string} The glyph shown behind a missing cover. One value for the card
     * and the row: the same coverless playlist appears in both — the grid on top, the
     * list below — so two answers would put a disc and a list side by side in one
     * viewport for one item.
     */
    get _playlistFallback() { return this._showsPlaylists ? 'list' : 'album'; }

    /**
     * @returns {boolean} Whether the artwork on screen is a 2:1 banner rather than a
     * square cover. True only of HIGHRESAUDIO's editorial selections: their covers are
     * teasers, measured at 410 × 205 on 32 taken across the whole catalogue, and a square
     * cell showed the middle half of each. Deliberately NOT extended to:
     * — Qobuz and Tidal playlists, whose covers are square;
     * — the account's own HRA playlists, which carry whatever artwork the account gave
     *   them and have no shape we have measured.
     * Read by the card and the list row from this one getter, for the reason
     * `_playlistFallback` above exists: the two are shown in the same viewport, so two
     * answers would put a banner beside a crop of it.
     */
    get _bannerCovers() { return this._showsEditorialPlaylists; }

    /**
     * @returns {boolean} Whether the grid on screen holds playlists rather than albums.
     * Every streaming service maps its playlists onto the album model so one grid
     * renders both — which is why, until this was read at render time, nothing on a
     * card told a playlist from an album. HIGHRESAUDIO's audit named that first.
     */
    get _showsPlaylists() {
        const TIDAL_PLAYLIST_FILTERS = ['playlists', 'editorial', 'charts'];
        return (this._isQobuz && this._filter === 'playlists')
            || (this._isTidal && TIDAL_PLAYLIST_FILTERS.includes(this._filter))
            // The id the core listed already names its family ('mine:5549'), so it
            // travels back untouched — the interface never builds one.
            || (this._isHighresaudio && this._filter === HRA_PLAYLISTS_PILL[0]);
    }

    _albumOpts(album, action) {
        return {
            sourceId:  this.sourceId,
            zoneId:    this.zoneId,
            itemId:    album.id,
            itemType:  this._showsPlaylists ? 'playlist' : 'album',
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
        // Categories and Labels open on their first entry rather than on an empty grid:
        // HRA serves no "everything" view of either, so asking the reader to choose
        // before showing anything would make the shelf a dead end. When the list has
        // not arrived yet, its loader makes that choice as it lands. The genres are the
        // exception, and were already: their strip IS the choice.
        //
        // Only when nothing is chosen yet, though — a shelf reopened keeps where its
        // reader was, the way Playlists always has (leaving it and coming back finds
        // the same tree and shelf). Resetting here made the two halves of one bar
        // remember differently for the same gesture.
        if (f === HRA_CATEGORIES_PILL[0]) {
            if (!this._category) this._category = this._categoryPills[0]?.[0] ?? '';
            if (!this._hraCategories.length) this._loadHraCategories();
        }
        if (f === HRA_LABELS_PILL[0]) {
            if (!this._label) this._label = this._labelPills[0]?.[0] ?? '';
            if (!this._hraLabels.length) this._loadHraLabels();
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
                        fallback=${this._playlistFallback}
                        ?wide=${this._bannerCovers}
                        size="120"
                    ></ag-library-cover>
                    <ag-library-add-btn
                        variant="card"
                        @click=${(e) => { e.stopPropagation(); this._addAlbumToQueue(album); }}
                    ></ag-library-add-btn>
                    ${this._showsFavorites ? html`
                        <ag-library-fav-btn
                            variant="card"
                            ?favorite=${this._fav.has(album.id)}
                            @fav-toggle=${(e) => this._fav.toggle(this.sourceId, album.id, e.detail.favorite)}
                        ></ag-library-fav-btn>
                    ` : nothing}
                </div>
                <div class="lib-ac-t">${album.title}</div>
                <div class="lib-ac-a">${album.artist ?? ''}</div>
                ${this._showsPlaylists
                    // The slot an album gives its year, a playlist gives its kind:
                    // the one word that keeps the two apart on an otherwise identical
                    // card. A playlist has no year, so the slot is never contested.
                    ? html`<div class="lib-ac-fmt">${PLAYLIST_TAG}</div>`
                    : album.year ? html`<div class="lib-ac-fmt">${album.year}</div>` : nothing}
            </div>
        `;
    }

    _renderListRow(album) {
        const byline = album.artist ?? '';
        return html`
            <ag-library-list-row
                cover=${coverUrl(album.cover_token)}
                fallback=${this._playlistFallback}
                ?wide=${this._bannerCovers}
                title=${album.title}
                subtitle=${this._showsPlaylists
                    ? (byline ? `${PLAYLIST_TAG} · ${byline}` : PLAYLIST_TAG)
                    : byline}
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
            // The flag is a plain boolean: hraHasSubscription() already folded
            // "unknown" to true at the write, so only a connection that SAID
            // no subscription narrows the bar.
            if (!this._hraSubscribed) return [HRA_VAULT_PILL];
            // Seven, fixed: what each shelf holds is listed on the strip below it. The
            // fourteen shop categories used to sit on this very bar, which is what made
            // it eighteen pills long and unreadable — HIGHRESAUDIO's own remark.
            return [
                HRA_FAVORITES_PILL,
                HRA_VAULT_PILL,
                HRA_CATEGORIES_PILL,
                HRA_CHARTS_PILL,
                HRA_PLAYLISTS_PILL,
                HRA_LABELS_PILL,
                HRA_GENRES_PILL,
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
        // Which of the two trees is on screen, rather than the bare word "Playlists"
        // that the pill already shows just above. HIGHRESAUDIO only: Qobuz and Tidal
        // use that very filter value for their own playlists, and without this guard
        // their grid was titled "Editorial playlists" too.
        if (this._isHighresaudio && this._filter === HRA_PLAYLISTS_PILL[0]) {
            // A chosen shelf names the grid — "Popular", not "Editorial playlists",
            // which the strip above already says. Same reasoning as a genre naming
            // its own grid rather than repeating the word "Genres".
            if (this._showsEditorialShelves && this._playlistCategory) {
                return this._playlistCategory;
            }
            // Same for a grouping: "Blues" says more than "Playlists by genre", which
            // the strip above already says.
            if (this._showsPlaylistGroups && this._playlistGroup) return this._playlistGroup;
            const kind = HRA_PLAYLIST_KINDS.find(([k]) => k === this._playlistKind);
            return kind ? kind[2] : HRA_PLAYLISTS_PILL[1];
        }
        // Same again for the two shelves whose strip is a list of names: the chosen
        // entry names the grid, not the shelf the reader can already see is open.
        if (this._isHighresaudio && this._filter === HRA_CATEGORIES_PILL[0] && this._category) {
            const entry = this._categoryPills.find(([t]) => t === this._category);
            return entry ? entry[1] : HRA_CATEGORIES_PILL[1];
        }
        if (this._isHighresaudio && this._filter === HRA_LABELS_PILL[0] && this._label) {
            return this._label;
        }
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
        // Named after the strip it moves: several bars can be on screen together, and
        // a reader hearing "More filters" twice has no way to tell them apart. The
        // name comes from the strip itself rather than a ternary — that one already
        // mislabelled the playlists strip the day it was added.
        const what = strip;
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
     * @private The categories strip, under the Categories shelf. HIGHRESAUDIO serves no
     * "every category" view, so the shelf opens on its first entry rather than on an
     * empty grid — see {@link _openFirstEntry}.
     */
    _renderCategories() {
        if (!this._isHighresaudio || this._filter !== HRA_CATEGORIES_PILL[0]) return nothing;
        return this._renderStrip({
            strip: 'entries',
            edges: this._entryEdges,
            pills: this._categoryPills,
            active: this._category,
            pick: (title) => this._setEntry('_category', title),
        });
    }

    /** @private The labels strip, under the Labels shelf. */
    _renderLabels() {
        if (!this._isHighresaudio || this._filter !== HRA_LABELS_PILL[0]) return nothing;
        return this._renderStrip({
            strip: 'entries',
            edges: this._entryEdges,
            pills: this._labelPills,
            active: this._label,
            pick: (title) => this._setEntry('_label', title),
        });
    }

    /**
     * @private The shop categories as a strip, in the order HIGHRESAUDIO asked for:
     * their six named first, then everything else they publish. Nothing is dropped —
     * three of the fourteen are absent from their own plan and all three serve real
     * albums, so hiding them would put catalogue out of reach.
     * @returns {Array<[string, string]>}
     */
    get _categoryPills() {
        return orderByTitle(this._hraCategories, HRA_CATEGORY_ORDER)
            .map((c) => [c.title, c.label]);
    }

    /**
     * @private The record labels as a strip, in the order HIGHRESAUDIO asked for.
     * @returns {Array<[string, string]>}
     */
    get _labelPills() {
        return orderByTitle(this._hraLabels, HRA_LABEL_ORDER).map((l) => [l.title, l.label]);
    }

    /**
     * @private Pick one entry of a shelf's strip.
     * @param {'_category'|'_label'|'_playlistGroup'} prop - Where the choice is kept.
     * @param {string} value - The entry's addressing title.
     */
    _setEntry(prop, value) {
        if (this[prop] === value) return;   // re-tapping the open entry costs nothing
        this[prop] = value;
        this._load();
    }

    /**
     * @private The playlist strip: which of HRA's trees is on screen, and which of
     * their two groupings of the editorial one. No drill-down — the first two fill the
     * grid straight away; the last two open a strip of their own below.
     */
    _renderPlaylistKinds() {
        if (!this._isHighresaudio || this._filter !== HRA_PLAYLISTS_PILL[0]) return nothing;
        return this._renderStrip({
            strip: 'playlists',
            edges: this._playlistEdges,
            pills: HRA_PLAYLIST_KINDS,
            active: this._playlistKind,
            pick: (kind) => this._setPlaylistKind(kind),
        });
    }

    /** @returns {boolean} Whether HRA's editorial tree — the one with shelves — is up. */
    get _showsEditorialShelves() {
        return this._isHighresaudio
            && this._filter === HRA_PLAYLISTS_PILL[0]
            && this._playlistKind === HRA_PLAYLIST_EDITORIAL;
    }

    /**
     * @returns {boolean} Whether HRA's own selections are on screen, by whichever route
     * — the shelves, or one of their two groupings. What they have in common is the
     * artwork: those are the 2:1 teasers, and the account's own playlists are not.
     */
    get _showsEditorialPlaylists() {
        return this._showsEditorialShelves || this._showsPlaylistGroups;
    }

    /**
     * @returns {string} The word for the grouping on screen, taken from the strip's own
     * label rather than built from the state key. `genre` and `theme` happen to be
     * English words, which is the only reason the key read as prose; a key HRA words
     * differently one day would have been printed raw at the reader.
     */
    get _playlistKindLabel() {
        const kind = HRA_PLAYLIST_KINDS.find(([k]) => k === this._playlistKind);
        return (kind ? kind[1] : this._playlistKind).toLowerCase();
    }

    /** @returns {boolean} Whether a playlist grouping — genre or theme — is up. */
    get _showsPlaylistGroups() {
        return this._isHighresaudio
            && this._filter === HRA_PLAYLISTS_PILL[0]
            && HRA_PLAYLIST_GROUP_KINDS.has(this._playlistKind);
    }

    /**
     * @private The grouping strip: HRA's 9 playlist genres or its 10 themes. It takes
     * the place the shelves hold over the editorial tree — only one of the two can be
     * up — so it shares their controller and their slot.
     *
     * There is no "All" here, unlike the shelves: HRA publishes no unfiltered view of a
     * grouping, and the whole tree is one tap away under Editorial.
     */
    _renderPlaylistGroups() {
        if (!this._showsPlaylistGroups) return nothing;
        return this._renderStrip({
            strip: 'shelves',
            edges: this._shelfEdges,
            pills: (this._hraPlaylistGroups[this._playlistKind] ?? [])
                .map((g) => [g.title, g.label]),
            active: this._playlistGroup,
            pick: (group) => this._setEntry('_playlistGroup', group),
        });
    }

    /**
     * @private The shelf strip, under the two trees and only over the editorial one:
     * 1762 selections in one undifferentiated pile is not a shelf, it is a heap. It
     * sits below rather than replacing the trees, so "Mine" stays one tap away — and
     * it opens on "All", so the grid is already full before anything is chosen.
     */
    _renderPlaylistCategories() {
        if (!this._showsEditorialShelves) return nothing;
        return this._renderStrip({
            strip: 'shelves',
            edges: this._shelfEdges,
            pills: HRA_PLAYLIST_CATEGORIES,
            active: this._playlistCategory,
            pick: (cat) => this._setPlaylistCategory(cat),
        });
    }

    /**
     * @private Switch between HRA's two playlist trees. Leaving the editorial one
     * takes its shelf with it: coming back to a narrowed tree with no strip on
     * screen to widen it is a dead end.
     * @param {string} kind
     */
    _setPlaylistKind(kind) {
        if (kind === this._playlistKind) return;
        this._playlistKind = kind;
        this._playlistCategory = HRA_PLAYLIST_ALL;
        // A grouping opens on its first entry, as the categories and labels do: HRA
        // serves no unfiltered view of one, so an empty grid would be all there is
        // until the reader taps. Its list is fetched on the first visit only.
        this._playlistGroup = '';
        if (HRA_PLAYLIST_GROUP_KINDS.has(kind)) {
            const groups = this._hraPlaylistGroups[kind] ?? [];
            if (groups.length) this._playlistGroup = groups[0].title;
            else this._loadHraPlaylistGroups(kind);
        }
        this._load();
    }

    /**
     * @private Narrow the editorial tree to one HRA shelf, or widen it back with ''.
     * @param {string} category
     */
    _setPlaylistCategory(category) {
        if (category === this._playlistCategory) return;
        this._playlistCategory = category;
        this._load();
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
        // Same state, one strip lower: a grouping has no unfiltered view either, and
        // its list can still be in flight.
        const awaitingGroup = this._showsPlaylistGroups && !this._playlistGroup;
        // Categories and Labels between the tap and their list landing: no entry is
        // chosen yet, so the album fetch answered [] without asking anyone — but
        // "No albums found" there is a false statement about a request still in
        // flight (review). It reads as Loading because that is what is happening;
        // if the list never lands, the header's Refresh below is the way to retry.
        const awaitingEntry =
            (this._filter === HRA_CATEGORIES_PILL[0] && !this._category)
            || (this._filter === HRA_LABELS_PILL[0] && !this._label);

        return html`
            ${this._renderFilters()}
            ${this._renderCategories()}
            ${this._renderLabels()}
            ${this._renderGenres()}
            ${this._renderPlaylistKinds()}
            ${this._renderPlaylistCategories()}
            ${this._renderPlaylistGroups()}

            ${_error ? html`<div class="lib-empty">Error: ${_error}</div>`
              : _loading ? html`<div class="lib-loading">Loading…</div>`
              : awaitingGenre ? html`<div class="lib-empty">Choose a genre</div>`
              : awaitingGroup ? html`<div class="lib-empty">Choose a ${this._playlistKindLabel}</div>`
              : html`
                <div class="lib-section-hd">
                    <span class="lib-sh-t">${this._sectionLabel}</span>
                    <span class="lib-sh-more" @click=${() => this._load()}>Refresh</span>
                </div>
                ${recent.length > 0 ? html`
                    <div class="lib-album-row">
                        ${recent.map(a => this._renderAlbumCard(a))}
                    </div>
                ` : html`
                    <div class="lib-empty">${awaitingEntry ? 'Loading…' : 'No albums found'}</div>
                `}

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
