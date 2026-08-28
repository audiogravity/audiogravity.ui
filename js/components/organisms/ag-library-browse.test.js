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
vi.mock('../../library-store.js', () => ({
    getFavoriteAlbumIds: vi.fn().mockResolvedValue(new Set()),
    setAlbumFavorited: vi.fn(),
    subscribeFavorites: vi.fn(() => () => {}),
    getHraCategories: (...args) => getHraCategoriesMock(...args),
    getHraGenres: (...args) => getHraGenresMock(...args),
    getHraConnection: (...args) => getHraConnectionMock(...args),
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
        { title: 'Hörtipps', label: 'Tips' },
    ];

    /** An instance with the categories already loaded. */
    function hraEl() {
        return makeEl({ sourceId: 'src_highresaudio', _hraCategories: CATEGORIES });
    }

    beforeEach(() => apiGetMock.mockReset());

    it('builds one pill per category, behind Favorites, in the order HRA publishes them', () => {
        expect(hraEl()._pills.map(([, label]) => label))
            .toEqual(['Favorites', 'Vault', 'Genres', 'Playlists', 'Editors Choice', 'Tips']);
    });

    it('shows the label but keys the pill on the title HRA answers with', () => {
        const [, tips] = hraEl()._pills.filter(([f]) => f.startsWith('cat:'));
        expect(tips).toEqual(['cat:Hörtipps', 'Tips']);
    });

    it('keeps the entries of our own until the categories arrive', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] })._pills)
            .toEqual([['favorites', 'Favorites'], ['vault', 'Vault'], ['genres', 'Genres'],
                      ['playlists', 'Playlists']]);
    });

    it('_fetchPage asks for the category by title', async () => {
        apiGetMock.mockResolvedValue([]);
        const el = hraEl();
        el._filter = 'cat:Hörtipps';
        await el._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/highresaudio-category?');
        expect(url).toContain(`category=${encodeURIComponent('Hörtipps')}`);
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
        el._filter = 'cat:Hörtipps';
        expect(el._sectionLabel).toBe('Tips');
    });

    it('takes the list from the store, which owns the caching', async () => {
        getHraCategoriesMock.mockResolvedValue(CATEGORIES);
        const el = makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] });
        await el._loadHraCategories();
        expect(el._hraCategories).toEqual(CATEGORIES);
    });

    it('a failed list leaves Favorites alone rather than an empty bar', async () => {
        getHraCategoriesMock.mockResolvedValue([]);
        const el = makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] });
        await el._loadHraCategories();
        expect(el._pills).toEqual([['favorites', 'Favorites'], ['vault', 'Vault'],
                                   ['genres', 'Genres'], ['playlists', 'Playlists']]);
    });

    it('asks again on every load while the list is missing — Refresh repairs the bar', async () => {
        // The categories used to be fetched on a source CHANGE only. A source restored
        // at boot changes once: if that one attempt failed (an HRA session still warming
        // up), nothing in the app could ask again short of switching source and back.
        getHraCategoriesMock.mockReset().mockResolvedValue([]);
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _filter: 'favorites',
            _detachObserver() {}, _fav: { load() {} },
        });
        await el._load();
        await el._load();
        expect(getHraCategoriesMock).toHaveBeenCalledTimes(2);
    });

    it('asks for the genre tree again on every load while it is missing', async () => {
        // The Genres pill cannot ask again once it is the chosen one — _setFilter
        // returns early on the same filter — so a tree that failed to arrive would
        // stay missing for good. Refresh reloads, and Refresh must repair it.
        getHraGenresMock.mockReset().mockResolvedValue([]);
        getHraCategoriesMock.mockResolvedValue([]);
        apiGetMock.mockResolvedValue([]);
        const el = makeEl({
            sourceId: 'src_highresaudio', _hraCategories: [], _hraGenres: [],
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
            sourceId: 'src_highresaudio', _hraCategories: [], _hraGenres: [],
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
            sourceId: 'src_highresaudio', _hraCategories: [], _hraGenres: [],
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
            ['favorites', 'vault', 'genres', 'playlists', 'cat:Editors Choice']);
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
            sourceId: 'src_highresaudio', _hraCategories: [], _hraGenres: GENRES,
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
        const el = genreEl({ _filter: 'favorites', _hraGenres: [] });
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
            sourceId: 'src_highresaudio', _hraCategories: [], _hraGenres: [],
            _filter: 'playlists', _playlistKind: 'editorial',
            _detachObserver() {}, _fav: { load() {} }, ...over,
        });
    }

    beforeEach(() => apiGetMock.mockReset().mockResolvedValue([]));

    it('offers Playlists next to Favorites, the Vault and Genres', () => {
        expect(plEl()._pills.map(([f]) => f).slice(0, 4))
            .toEqual(['favorites', 'vault', 'genres', 'playlists']);
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

    it('leaves the Qobuz and Tidal playlists pill alone', () => {
        // 'playlists' is their filter value too — an unguarded branch titled their
        // grid "Editorial playlists", and "Mine playlists" after a visit to HRA.
        for (const sourceId of ['src_qobuz', 'src_tidal']) {
            const el = makeEl({ sourceId, _filter: 'playlists', _playlistKind: 'mine' });
            expect(el._sectionLabel).toBe('Playlists');
        }
    });

    it('forgets which tree was open when the source changes', () => {
        const el = plEl({ _playlistKind: 'mine' });
        el._syncObserver = () => {};
        el._edges = { attach() {}, measure() {} };
        el._genreEdges = { attach() {}, measure() {} };
        el._playlistEdges = { attach() {}, measure() {} };
        el.querySelector = () => null;
        el.updated(new Map([['sourceId', 'src_qobuz']]));
        expect(el._playlistKind).toBe('editorial');
    });

    it('titles the grid with the tree on screen', () => {
        // The heading is its own wording, not the pill label plus a word: the pill
        // reads "Mine", the shelf above the grid must read "My playlists".
        expect(plEl()._sectionLabel).toBe('Editorial playlists');
        expect(plEl({ _playlistKind: 'mine' })._sectionLabel).toBe('My playlists');
    });
});
