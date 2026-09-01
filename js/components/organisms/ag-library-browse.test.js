/**
 * Unit tests for ag-library-browse.js — the artist drill-down fetch path.
 * Logic-only (no DOM mount): lit and the component's imports are mocked so the
 * class imports cleanly, then _fetchPage / _sectionLabel are exercised on a bare
 * instance. Artist mode must bypass the per-source pill routing and hit
 * /library/albums?artist_id=… for every source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    // `svg` as well: the component now reads ROON_IDS from library-constants.js, which
    // pulls ag-icons.js into this graph, and the icons are built with the svg tag.
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
const apiGetMock = vi.fn();
vi.mock('../../api.js', () => ({ apiGet: (...args) => apiGetMock(...args) }));
vi.mock('../utils-lit.js', () => ({
    coverUrl: () => '',
    loadWithState: vi.fn(),
    svgIcon: (icon) => ({ strings: ['<svg>'], values: [icon] }),
}));
vi.mock('../../library-api.js', () => ({ queueItem: vi.fn(), queueWithFeedback: vi.fn() }));
const getHraCategoriesMock = vi.fn();
const getHraGenresMock = vi.fn();
const getHraConnectionMock = vi.fn();
const getHraLabelsMock = vi.fn();
const getHraPlaylistGroupsMock = vi.fn();
const getQobuzShelvesMock = vi.fn();
const getQobuzGenresMock = vi.fn();
const getTidalShelvesMock = vi.fn();
const getTidalGenresMock = vi.fn();
const getTidalMoodsMock = vi.fn();
const getTidalExploreMock = vi.fn();
const getTidalPageMock = vi.fn();
vi.mock('../../library-store.js', () => ({
    getFavoriteAlbumIds: vi.fn().mockResolvedValue(new Set()),
    setAlbumFavorited: vi.fn(),
    subscribeFavorites: vi.fn(() => () => {}),
    getHraCategories: (...args) => getHraCategoriesMock(...args),
    getHraGenres: (...args) => getHraGenresMock(...args),
    getHraConnection: (...args) => getHraConnectionMock(...args),
    getHraLabels: (...args) => getHraLabelsMock(...args),
    getHraPlaylistGroups: (...args) => getHraPlaylistGroupsMock(...args),
    getQobuzShelves: (...args) => getQobuzShelvesMock(...args),
    getQobuzGenres: (...args) => getQobuzGenresMock(...args),
    getTidalShelves: (...args) => getTidalShelvesMock(...args),
    getTidalGenres: (...args) => getTidalGenresMock(...args),
    getTidalMoods: (...args) => getTidalMoodsMock(...args),
    getTidalExplore: (...args) => getTidalExploreMock(...args),
    getTidalPage: (...args) => getTidalPageMock(...args),
    // The real predicate, restated: it is the contract under test here (absent
    // means subscribed), and the store's own tests pin the original.
    hraHasSubscription: (conn) => conn?.has_subscription !== false,
}));
vi.mock('../../ui-helpers.js', () => ({ showToast: vi.fn() }));
vi.mock('../atoms/ag-library-cover.js', () => ({}));
vi.mock('../atoms/ag-library-add-btn.js', () => ({}));
vi.mock('../atoms/ag-library-fav-btn.js', () => ({}));
vi.mock('../molecules/ag-library-list-row.js', () => ({}));

import { AgLibraryBrowse } from './ag-library-browse.js';

/**
 * Flatten a lit template to the text it would render — STRINGS INTERLEAVED WITH VALUES.
 *
 * Reading `tpl.values` alone is what makes a template assertion decorative: a literal
 * attribute (`fallback="album"`) lives in `strings`, so a test looking for it in
 * `values` passes whether the code interpolates or hardcodes. Verified by reverting
 * the fix and watching the assertion hold.
 */
const text = (tpl) => {
    if (!tpl || typeof tpl !== 'object') return String(tpl ?? '');
    if (Array.isArray(tpl)) return tpl.map(text).join('');
    return (tpl.strings ?? []).reduce((out, s, i) => out + s + text(tpl.values?.[i]), '');
};

function makeEl(overrides = {}) {
    return Object.assign(Object.create(AgLibraryBrowse.prototype), {
        sourceId: 'src_qobuz', zoneId: '', artistId: '', artistName: '',
        // What the real constructor guarantees and _load() now relies on BEFORE its
        // first await: a numeric generation counter (++undefined is NaN, and
        // NaN !== NaN reads as "superseded" — every load would return early), and
        // the subscription flag already folded to a boolean.
        _loadToken: 0,
        _hraSubscribed: true,
        ...overrides,
    });
}

describe('ag-library-browse — artist drill-down', () => {
    beforeEach(() => apiGetMock.mockReset());

    it('_fetchPage hits /library/albums?artist_id=… when an artist is set', async () => {
        apiGetMock.mockResolvedValue([]);
        await makeEl({ sourceId: 'src_qobuz', artistId: '12345' })._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/albums?');
        expect(url).toContain('source_id=src_qobuz');
        expect(url).toContain('artist_id=12345');
    });

    it('_fetchPage bypasses the streaming pill routing in artist mode (Tidal)', async () => {
        apiGetMock.mockResolvedValue([]);
        await makeEl({ sourceId: 'src_tidal', artistId: '999' })._fetchPage(0);
        // Generic albums endpoint, not the Tidal favorites/featured routing.
        expect(apiGetMock.mock.calls[0][0]).toContain('artist_id=999');
    });

    it('_fetchPage carries the name-as-id for HRA (name-based backend)', async () => {
        apiGetMock.mockResolvedValue([]);
        await makeEl({ sourceId: 'src_highresaudio', artistId: 'Miles Davis' })._fetchPage(0);
        // URLSearchParams encodes the space as '+'; the name round-trips as artist_id.
        expect(apiGetMock.mock.calls[0][0]).toContain('artist_id=Miles+Davis');
    });

    it('_sectionLabel shows "Albums by <name>" in artist mode', () => {
        expect(makeEl({ artistId: 'Miles Davis', artistName: 'Miles Davis' })._sectionLabel)
            .toBe('Albums by Miles Davis');
    });

    it('_sectionLabel falls back to "artist" when the name is missing', () => {
        expect(makeEl({ artistId: 'x', artistName: '' })._sectionLabel).toBe('Albums by artist');
    });
});

describe('ag-library-browse — HIGHRESAUDIO category pills', () => {
    // What the core answers on /library/highresaudio-categories: HRA's own order, and a
    // German title it relabels for display while keeping it as the addressing key.
    const CATEGORIES = [
        { title: 'Editors Choice', label: 'Editors Choice' },
        { title: 'Hörtipps', label: 'Listening Tips' },
    ];

    /** An instance with the categories already loaded. */
    function hraEl() {
        return makeEl({ sourceId: 'src_highresaudio', _hraCategories: CATEGORIES });
    }

    beforeEach(() => apiGetMock.mockReset());

    it('keeps the categories off the filter bar, which is the seven shelves and fixed', () => {
        // The fourteen categories used to sit on this bar, which is what made it
        // eighteen pills long — the remark that started the restructure. They live on
        // the strip below their own shelf now, so the bar does not grow with them.
        expect(hraEl()._pills.map(([, label]) => label)).toEqual(
            ['Favorites', 'Vault', 'Categories', 'Charts', 'Playlists', 'Labels', 'Genres'],
        );
    });

    it('is the same bar before the categories have arrived', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] })._pills)
            .toEqual(hraEl()._pills);
    });

    it('shows the label but keys the strip on the title HRA answers with', () => {
        expect(hraEl()._categoryPills).toContainEqual(['Hörtipps', 'Listening Tips']);
    });

    it('leads the strip with the entries HIGHRESAUDIO asked for, keeping the rest behind', () => {
        // Their six named first, in their order; everything else they publish follows,
        // in theirs. Nothing is dropped: the three absent from their own plan all serve
        // real albums, and hiding them would put catalogue out of reach.
        const el = makeEl({
            sourceId: 'src_highresaudio',
            _hraCategories: [
                { title: 'Bestsellers', label: 'Bestsellers' },
                { title: 'Editors Choice', label: 'Editors Choice' },
                { title: 'UNAMAS', label: 'UNAMAS' },
                { title: 'Neuheiten', label: 'New Release' },
            ],
        });
        expect(el._categoryPills.map(([, label]) => label))
            .toEqual(['New Release', 'Editors Choice', 'Bestsellers', 'UNAMAS']);
    });

    it('_fetchPage asks for the category by title', async () => {
        apiGetMock.mockResolvedValue([]);
        const el = hraEl();
        el._filter = 'categories';
        el._category = 'Hörtipps';
        await el._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/highresaudio-category?');
        expect(url).toContain(`category=${encodeURIComponent('Hörtipps')}`);
    });

    it('_fetchPage asks for nothing while the categories are still in flight', async () => {
        // The shelf has no "everything" view to fall back on, so an unchosen category
        // must not become a request without one — which the core would answer with the
        // whole library.
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] });
        el._filter = 'categories';

        expect(await el._fetchPage(0)).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('_fetchPage still routes the Favorites pill to the generic album list', async () => {
        apiGetMock.mockResolvedValue([]);
        const el = hraEl();
        el._filter = 'favorites';
        await el._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/albums?');
        expect(url).toContain('source_id=src_highresaudio');
    });

    it('_sectionLabel titles the grid with the displayed label, not the German title', () => {
        const el = hraEl();
        el._filter = 'categories';
        el._category = 'Hörtipps';
        expect(el._sectionLabel).toBe('Listening Tips');
    });

    it('takes the list from the store, which owns the caching', async () => {
        getHraCategoriesMock.mockResolvedValue(CATEGORIES);
        const el = makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] });
        await el._loadHraCategories();
        expect(el._hraCategories).toEqual(CATEGORIES);
    });

    it('a failed list leaves an empty strip, never a broken bar', async () => {
        getHraCategoriesMock.mockResolvedValue([]);
        const el = makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] });
        await el._loadHraCategories();
        expect(el._categoryPills).toEqual([]);
        expect(el._pills.map(([f]) => f)).toContain('categories');
    });

    it('asks again on every load while the list is missing — Refresh repairs the strip', async () => {
        // The categories used to be fetched on a source CHANGE only. A source restored
        // at boot changes once: if that one attempt failed (an HRA session still warming
        // up), nothing in the app could ask again short of switching source and back.
        getHraCategoriesMock.mockReset().mockResolvedValue([]);
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _filter: 'categories',
            _detachObserver() {}, _fav: { load() {} },
        });
        await el._load();
        await el._load();
        expect(getHraCategoriesMock).toHaveBeenCalledTimes(2);
    });

    it('does not fetch the categories on a browse that is not showing them', async () => {
        // The bar no longer holds them, so a browse landing on Favorites has no use for
        // the list — one request per browse that bought nothing (sobriety).
        getHraCategoriesMock.mockReset().mockResolvedValue([]);
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _filter: 'favorites',
            _detachObserver() {}, _fav: { load() {} },
        });
        await el._load();
        expect(getHraCategoriesMock).not.toHaveBeenCalled();
    });

    it('asks for the genre tree again on every load while it is missing', async () => {
        // The Genres pill cannot ask again once it is the chosen one — _setFilter
        // returns early on the same filter — so a tree that failed to arrive would
        // stay missing for good. Refresh reloads, and Refresh must repair it.
        getHraGenresMock.mockReset().mockResolvedValue([]);
        getHraCategoriesMock.mockResolvedValue([]);
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _genres: [],
            _filter: 'genres', _genre: null, _detachObserver() {}, _fav: { load() {} },
        });
        await el._load();
        await el._load();
        expect(getHraGenresMock).toHaveBeenCalledTimes(2);
    });

    it('does not fetch the genre tree while another pill is chosen', async () => {
        getHraGenresMock.mockReset().mockResolvedValue([]);
        getHraCategoriesMock.mockResolvedValue([]);
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _genres: [],
            _filter: 'favorites', _detachObserver() {}, _fav: { load() {} },
        });
        await el._load();
        expect(getHraGenresMock).not.toHaveBeenCalled();
    });

    it('stops asking once the list is there', async () => {
        getHraCategoriesMock.mockReset().mockResolvedValue(CATEGORIES);
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _hraCategories: CATEGORIES, _filter: 'favorites',
            _detachObserver() {}, _fav: { load() {} },
        });
        await el._load();
        expect(getHraCategoriesMock).not.toHaveBeenCalled();
    });
});


describe('ag-library-browse — HIGHRESAUDIO Vault', () => {
    // The purchases: a second tree with its own route, and the only thing an account
    // without a subscription may play. HRA signs such an account in all the same and
    // answers NO SUBSCRIPTION to everything else, so the bar must not offer the rest.
    const CATEGORIES = [{ title: 'Editors Choice', label: 'Editors Choice' }];

    /** An HRA instance ready for _load(): the collaborators _load touches, stubbed. */
    function loadable(overrides = {}) {
        return makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _genres: [],
            _filter: 'favorites', _detachObserver() {}, _fav: { load() {} }, ...overrides,
        });
    }

    beforeEach(() => {
        apiGetMock.mockReset().mockResolvedValue([]);
        getHraCategoriesMock.mockReset().mockResolvedValue(CATEGORIES);
        getHraConnectionMock.mockReset();
    });

    it('_fetchPage asks the Vault route, paged like the others', async () => {
        const el = makeEl({ sourceId: 'src_highresaudio', _filter: 'vault' });
        await el._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/highresaudio-vault?');
        expect(url).toContain('offset=0');
        expect(url).not.toContain('source_id');
    });

    it('a subscribed account sees the Vault beside Favorites, ahead of the shelves', async () => {
        getHraConnectionMock.mockResolvedValue({ connected: true, has_subscription: true });
        const el = loadable();
        await el._load();
        expect(el._pills.map(([f]) => f)).toEqual(
            ['favorites', 'vault', 'categories', 'charts', 'playlists', 'labels', 'genres']);
        expect(el._filter).toBe('favorites');
    });

    it('an account without a subscription gets the Vault alone, and lands on it', async () => {
        getHraConnectionMock.mockResolvedValue({ connected: true, has_subscription: false });
        const el = loadable();
        await el._load();
        expect(el._pills).toEqual([['vault', 'Vault']]);
        expect(el._filter).toBe('vault');
    });

    it('never asks for the shelves on an account that cannot play them', async () => {
        getHraConnectionMock.mockResolvedValue({ connected: true, has_subscription: false });
        await loadable()._load();
        expect(getHraCategoriesMock).not.toHaveBeenCalled();
    });

    it('reads the connection before fetching a page, so the first request is the right one', async () => {
        // Without the wait the fresh source would fire a Favorites request the account
        // cannot make, then correct itself. The order of the two calls is the proof.
        const order = [];
        getHraConnectionMock.mockImplementation(async () => {
            order.push('connection');
            return { connected: true, has_subscription: false };
        });
        const el = loadable({ _fetchPage: async () => { order.push('page'); return []; } });
        await el._load();
        expect(order[0]).toBe('connection');
    });

    it('an answer it cannot read is "subscribed" — the state every account had before the field', async () => {
        for (const answer of [null, undefined, { connected: true }]) {
            getHraConnectionMock.mockResolvedValue(answer);
            const el = loadable();
            await el._load();
            expect(el._hraSubscribed).toBe(true);
            expect(el._pills.map(([f]) => f)).toContain('favorites');
        }
    });

    it('a load superseded during the connection wait does not blank what its successor rendered', async () => {
        // The await put a resumption point before the state resets. Token taken
        // late, two quick loads — Refresh then a pill switch, say — ended with the
        // FIRST one resuming after the second had filled the grid, and wiping it:
        // its resets ran unconditionally, only its page fetch checked the token.
        let answerConnection;
        getHraConnectionMock.mockReturnValue(new Promise((r) => { answerConnection = r; }));
        const el = loadable();
        const staleLoad = el._load();                  // parked on the connection await
        // The successor has come and gone: newer generation, grid rendered.
        el._loadToken += 1;
        el._albums = [{ id: 'fresh' }];
        el._offset = 1;
        el._hasMore = true;
        answerConnection({ connected: true, has_subscription: true });
        await staleLoad;
        expect(el._albums).toEqual([{ id: 'fresh' }]); // not blanked by the loser
        expect(el._offset).toBe(1);
        expect(el._hasMore).toBe(true);
    });

    it('does not ask for the ★ Set of an account whose favourites are refused', async () => {
        // The request fails upstream and is never cached, so it would repeat on
        // every single load — the comment above the guard said "must never ask"
        // while the line below it asked anyway.
        const favLoad = vi.fn();
        getHraConnectionMock.mockResolvedValue({ connected: true, has_subscription: false });
        await loadable({ _fav: { load: favLoad } })._load();
        expect(favLoad).not.toHaveBeenCalled();
        getHraConnectionMock.mockResolvedValue({ connected: true, has_subscription: true });
        await loadable({ _fav: { load: favLoad } })._load();
        expect(favLoad).toHaveBeenCalledTimes(1);   // a subscribed account still gets it
    });

    it('offers no ★ on a purchase — a Vault id is not a catalogue id', () => {
        const el = makeEl({ sourceId: 'src_highresaudio', _filter: 'vault' });
        expect(el._showsFavorites).toBe(false);
        el._filter = 'favorites';
        expect(el._showsFavorites).toBe(true);
    });

    it('keeps the ★ on the other streaming sources', () => {
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'favorites' })._showsFavorites).toBe(true);
        expect(makeEl({ sourceId: 'src_mpd', _filter: 'all' })._showsFavorites).toBe(false);
    });

    it('titles the grid after the pill', () => {
        const el = makeEl({ sourceId: 'src_highresaudio', _filter: 'vault', _hraCategories: [] });
        expect(el._sectionLabel).toBe('Vault');
    });

    it('queues a purchase as an album, with the prefixed id exactly as listed', () => {
        const el = makeEl({ sourceId: 'src_highresaudio', _filter: 'vault' });
        const opts = el._albumOpts({ id: 'vault:alb_txn', title: 'Sampler' }, 'play');
        expect(opts.itemId).toBe('vault:alb_txn');
        expect(opts.itemType).toBe('album');
    });
});


describe('ag-library-browse — HIGHRESAUDIO genres', () => {
    // Two shelves sharing a title is the normal case, not an edge one: sixteen
    // sub-genres carry the name of a top-level genre, so the path is the key.
    const GENRES = [
        {
            title: 'Jazz',
            path: 'Jazz',
            subgenres: [
                { title: 'Bebop', path: 'Jazz/Bebop' },
                { title: 'Blues', path: 'Jazz/Blues' },
            ],
        },
        { title: 'Blues', path: 'Blues', subgenres: [] },
    ];

    function genreEl(over = {}) {
        return makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _genres: GENRES,
            _filter: 'genres', _genre: null, _detachObserver() {}, _fav: { load() {} },
            ...over,
        });
    }

    beforeEach(() => { apiGetMock.mockReset(); getHraGenresMock.mockReset(); });

    it('offers the genres while none is chosen', () => {
        expect(genreEl()._genrePills).toEqual([['Jazz', 'Jazz'], ['Blues', 'Blues']]);
    });

    it('offers the genre as "All", then its sub-genres', () => {
        // HRA gives two of its genres a sub-genre of the same name, which used to put
        // two identical buttons side by side (Soundtrack, Soundtrack).
        expect(genreEl({ _genre: 'Jazz' })._genrePills)
            .toEqual([['Jazz', 'All'], ['Jazz/Bebop', 'Bebop'], ['Jazz/Blues', 'Blues']]);
    });

    it('never repeats a label when a sub-genre carries its genre\'s name', () => {
        const labels = genreEl({ _genre: 'Jazz/Blues' })._genrePills.map(([, l]) => l);
        expect(new Set(labels).size).toBe(labels.length);
    });

    it('stays on the genre of the chosen sub-genre', () => {
        // Drilling down must not empty the strip: the way back up is on it.
        expect(genreEl({ _genre: 'Jazz/Bebop' })._genrePills.map(([p]) => p))
            .toEqual(['Jazz', 'Jazz/Bebop', 'Jazz/Blues']);
    });

    it('asks for the album grid by path, not by title', async () => {
        apiGetMock.mockResolvedValue([]);
        await genreEl({ _genre: 'Jazz/Blues' })._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/highresaudio-genre?');
        expect(url).toContain(`genre=${encodeURIComponent('Jazz/Blues')}`);
    });

    it('fetches nothing while no genre is chosen', async () => {
        expect(await genreEl()._fetchPage(0)).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('titles the grid with the whole path, so "All" still says which genre', () => {
        expect(genreEl({ _genre: 'Jazz/Bebop' })._sectionLabel).toBe('Jazz · Bebop');
        expect(genreEl({ _genre: 'Jazz' })._sectionLabel).toBe('Jazz');
        expect(genreEl()._sectionLabel).toBe('Genres');
    });

    it('fetches the tree on the first visit only', async () => {
        getHraGenresMock.mockResolvedValue(GENRES);
        const el = genreEl({ _filter: 'favorites', _genres: [] });
        el._load = vi.fn();
        el._setFilter('genres');
        await Promise.resolve();
        expect(getHraGenresMock).toHaveBeenCalledTimes(1);

        const warm = genreEl({ _filter: 'favorites' });
        warm._load = vi.fn();
        warm._setFilter('genres');
        expect(getHraGenresMock).toHaveBeenCalledTimes(1);
    });

    it('returns to the list of genres when the pill is chosen again', () => {
        const el = genreEl({ _filter: 'favorites', _genre: 'Jazz/Bebop' });
        el._load = vi.fn();
        el._setFilter('genres');
        expect(el._genre).toBeNull();
    });
});


describe('ag-library-browse — HIGHRESAUDIO playlists', () => {
    // HRA keeps two playlist trees with independent id sequences, so the id carries
    // its own family and the interface never builds one.
    function plEl(over = {}) {
        return makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _genres: [],
            _filter: 'playlists', _playlistKind: 'editorial',
            _detachObserver() {}, _fav: { load() {} }, ...over,
        });
    }

    beforeEach(() => apiGetMock.mockReset().mockResolvedValue([]));

    it('offers Playlists among the seven shelves', () => {
        expect(plEl()._pills.map(([f]) => f))
            .toEqual(['favorites', 'vault', 'categories', 'charts', 'playlists',
                      'labels', 'genres']);
    });

    it('asks for the tree that is on screen', async () => {
        await plEl()._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).toContain('/library/highresaudio-playlists?');
        expect(apiGetMock.mock.calls[0][0]).toContain('type=editorial');
    });

    it('switching tree reloads with the other one', async () => {
        const el = plEl();
        el._load = vi.fn();
        el._setPlaylistKind('mine');
        expect(el._playlistKind).toBe('mine');
        expect(el._load).toHaveBeenCalledTimes(1);
        await el._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).toContain('type=mine');
    });

    it('queues a playlist as a playlist, with the id exactly as listed', () => {
        const opts = plEl({ _playlistKind: 'mine' })
            ._albumOpts({ id: 'mine:5549', title: 'Audiogravity test' }, 'play');
        expect(opts.itemType).toBe('playlist');
        expect(opts.itemId).toBe('mine:5549');
    });

    it('an album on any other pill is still an album', () => {
        const opts = plEl({ _filter: 'favorites' })._albumOpts({ id: 'alb1' }, 'play');
        expect(opts.itemType).toBe('album');
    });

    it('names the Tidal surface on screen, as the other two do', () => {
        // Tidal has three playlist surfaces on one strip — its editors' selections, the
        // account's own, and its charts — so the heading says which is up rather than
        // repeating the word the pill above already shows.
        const el = (kind) => makeEl({ sourceId: 'src_tidal', _filter: 'playlists',
                                      _playlistKind: kind })._sectionLabel;
        expect(el('mine')).toBe('My playlists');
        expect(el('editorial')).toBe('Editorial playlists');
        expect(el('charts')).toBe('Charts');
    });

    it('names the Qobuz tree on screen, as HRA does', () => {
        // Qobuz has the same two trees, so the heading says which one is up rather
        // than repeating the word the pill above already shows.
        const mine = makeEl({ sourceId: 'src_qobuz', _filter: 'playlists', _playlistKind: 'mine' });
        expect(mine._sectionLabel).toBe('My playlists');
        const editorial = makeEl({
            sourceId: 'src_qobuz', _filter: 'playlists', _playlistKind: 'editorial',
        });
        expect(editorial._sectionLabel).toBe('Editorial playlists');
    });

    it('forgets which tree was open, and which shelf, when the source changes', () => {
        const el = plEl({ _playlistKind: 'mine', _playlistCategory: 'Popular' });
        el._syncObserver = () => {};
        el._edges = { attach() {}, measure() {} };
        el._genreEdges = { attach() {}, measure() {} };
        el._playlistEdges = { attach() {}, measure() {} };
        el._shelfEdges = { attach() {}, measure() {} };
        el._entryEdges = { attach() {}, measure() {} };
        el.querySelector = () => null;
        el.updated(new Map([['sourceId', 'src_qobuz']]));
        expect(el._playlistKind).toBe('editorial');
        expect(el._playlistCategory).toBe('');
        expect(el._playlistGroup).toBe('');
        expect(el._category).toBe('');
        expect(el._label).toBe('');
    });

    it('titles the grid with the tree on screen', () => {
        // The heading is its own wording, not the pill label plus a word: the pill
        // reads "Mine", the shelf above the grid must read "My playlists".
        expect(plEl()._sectionLabel).toBe('Editorial playlists');
        expect(plEl({ _playlistKind: 'mine' })._sectionLabel).toBe('My playlists');
    });
});

describe('ag-library-browse — a playlist is told from an album', () => {
    // Every streaming service maps its playlists onto the album model, so one grid
    // renders both — and nothing on a card said which was which. HIGHRESAUDIO's
    // audit named it first: "it is very important that you differentiate".

    it('knows the playlist grids of all three services, and no other pill', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _filter: 'playlists' })._showsPlaylists).toBe(true);
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'playlists' })._showsPlaylists).toBe(true);
        expect(makeEl({ sourceId: 'src_tidal', _filter: 'playlists' })._showsPlaylists).toBe(true);
        // Moods hold playlists and never albums — Tidal says so itself.
        expect(makeEl({ sourceId: 'src_tidal', _filter: 'moods' })._showsPlaylists).toBe(true);
        expect(makeEl({ sourceId: 'src_highresaudio', _filter: 'favorites' })._showsPlaylists).toBe(false);
        expect(makeEl({ sourceId: 'src_highresaudio', _filter: 'vault' })._showsPlaylists).toBe(false);
        expect(makeEl({ sourceId: 'src_mpd', _filter: 'all' })._showsPlaylists).toBe(false);
    });

    it('tags a playlist card, in the slot an album gives its year', () => {
        const el = makeEl({ sourceId: 'src_highresaudio', _filter: 'playlists', _fav: { has: () => false } });
        const card = text(el._renderAlbumCard({ id: 'editorial:1', title: 'Montreux', artist: 'Jazz' }));
        expect(card).toContain('Playlist');
    });

    it('leaves an album card alone — its year, or nothing', () => {
        const el = makeEl({ sourceId: 'src_highresaudio', _filter: 'favorites', _fav: { has: () => false } });
        const card = text(el._renderAlbumCard({ id: 'alb1', title: 'Kind of Blue', year: 1959 }));
        expect(card).toContain('1959');
        expect(card).not.toContain('Playlist');
    });

    it('says it on a list row too, ahead of the byline', () => {
        const el = makeEl({ sourceId: 'src_highresaudio', _filter: 'playlists' });
        const row = el._renderListRow({ id: 'editorial:1', title: 'Montreux', artist: 'Editor’s Pick' });
        expect(row.values).toContain('Playlist · Editor’s Pick');
        expect(row.values).toContain('list');   // not the album glyph behind the cover
    });

    it('queues from the same answer it renders from', () => {
        const el = makeEl({ sourceId: 'src_tidal', _filter: 'playlists' });
        expect(el._albumOpts({ id: 'p1', title: 'x' }, 'play').itemType).toBe('playlist');
    });
});

describe('ag-library-browse — the ★ is offered only where the grid holds albums', () => {
    // The star writes the item id to the service's ALBUM favourites. On a playlist
    // grid it sent 'editorial:42' to HRA's My Album — an id that route has never
    // heard of. Same album/playlist conflation as the untagged card.
    it('is withheld on every playlist grid', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _filter: 'playlists' })._showsFavorites).toBe(false);
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'playlists' })._showsFavorites).toBe(false);
        expect(makeEl({ sourceId: 'src_tidal', _filter: 'playlists' })._showsFavorites).toBe(false);
        expect(makeEl({ sourceId: 'src_tidal', _filter: 'moods' })._showsFavorites).toBe(false);
    });

    it('is withheld on the Vault — a purchase id is not a catalogue id', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _filter: 'vault' })._showsFavorites).toBe(false);
    });

    it('stays on the album grids it was written for', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _filter: 'favorites' })._showsFavorites).toBe(true);
        // 'shelves' and 'genres', not the retired 'new-releases' pill: a filter the
        // Qobuz bar can no longer hold asserts nothing about the grids that exist.
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'shelves' })._showsFavorites).toBe(true);
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'genres' })._showsFavorites).toBe(true);
        expect(makeEl({ sourceId: 'src_mpd', _filter: 'all' })._showsFavorites).toBe(false);
    });

    it('shows one glyph for one coverless item, card and row alike', () => {
        // The grid on top and the list below render the SAME item in one viewport;
        // two answers put a disc beside a list. The card used to hardcode the disc.
        const pl = makeEl({ sourceId: 'src_highresaudio', _filter: 'playlists', _fav: { has: () => false } });
        const alb = makeEl({ sourceId: 'src_highresaudio', _filter: 'favorites', _fav: { has: () => false } });
        expect(pl._playlistFallback).toBe('list');
        expect(alb._playlistFallback).toBe('album');
        const item = { id: 'editorial:1', title: 'Montreux' };
        // Flattened, so a hardcoded attribute is seen: it would read fallback="album".
        expect(text(pl._renderAlbumCard(item))).toContain('fallback=list');
        expect(text(pl._renderListRow(item))).toContain('fallback=list');
        expect(text(alb._renderAlbumCard({ ...item, id: 'alb1' }))).toContain('fallback=album');
    });
});

describe('ag-library-browse — banner covers', () => {
    // HRA's editorial covers are teasers, 410 × 205 on all 32 sampled across their
    // catalogue (2026-08-30). A square cell cropped them to their middle half, which is
    // what Lothar reported. The same reasoning as the fallback glyph above: the card and
    // the row show the same item in one viewport, so they must agree.
    const el = (o = {}) => makeEl({
        sourceId: 'src_highresaudio', _filter: 'playlists', _playlistKind: 'editorial',
        _fav: { has: () => false }, ...o,
    });
    const item = { id: 'editorial:1845', title: 'Montreux Jazz Festival' };

    it('marks HRA editorial artwork as a banner, card and row alike', () => {
        const pl = el();
        expect(pl._bannerCovers).toBe(true);
        expect(text(pl._renderAlbumCard(item))).toContain('?wide=true');
        expect(text(pl._renderListRow(item))).toContain('?wide=true');
    });

    it("leaves the account's own HRA playlists square — their artwork has no measured shape", () => {
        const mine = el({ _playlistKind: 'mine' });
        expect(mine._bannerCovers).toBe(false);
        expect(text(mine._renderAlbumCard(item))).toContain('?wide=false');
        expect(text(mine._renderListRow(item))).toContain('?wide=false');
    });

    it('leaves Qobuz and Tidal playlists square — their covers are square', () => {
        expect(el({ sourceId: 'src_qobuz' })._bannerCovers).toBe(false);
        expect(el({ sourceId: 'src_tidal', _filter: 'editorial' })._bannerCovers).toBe(false);
    });

    it('leaves the HRA album grids square — only the playlists are banners', () => {
        expect(el({ _filter: 'favorites' })._bannerCovers).toBe(false);
        expect(el({ _filter: 'vault' })._bannerCovers).toBe(false);
    });
});

describe('ag-library-browse — HIGHRESAUDIO editorial shelves', () => {
    // 1762 editorial selections arrived as one undifferentiated pile. HRA files them
    // on four shelves via its own `category` field, filtered server-side.
    const shelfEl = (over = {}) => makeEl({
        sourceId: 'src_highresaudio', _filter: 'playlists',
        _playlistKind: 'editorial', _playlistCategory: '',
        // The real constructor gives every strip its own overflow controller; a bare
        // instance has none, and _renderStrip reads `.overflows` off it.
        _shelfEdges: { overflows: false, attach() {}, measure() {} },
        _detachObserver() {}, _fav: { load() {} }, ...over,
    });

    beforeEach(() => apiGetMock.mockReset().mockResolvedValue([]));

    it('offers All ahead of the four shelves — nothing can be hidden', () => {
        const el = shelfEl();
        expect(el._showsEditorialShelves).toBe(true);
        // "All" first and selected by default: fourteen selections carry no category,
        // so a bar of shelves alone would silently drop them.
        const strip = text(el._renderPlaylistCategories());
        for (const label of ['All', 'New Releases', 'Recommended', 'Popular', 'Moods']) {
            expect(strip).toContain(label);
        }
        expect(strip.indexOf('All')).toBeLessThan(strip.indexOf('New Releases'));
        expect(el._playlistCategory).toBe('');
    });

    it('asks HRA for the shelf rather than filtering 1762 here', async () => {
        const el = shelfEl({ _playlistCategory: 'Popular' });
        await el._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/highresaudio-playlists?');
        expect(url).toContain('type=editorial');
        expect(url).toContain('category=Popular');
    });

    it('sends no shelf on All, which is the only view holding the uncategorised', async () => {
        await shelfEl({ _playlistCategory: '' })._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).not.toContain('category=');
    });

    it('shows no shelf strip over the account\'s own tree, and asks for none', async () => {
        const el = shelfEl({ _playlistKind: 'mine', _playlistCategory: 'Popular' });
        expect(el._showsEditorialShelves).toBe(false);
        expect(el._renderPlaylistCategories()).toBe(null);   // `nothing` is mocked to null
        await el._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).not.toContain('category=');
    });

    it('shows no shelf strip on any other pill', () => {
        expect(shelfEl({ _filter: 'favorites' })._showsEditorialShelves).toBe(false);
        expect(shelfEl({ _filter: 'vault' })._showsEditorialShelves).toBe(false);
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'playlists' })._showsEditorialShelves).toBe(false);
    });

    it('leaving the editorial tree drops its shelf — a narrowed tree with no strip is a dead end', () => {
        const el = shelfEl({ _playlistCategory: 'Popular', _load() { this.loaded = true; } });
        el._setPlaylistKind('mine');
        expect(el._playlistCategory).toBe('');
        expect(el.loaded).toBe(true);
    });

    it('picking a shelf reloads; picking the one already open does not', () => {
        const el = shelfEl({ _load() { this.loads = (this.loads ?? 0) + 1; } });
        el._setPlaylistCategory('Moods');
        el._setPlaylistCategory('Moods');
        expect(el.loads).toBe(1);
        expect(el._playlistCategory).toBe('Moods');
    });

    it('the chosen shelf names the grid, and All gives the tree its name back', () => {
        expect(shelfEl({ _playlistCategory: 'Popular' })._sectionLabel).toBe('Popular');
        expect(shelfEl({ _playlistCategory: '' })._sectionLabel).toBe('Editorial playlists');
        expect(shelfEl({ _playlistKind: 'mine' })._sectionLabel).toBe('My playlists');
    });
});

describe('ag-library-browse — the Labels and Charts shelves', () => {
    // What the core answers on /library/highresaudio-labels: HRA's own order.
    const LABELS = [
        { title: 'ECM', label: 'ECM' },
        { title: '2L', label: '2L' },
        { title: 'audite', label: 'audite' },
    ];

    const el = (o = {}) => makeEl({ sourceId: 'src_highresaudio', _hraLabels: LABELS, ...o });

    beforeEach(() => {
        apiGetMock.mockReset().mockResolvedValue([]);
        getHraLabelsMock.mockReset().mockResolvedValue(LABELS);
    });

    it('leads the strip with the labels HIGHRESAUDIO asked for', () => {
        expect(el()._labelPills.map(([, label]) => label)).toEqual(['2L', 'audite', 'ECM']);
    });

    it('asks for one label by title', async () => {
        const it_ = el({ _filter: 'labels', _label: '2L' });
        await it_._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/highresaudio-label?');
        expect(url).toContain('label=2L');
    });

    it('asks for nothing while the labels are still in flight', async () => {
        const it_ = el({ _hraLabels: [], _filter: 'labels', _label: '' });
        expect(await it_._fetchPage(0)).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('opens on the first label once the list lands, without waiting for a tap', async () => {
        // HRA serves no "every label" view, so a shelf that waited would just be empty.
        const it_ = el({ _hraLabels: [], _filter: 'labels', _label: '', _load: vi.fn() });
        await it_._loadHraLabels();
        expect(it_._label).toBe('2L');       // the strip's first, not the answer's first
        expect(it_._load).toHaveBeenCalled();
    });

    it('leaves the choice alone when the reader has already made one', async () => {
        const it_ = el({ _filter: 'labels', _label: 'ECM', _load: vi.fn() });
        await it_._loadHraLabels();
        expect(it_._label).toBe('ECM');
        expect(it_._load).not.toHaveBeenCalled();
    });

    it('titles the grid with the label on screen', () => {
        expect(el({ _filter: 'labels', _label: 'audite' })._sectionLabel).toBe('audite');
    });

    it('Charts asks for the chart route and needs no second choice', async () => {
        await el({ _filter: 'charts' })._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).toContain('/library/highresaudio-charts?');
    });

    it('Charts is titled by its own shelf, having no strip to name it', () => {
        expect(el({ _filter: 'charts' })._sectionLabel).toBe('Charts');
    });
});

describe('ag-library-browse — playlists by genre and by theme', () => {
    const GROUPS = { genre: [{ title: 'Jazz', label: 'Jazz' }], theme: [{ title: 'Relax', label: 'Relax' }] };

    const el = (o = {}) => makeEl({
        sourceId: 'src_highresaudio', _filter: 'playlists',
        _playlistKind: 'genre', _playlistGroup: 'Jazz',
        _hraPlaylistGroups: GROUPS, _fav: { has: () => false }, ...o,
    });

    beforeEach(() => {
        apiGetMock.mockReset().mockResolvedValue([]);
        getHraPlaylistGroupsMock.mockReset().mockResolvedValue(GROUPS.genre);
    });

    it('browses the editorial tree, naming the grouping beside it', async () => {
        // A grouping is not a third tree: asking for `type=genre` would be a tree HRA
        // has never heard of.
        await el()._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/highresaudio-playlists?');
        expect(url).toContain('type=editorial');
        expect(url).toContain('group_type=genre');
        expect(url).toContain('group=Jazz');
    });

    it('sends no shelf alongside a grouping — HRA serves them from different endpoints', async () => {
        await el({ _playlistCategory: 'Popular' })._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).not.toContain('category=');
    });

    it('asks for nothing until a group is chosen', async () => {
        expect(await el({ _playlistGroup: '' })._fetchPage(0)).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('shows the shelf strip over the editorial tree and the group strip over a grouping', () => {
        expect(el({ _playlistKind: 'editorial' })._showsEditorialShelves).toBe(true);
        expect(el({ _playlistKind: 'editorial' })._showsPlaylistGroups).toBe(false);
        expect(el()._showsPlaylistGroups).toBe(true);
        expect(el()._showsEditorialShelves).toBe(false);
        expect(el({ _playlistKind: 'mine' })._showsPlaylistGroups).toBe(false);
    });

    it('treats a grouping as editorial artwork — those are the 2:1 teasers too', () => {
        expect(el()._bannerCovers).toBe(true);
        expect(el({ _playlistKind: 'theme', _playlistGroup: 'Relax' })._bannerCovers).toBe(true);
        expect(el({ _playlistKind: 'mine' })._bannerCovers).toBe(false);
    });

    it('opens a grouping on its first entry when its list is already in memory', () => {
        const it_ = el({ _playlistKind: 'editorial', _load: vi.fn() });
        it_._setPlaylistKind('theme');
        expect(it_._playlistGroup).toBe('Relax');
        expect(getHraPlaylistGroupsMock).not.toHaveBeenCalled();
    });

    it('fetches a grouping the first time it is opened, then opens on its first entry', async () => {
        const it_ = el({
            _playlistKind: 'editorial', _hraPlaylistGroups: { genre: [], theme: [] },
            _load: vi.fn(),
        });
        it_._setPlaylistKind('genre');
        expect(getHraPlaylistGroupsMock).toHaveBeenCalledWith('genre');
        await it_._loadHraPlaylistGroups('genre');
        expect(it_._playlistGroup).toBe('Jazz');
    });

    it('keeps the two groupings apart in state', async () => {
        const it_ = el({ _hraPlaylistGroups: { genre: [], theme: [] }, _load: vi.fn() });
        getHraPlaylistGroupsMock.mockResolvedValue(GROUPS.theme);
        await it_._loadHraPlaylistGroups('theme');
        expect(it_._hraPlaylistGroups.theme).toEqual(GROUPS.theme);
        expect(it_._hraPlaylistGroups.genre).toEqual([]);
    });

    it('titles the grid with the group, not with the grouping', () => {
        expect(el()._sectionLabel).toBe('Jazz');
        expect(el({ _playlistGroup: '' })._sectionLabel).toBe('Playlists by genre');
    });

    it('leaving a grouping takes its choice with it', () => {
        const it_ = el({ _load: vi.fn() });
        it_._setPlaylistKind('mine');
        expect(it_._playlistGroup).toBe('');
    });
});

describe('ag-library-browse — review fixes on the shelves', () => {
    beforeEach(() => apiGetMock.mockReset());

    it('a groups list landing after the reader left Playlists changes nothing on screen', async () => {
        // _playlistKind survives leaving the shelf, so without the visibility guard a
        // slow fetch picked a group and reloaded — blanking the Favorites grid the
        // reader had moved to. The guard its sibling _openFirstEntry always had.
        getHraPlaylistGroupsMock.mockResolvedValue([{ title: 'Jazz', label: 'Jazz' }]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _filter: 'favorites',
            _playlistKind: 'genre', _playlistGroup: '',
            _hraPlaylistGroups: { genre: [], theme: [] }, _load: vi.fn(),
        });

        await el._loadHraPlaylistGroups('genre');

        expect(el._hraPlaylistGroups.genre).toEqual([{ title: 'Jazz', label: 'Jazz' }]);
        expect(el._playlistGroup).toBe('');
        expect(el._load).not.toHaveBeenCalled();
    });

    it('still opens the grouping when its shelf IS on screen', async () => {
        getHraPlaylistGroupsMock.mockResolvedValue([{ title: 'Jazz', label: 'Jazz' }]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _filter: 'playlists',
            _playlistKind: 'genre', _playlistGroup: '',
            _hraPlaylistGroups: { genre: [], theme: [] }, _load: vi.fn(),
        });

        await el._loadHraPlaylistGroups('genre');

        expect(el._playlistGroup).toBe('Jazz');
        expect(el._load).toHaveBeenCalled();
    });

    it('re-measures the filter bar when the subscription state is learned', () => {
        // The bar jumps between one pill (Vault) and seven on that flag; the old code
        // only healed the overflow markers by accident, via the categories arriving.
        const measured = vi.fn();
        const el = makeEl({
            sourceId: 'src_highresaudio',
            _syncObserver() {},
            _edges: { attach() {}, measure: measured },
            _genreEdges: { attach() {}, measure() {} },
            _playlistEdges: { attach() {}, measure() {} },
            _shelfEdges: { attach() {}, measure() {} },
            _entryEdges: { attach() {}, measure() {} },
        });
        el.querySelector = () => null;

        el.updated(new Map([['_hraSubscribed', false]]));

        expect(measured).toHaveBeenCalled();
    });

    it('keeps a category in its asked-for place even when the core re-words its label', () => {
        // The order is keyed on the TITLE — the stable addressing key — so a display
        // relabel ('New Release' → 'New Releases') cannot silently send the category
        // to the back of the strip and change where the shelf lands.
        const el = makeEl({
            sourceId: 'src_highresaudio',
            _hraCategories: [
                { title: 'Editors Choice', label: 'Editors Choice' },
                { title: 'Neuheiten', label: 'New Releases' },   // drifted wording
            ],
        });
        expect(el._categoryPills[0]).toEqual(['Neuheiten', 'New Releases']);
    });
});

describe('ag-library-browse — the two design calls settled with the user', () => {
    beforeEach(() => apiGetMock.mockReset());

    it('a shelf reopened finds the entry its reader left it on', () => {
        // Playlists always kept its tree and shelf across the same gesture; Categories
        // and Labels reset to their first entry, so one bar remembered two ways.
        const el = makeEl({
            sourceId: 'src_highresaudio', _filter: 'charts', _category: 'Bestsellers',
            _hraCategories: [{ title: 'Neuheiten', label: 'New Release' },
                             { title: 'Bestsellers', label: 'Bestsellers' }],
            _load: vi.fn(),
        });

        el._setFilter('categories');

        expect(el._category).toBe('Bestsellers');
    });

    it('still opens on the first entry when nothing has been chosen yet', () => {
        const el = makeEl({
            sourceId: 'src_highresaudio', _filter: 'charts', _category: '',
            _hraCategories: [{ title: 'Editors Choice', label: 'Editors Choice' },
                             { title: 'Neuheiten', label: 'New Release' }],
            _load: vi.fn(),
        });

        el._setFilter('categories');

        expect(el._category).toBe('Neuheiten');   // the strip's first, in Lothar's order
    });

    it('reads a grouping key that is not a word on its own', () => {
        // ⚠️ What this does NOT pin: that the word comes from the strip's label rather
        // than from the state key. For both kinds that exist today the two coincide
        // ('genre' → 'Genre' → 'genre'), so no assertion can tell them apart — a first
        // version of this test asserted exactly that and passed with the fix reverted.
        // What is left is the half that has content: an unfamiliar key falls back to
        // itself instead of throwing, so the empty state still renders.
        expect(makeEl({ _playlistKind: 'by_mood' })._playlistKindLabel).toBe('by_mood');
        expect(makeEl({ _playlistKind: 'genre' })._playlistKindLabel).toBe('genre');
    });
});

describe('ag-library-browse — Qobuz shelves', () => {
    // What the core answers on /library/qobuz-shelves: its own reading order.
    const SHELVES = [
        { title: 'new-releases', label: 'New Releases' },
        { title: 'editor-picks', label: 'Selection' },
        { title: 'harmonia-mundi', label: 'Harmonia Mundi' },
    ];

    function qEl(over = {}) {
        return makeEl({ sourceId: 'src_qobuz', _qobuzShelves: SHELVES, _genres: [], ...over });
    }

    beforeEach(() => {
        apiGetMock.mockReset();
        getQobuzShelvesMock.mockReset();
        getQobuzGenresMock.mockReset();
    });

    it('offers five shelves, each opening a strip of its own', () => {
        // Four pills used to sit here, two of which were single hard-coded shelves out
        // of the nine the catalogue holds — the other seven were unreachable.
        expect(qEl()._pills.map(([, label]) => label)).toEqual(
            ['Favorites', 'Purchases', 'Shelves', 'Playlists', 'Genres'],
        );
    });

    it('is the same bar before the shelves have arrived', () => {
        expect(qEl({ _qobuzShelves: [] })._pills).toEqual(qEl()._pills);
    });

    it('keys the strip on the shelf title and shows its label', () => {
        expect(qEl()._shelfPills).toEqual([
            ['new-releases', 'New Releases'],
            ['editor-picks', 'Selection'],
            ['harmonia-mundi', 'Harmonia Mundi'],
        ]);
    });

    it('does not reorder what the core listed', () => {
        // The core holds the closed list; a second opinion on its order would drift.
        expect(qEl()._shelfPills.map(([t]) => t)).toEqual(SHELVES.map((s) => s.title));
    });

    it('asks the shelf endpoint with the chosen shelf as the type', async () => {
        apiGetMock.mockResolvedValue([]);
        await qEl({ _filter: 'shelves', _category: 'harmonia-mundi' })._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/qobuz-featured?');
        expect(url).toContain('type=harmonia-mundi');
    });

    it('asks for nothing until a shelf is chosen', async () => {
        expect(await qEl({ _filter: 'shelves', _category: '' })._fetchPage(0)).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('names the grid after the chosen shelf, not after the pill above it', () => {
        expect(qEl({ _filter: 'shelves', _category: 'editor-picks' })._sectionLabel)
            .toBe('Selection');
    });

    it('opens on the first shelf when its list lands', async () => {
        getQobuzShelvesMock.mockResolvedValue(SHELVES);
        const el = qEl({ _filter: 'shelves', _category: '', _qobuzShelves: [] });
        el._load = vi.fn();
        await el._loadQobuzShelves();
        expect(el._category).toBe('new-releases');
        expect(el._load).toHaveBeenCalled();
    });

    it('does not fill the strip when the source changed while the list was in flight', async () => {
        getQobuzShelvesMock.mockResolvedValue(SHELVES);
        const el = qEl({ _qobuzShelves: [] });
        el.sourceId = 'src_highresaudio';
        await el._loadQobuzShelves();
        expect(el._qobuzShelves).toEqual([]);
    });
});

describe('ag-library-browse — Qobuz purchases', () => {
    beforeEach(() => apiGetMock.mockReset());

    it('asks the purchases endpoint', async () => {
        apiGetMock.mockResolvedValue([]);
        await makeEl({ sourceId: 'src_qobuz', _filter: 'purchases' })._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).toContain('/library/qobuz-purchases?');
    });

    it('still offers the ★, unlike the HRA vault', () => {
        // A bought Qobuz album is an ordinary catalogue album — its id is one the
        // favourites route knows, which is what HRA's Vault ids are not.
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'purchases' })._showsFavorites).toBe(true);
    });

    it('holds albums, not playlists', () => {
        expect(makeEl({ sourceId: 'src_qobuz', _filter: 'purchases' })._showsPlaylists).toBe(false);
    });
});

describe('ag-library-browse — Qobuz playlists', () => {
    beforeEach(() => apiGetMock.mockReset());

    function plEl(over = {}) {
        return makeEl({
            sourceId: 'src_qobuz', _filter: 'playlists',
            _playlistEdges: { overflows: false, attach() {}, measure() {} },
            ...over,
        });
    }

    it('carries the chosen tree to the core', async () => {
        apiGetMock.mockResolvedValue([]);
        await plEl({ _playlistKind: 'mine' })._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).toContain('type=mine');
    });

    it('offers exactly two trees — Qobuz has no third', () => {
        // `editor-picks` and `last-created` answer the same playlists, so a third pill
        // would be one shelf under two names.
        const strip = plEl()._renderPlaylistKinds();
        expect(text(strip)).toContain('Editorial');
        expect(text(strip)).toContain('Mine');
        expect(text(strip)).not.toContain('Theme');
    });

    it('queues a playlist as a playlist', () => {
        expect(plEl()._albumOpts({ id: 'pl1' }, 'play').itemType).toBe('playlist');
    });

    it('has no shelf strip under its trees, unlike HRA', () => {
        expect(plEl({ _playlistKind: 'editorial' })._showsEditorialShelves).toBe(false);
        expect(plEl({ _playlistKind: 'editorial' })._renderPlaylistCategories()).toBe(null);
    });
});

describe('ag-library-browse — Qobuz genres', () => {
    // What the core answers: paths are opaque ids, and four genre names carry a '/'.
    const QOBUZ_GENRES = [
        { title: 'Pop/Rock', path: '112', subgenres: [
            { title: 'Pop', path: '117' },
            { title: 'Rock', path: '118' },
        ] },
        { title: 'Hip-Hop/Rap', path: '133', subgenres: [] },
    ];

    function gEl(over = {}) {
        return makeEl({
            sourceId: 'src_qobuz', _filter: 'genres', _genres: QOBUZ_GENRES,
            _genre: null, ...over,
        });
    }

    beforeEach(() => {
        apiGetMock.mockReset();
        getQobuzGenresMock.mockReset();
        getHraGenresMock.mockReset();
    });

    it('offers the genres while none is chosen', () => {
        expect(gEl()._genrePills).toEqual([['112', 'Pop/Rock'], ['133', 'Hip-Hop/Rap']]);
    });

    it('offers the genre as "All", then its sub-genres', () => {
        expect(gEl({ _genre: '112' })._genrePills).toEqual([
            ['112', 'All'], ['117', 'Pop'], ['118', 'Rock'],
        ]);
    });

    it('stays on the genre of the chosen sub-genre', () => {
        expect(gEl({ _genre: '118' })._topGenre.title).toBe('Pop/Rock');
    });

    it('finds the genre of a name that carries a slash', () => {
        // The regression this guards: the strip used to find the parent by splitting
        // the path on '/', which looks up "Pop" for a genre actually called "Pop/Rock"
        // and finds nothing — an empty strip. Four of the thirteen are like this.
        expect(gEl({ _genre: '112' })._topGenre.title).toBe('Pop/Rock');
        expect(gEl({ _genre: '112' })._genrePills.length).toBe(3);
    });

    it('titles the grid with the genre and its sub-genre, never with the raw path', () => {
        expect(gEl({ _genre: '118' })._sectionLabel).toBe('Pop/Rock · Rock');
        expect(gEl({ _genre: '112' })._sectionLabel).toBe('Pop/Rock');
        // The path is a numeric id here — printing it would read as "112 · 118".
        expect(gEl({ _genre: '118' })._sectionLabel).not.toContain('118');
    });

    it('keeps the list of genres when the chosen one has nothing under it', () => {
        // It used to collapse to a single inert "All" — a strip of one button that goes
        // back to where it already is. The list keeps the next genre one tap away.
        expect(gEl({ _genre: '133' })._genrePills).toEqual([
            ['112', 'Pop/Rock'], ['133', 'Hip-Hop/Rap'],
        ]);
    });

    it('asks the Qobuz genre endpoint with the opaque path', async () => {
        apiGetMock.mockResolvedValue([]);
        await gEl({ _genre: '117' })._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/qobuz-genre?');
        expect(url).toContain('genre=117');
    });

    it('asks for nothing until a genre is picked', async () => {
        expect(await gEl()._fetchPage(0)).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('fetches the Qobuz tree, not the HRA one', async () => {
        getQobuzGenresMock.mockResolvedValue(QOBUZ_GENRES);
        const el = gEl({ _genres: [] });
        await el._loadGenres();
        expect(getQobuzGenresMock).toHaveBeenCalled();
        expect(getHraGenresMock).not.toHaveBeenCalled();
        expect(el._genres).toEqual(QOBUZ_GENRES);
    });

    it('does not fill the strip when the source changed while the tree was in flight', async () => {
        // One property holds whichever source's genres are up, so a slow answer must
        // not drop Qobuz's thirteen into an HRA strip.
        let resolve;
        getQobuzGenresMock.mockReturnValue(new Promise((r) => { resolve = r; }));
        const el = gEl({ _genres: [] });
        const pending = el._loadGenres();
        el.sourceId = 'src_highresaudio';
        resolve(QOBUZ_GENRES);
        await pending;
        expect(el._genres).toEqual([]);
    });
});

describe('ag-library-browse — Tidal', () => {
    const SHELVES = [
        { title: 'exclusive', label: 'Exclusif' },
        { title: 'new', label: 'Nouveautés' },
        { title: 'top', label: 'Top 20' },
    ];
    const MOODS = [
        { title: 'concentrate', label: 'Concentration' },
        { title: 'relax', label: 'Détente' },
    ];
    const GENRES = [
        { title: 'Bandes originales', path: 'Film', subgenres: [] },
        { title: 'Hip Hop / Rap', path: 'Hiphop', subgenres: [] },
    ];

    function tEl(over = {}) {
        return makeEl({
            sourceId: 'src_tidal', _tidalShelves: SHELVES, _tidalMoods: MOODS,
            _genres: GENRES, _genre: null, _category: '', _mood: '',
            _playlistEdges: { overflows: false, attach() {}, measure() {} },
            ...over,
        });
    }

    beforeEach(() => {
        apiGetMock.mockReset();
        getTidalShelvesMock.mockReset();
        getTidalGenresMock.mockReset();
        getTidalMoodsMock.mockReset();
        // The other two sources' loaders share `_loadGenres`, so their call counts are
        // what proves this source asked its own.
        getQobuzGenresMock.mockReset();
        getHraGenresMock.mockReset();
    });

    it('offers six shelves, not five flat pills', () => {
        // Two of the five it had were dead: the core found their content by matching
        // words in Tidal's own headings, and Tidal had renamed them.
        expect(tEl()._pills.map(([, label]) => label)).toEqual(
            ['Favorites', 'Shelves', 'Playlists', 'Genres', 'Moods', 'Explore'],
        );
    });

    it('has no Purchases pill — Tidal sells nothing', () => {
        expect(tEl()._pills.map(([f]) => f)).not.toContain('purchases');
    });

    it('reads a shelf through the one list route, naming which list', async () => {
        apiGetMock.mockResolvedValue([]);
        await tEl({ _filter: 'shelves', _category: 'exclusive' })._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/tidal-list?');
        expect(url).toContain('kind=shelves');
        expect(url).toContain('path=exclusive');
    });

    it('reads a genre and a mood through that same route', async () => {
        apiGetMock.mockResolvedValue([]);
        await tEl({ _filter: 'genres', _genre: 'Hiphop' })._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).toContain('kind=genres&path=Hiphop');
        apiGetMock.mockClear();
        await tEl({ _filter: 'moods', _mood: 'relax' })._fetchPage(0);
        expect(apiGetMock.mock.calls[0][0]).toContain('kind=moods&path=relax');
    });

    it('asks for nothing until an entry is chosen', async () => {
        for (const f of ['shelves', 'genres', 'moods']) {
            expect(await tEl({ _filter: f })._fetchPage(0)).toEqual([]);
        }
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('routes the three playlist surfaces to their own endpoints', async () => {
        apiGetMock.mockResolvedValue([]);
        const ask = async (kind) => {
            apiGetMock.mockClear();
            await tEl({ _filter: 'playlists', _playlistKind: kind })._fetchPage(0);
            return apiGetMock.mock.calls[0][0];
        };
        expect(await ask('mine')).toContain('/library/tidal-playlists?');
        expect(await ask('charts')).toContain('/library/tidal-charts?');
        expect(await ask('editorial')).toContain('/library/tidal-editorial?');
    });

    it('puts the charts in the playlist strip, not on the bar', () => {
        // They are a third shelf of playlists beside the editors' and the account's,
        // which is what they are; the bar stays five pills long.
        const strip = text(tEl({ _filter: 'playlists' })._renderPlaylistKinds());
        expect(strip).toContain('Editorial');
        expect(strip).toContain('Mine');
        expect(strip).toContain('Charts');
        expect(tEl()._pills.map(([f]) => f)).not.toContain('charts');
    });

    it('shares the shelf strip with Qobuz rather than growing one of its own', () => {
        expect(tEl({ _filter: 'shelves' })._shelfPills).toEqual([
            ['exclusive', 'Exclusif'], ['new', 'Nouveautés'], ['top', 'Top 20'],
        ]);
    });

    it('keeps the moods on their own state, not on the shelves', () => {
        // Two pills of the SAME source: a shared choice would carry a shelf key into
        // the moods on a tap.
        const el = tEl({ _filter: 'shelves', _category: 'new' });
        el._load = vi.fn();          // _setEntry reloads; the real one wants a live host
        el._setEntry('_mood', 'relax');
        expect(el._category).toBe('new');
        expect(el._mood).toBe('relax');
    });

    it('names the grid after the chosen entry on every strip', () => {
        expect(tEl({ _filter: 'shelves', _category: 'top' })._sectionLabel).toBe('Top 20');
        expect(tEl({ _filter: 'moods', _mood: 'relax' })._sectionLabel).toBe('Détente');
        expect(tEl({ _filter: 'genres', _genre: 'Film' })._sectionLabel)
            .toBe('Bandes originales');
    });

    it('actually renders its genre strip', () => {
        // It did not: `_hasGenreShelf` listed HRA and Qobuz only, so the tree loaded,
        // the grid said "Choose a genre", and the strip that IS the choice never
        // appeared. Found on screen; the pill and fetch assertions all passed.
        const strip = text(tEl({
            _filter: 'genres',
            _genreEdges: { overflows: false, attach() {}, measure() {} },
        })._renderGenres());
        expect(strip).toContain('Bandes originales');
        expect(strip).toContain('Hip Hop / Rap');
    });

    it('drills nowhere in the genres — Tidal publishes no sub-genre', () => {
        // Every Tidal genre is childless, so the strip stays the list with the chosen
        // one marked, and offers no way back out of a level it never entered.
        const el = tEl({
            _filter: 'genres', _genre: 'Film',
            _genreEdges: { overflows: false, attach() {}, measure() {} },
        });
        expect(el._genrePills).toEqual([
            ['Film', 'Bandes originales'], ['Hiphop', 'Hip Hop / Rap'],
        ]);
        expect(text(el._renderGenres())).not.toContain('← Genres');
    });

    it('fetches the Tidal tree, not another service’s', async () => {
        getTidalGenresMock.mockResolvedValue(GENRES);
        const el = tEl({ _genres: [] });
        await el._loadGenres();
        expect(getTidalGenresMock).toHaveBeenCalled();
        expect(getQobuzGenresMock).not.toHaveBeenCalled();
        expect(getHraGenresMock).not.toHaveBeenCalled();
    });

    it('does not fill a strip when the source changed while it was in flight', async () => {
        let resolve;
        getTidalShelvesMock.mockReturnValue(new Promise((r) => { resolve = r; }));
        const el = tEl({ _tidalShelves: [] });
        const pending = el._loadTidalShelves();
        el.sourceId = 'src_qobuz';
        resolve(SHELVES);
        await pending;
        expect(el._tidalShelves).toEqual([]);
    });

    it('opens on the first entry when a strip lands', async () => {
        getTidalMoodsMock.mockResolvedValue(MOODS);
        const el = tEl({ _filter: 'moods', _tidalMoods: [] });
        el._load = vi.fn();
        await el._loadTidalMoods();
        expect(el._mood).toBe('concentrate');
        expect(el._load).toHaveBeenCalled();
    });
});

describe('ag-library-browse — Tidal Explore', () => {
    const ENTRIES = [
        { title: 'pages/genre_jazz', label: 'Jazz' },
        { title: 'pages/record_labels', label: 'Record Labels' },
        { title: 'pages/hires', label: 'HiRes' },
    ];
    const HIRES = {
        title: 'HiRes', links: [],
        sections: [
            { title: 'pages/data/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', label: 'Headphone Classics' },
            { title: 'pages/data/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', label: 'Classic Albums' },
        ],
    };
    const LABELS = {
        title: 'Record Labels', sections: [],
        links: [{ title: 'pages/m_def_jam_40', label: 'Def Jam' }],
    };

    function xEl(over = {}) {
        return makeEl({
            sourceId: 'src_tidal', _filter: 'explore', _explore: ENTRIES,
            _page: null, _pageEntry: '', _pageLinks: [], _section: '',
            _entryEdges: { overflows: false, attach() {}, measure() {} },
            _shelfEdges: { overflows: false, attach() {}, measure() {} },
            ...over,
        });
    }

    beforeEach(() => { apiGetMock.mockReset(); getTidalExploreMock.mockReset();
                       getTidalPageMock.mockReset(); });

    it('shows the entries while none is open', () => {
        expect(xEl()._explorePills.map(([, l]) => l)).toEqual(
            ['Jazz', 'Record Labels', 'HiRes'],
        );
    });

    it('drills a page of links in place, with a way back', () => {
        // Record Labels leads to 52 more pages; that is navigation, not a grid.
        const el = xEl({ _pageLinks: LABELS.links, _pageEntry: '', _page: LABELS });
        expect(el._explorePills).toEqual([['pages/m_def_jam_40', 'Def Jam']]);
        expect(text(el._renderExplore())).toContain('← Explore');
    });

    it('offers no way back from a strip that was never replaced', () => {
        // Seen on screen: a page of sections still shows the tree's entries with one
        // active, so a back button emptied the grid and changed nothing visible.
        const el = xEl({ _pageEntry: 'pages/hires', _page: HIRES });
        expect(el._showsPageLinks).toBe(false);
        expect(text(el._renderExplore())).not.toContain('← Explore');
    });

    it('shows a page of sections on the strip below, not in place', () => {
        const el = xEl({ _pageEntry: 'pages/hires', _page: HIRES });
        // The entries stay on the first strip: a page of sections leads nowhere.
        expect(el._explorePills.map(([, l]) => l)).toEqual(['Jazz', 'Record Labels', 'HiRes']);
        expect(text(el._renderSections())).toContain('Classic Albums');
    });

    it('has no section strip on a page that only leads on', () => {
        expect(xEl({ _pageLinks: LABELS.links, _page: LABELS })
            ._renderSections()).toBe(null);
    });

    it('pages the grid through the section key', async () => {
        apiGetMock.mockResolvedValue([]);
        await xEl({ _page: HIRES, _section: HIRES.sections[1].title })._fetchPage(50);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/tidal-section?');
        expect(url).toContain(encodeURIComponent(HIRES.sections[1].title));
        expect(url).toContain('offset=50');
    });

    it('asks for nothing until a section is chosen', async () => {
        expect(await xEl({ _pageLinks: LABELS.links, _page: LABELS })
            ._fetchPage(0)).toEqual([]);
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('names the grid with the page and the section', () => {
        const el = xEl({ _page: HIRES, _section: HIRES.sections[1].title });
        expect(el._sectionLabel).toBe('HiRes · Classic Albums');
    });

    it('opens a page on its first section', async () => {
        getTidalPageMock.mockResolvedValue(HIRES);
        const el = xEl();
        el._load = vi.fn();
        await el._openPage('pages/hires');
        expect(el._page.title).toBe('HiRes');
        expect(el._section).toBe(HIRES.sections[0].title);
        expect(el._load).toHaveBeenCalled();
    });

    it('goes back to the entries without asking the core again', async () => {
        const el = xEl({ _pageEntry: 'pages/hires', _page: HIRES, _section: 'x' });
        el._load = vi.fn();
        await el._openPage('');
        expect(el._page).toBe(null);
        expect(el._section).toBe('');
        expect(getTidalPageMock).not.toHaveBeenCalled();
    });

    it('drops a page that lands after the reader left the shelf', async () => {
        // The shelf matters as much as the source: without this, leaving Explore
        // mid-flight still wrote the page and reloaded, blanking the grid the reader
        // had just moved to.
        let resolve;
        getTidalPageMock.mockReturnValue(new Promise((r) => { resolve = r; }));
        const el = xEl();
        el._load = vi.fn();
        const pending = el._openPage('pages/hires');
        el._filter = 'genres';
        resolve(HIRES);
        await pending;
        expect(el._page).toBe(null);
        expect(el._load).not.toHaveBeenCalled();
    });

    it('keeps the level when a linked page is opened', () => {
        // Record Labels → Def Jam: Def Jam has sections and no links, and deriving the
        // strip from the open page snapped the reader back to the 42 root entries with
        // nothing active and no way back.
        const el = xEl({ _pageLinks: LABELS.links, _pageEntry: 'pages/m_def_jam_40',
                         _page: HIRES });
        expect(el._explorePills).toEqual([['pages/m_def_jam_40', 'Def Jam']]);
        expect(text(el._renderExplore())).toContain('← Explore');
    });

    it('queues a shelf of playlists as playlists, because the core says so', () => {
        // Tidal's *Exclusif* shelf is 281 playlists and no album. Taken for albums, a
        // card there queued a playlist id through the album route — 404 — and offered a
        // ★ that files it in the album favourites.
        const el = makeEl({
            sourceId: 'src_tidal', _filter: 'shelves', _category: 'exclusive',
            _tidalShelves: [{ title: 'exclusive', label: 'Exclusif', holds: 'playlists' }],
        });
        expect(el._showsPlaylists).toBe(true);
        expect(el._showsFavorites).toBe(false);
        expect(el._albumOpts({ id: 'uuid-1' }, 'play').itemType).toBe('playlist');
    });

    it('leaves a shelf of albums alone', () => {
        const el = makeEl({
            sourceId: 'src_tidal', _filter: 'shelves', _category: 'new',
            _tidalShelves: [{ title: 'new', label: 'Nouveautés', holds: 'albums' }],
        });
        expect(el._showsPlaylists).toBe(false);
        expect(el._showsFavorites).toBe(true);
    });

    it('reads the same statement on an Explore section', () => {
        const el = xEl({
            _page: { title: 'HiRes', links: [], sections: [
                { title: 'pages/data/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                  label: 'Headphone Classics', holds: 'playlists' }] },
            _section: 'pages/data/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        });
        expect(el._showsPlaylists).toBe(true);
        expect(el._albumOpts({ id: 'uuid-2' }, 'play').itemType).toBe('playlist');
    });

    it('drops a page that lands after the reader moved on', async () => {
        let resolve;
        getTidalPageMock.mockReturnValue(new Promise((r) => { resolve = r; }));
        const el = xEl();
        el._load = vi.fn();
        const pending = el._openPage('pages/hires');
        el._pageEntry = 'pages/record_labels';      // tapped another entry meanwhile
        resolve(HIRES);
        await pending;
        expect(el._page).toBe(null);
    });
});

describe('ag-library-browse — every source with a Genres pill renders its strip', () => {
    // The gap this closes: three sources offer Genres, and whether the strip appears was
    // decided by one getter listing them by hand. One was missing and no test noticed,
    // because they all asserted the strip's CONTENTS and never its presence.
    const GENRES = [{ title: 'Jazz', path: 'Jazz', subgenres: [] }];
    const edges = () => ({ overflows: false, attach() {}, measure() {} });

    for (const sourceId of ['src_highresaudio', 'src_qobuz', 'src_tidal']) {
        it(sourceId, () => {
            const el = makeEl({
                sourceId, _filter: 'genres', _genres: GENRES, _genre: null,
                _genreEdges: edges(),
            });
            expect(el._hasGenreShelf).toBe(true);
            expect(text(el._renderGenres())).toContain('Jazz');
        });
    }

    it('and a source without one renders nothing', () => {
        const el = makeEl({ sourceId: 'src_mpd', _filter: 'genres', _genres: GENRES,
                            _genreEdges: edges() });
        expect(el._hasGenreShelf).toBe(false);
        expect(el._renderGenres()).toBe(null);
    });
});
