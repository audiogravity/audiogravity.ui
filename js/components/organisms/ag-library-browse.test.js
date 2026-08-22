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
vi.mock('../../library-store.js', () => ({
    getFavoriteAlbumIds: vi.fn().mockResolvedValue(new Set()),
    setAlbumFavorited: vi.fn(),
    subscribeFavorites: vi.fn(() => () => {}),
    getHraCategories: (...args) => getHraCategoriesMock(...args),
    getHraGenres: (...args) => getHraGenresMock(...args),
}));
vi.mock('../../ui-helpers.js', () => ({ showToast: vi.fn() }));
vi.mock('../atoms/ag-library-cover.js', () => ({}));
vi.mock('../atoms/ag-library-add-btn.js', () => ({}));
vi.mock('../atoms/ag-library-fav-btn.js', () => ({}));
vi.mock('../molecules/ag-library-list-row.js', () => ({}));

import { AgLibraryBrowse } from './ag-library-browse.js';

function makeEl(overrides = {}) {
    return Object.assign(Object.create(AgLibraryBrowse.prototype), {
        sourceId: 'src_qobuz', zoneId: '', artistId: '', artistName: '', ...overrides,
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
            .toEqual(['Favorites', 'Genres', 'Playlists', 'Editors Choice', 'Tips']);
    });

    it('shows the label but keys the pill on the title HRA answers with', () => {
        const [, tips] = hraEl()._pills.filter(([f]) => f.startsWith('cat:'));
        expect(tips).toEqual(['cat:Hörtipps', 'Tips']);
    });

    it('keeps the two entries of our own until the categories arrive', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] })._pills)
            .toEqual([['favorites', 'Favorites'], ['genres', 'Genres'],
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
        expect(el._pills).toEqual([['favorites', 'Favorites'], ['genres', 'Genres'],
                                   ['playlists', 'Playlists']]);
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

    it('offers Playlists next to Favorites and Genres', () => {
        expect(plEl()._pills.map(([f]) => f).slice(0, 3))
            .toEqual(['favorites', 'genres', 'playlists']);
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
