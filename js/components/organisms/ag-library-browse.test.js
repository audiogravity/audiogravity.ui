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
vi.mock('../../library-store.js', () => ({
    getFavoriteAlbumIds: vi.fn().mockResolvedValue(new Set()),
    setAlbumFavorited: vi.fn(),
    subscribeFavorites: vi.fn(() => () => {}),
    getHraCategories: (...args) => getHraCategoriesMock(...args),
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
            .toEqual(['Favorites', 'Editors Choice', 'Tips']);
    });

    it('shows the label but keys the pill on the title HRA answers with', () => {
        const [, tips] = hraEl()._pills.filter(([f]) => f.startsWith('cat:'));
        expect(tips).toEqual(['cat:Hörtipps', 'Tips']);
    });

    it('leaves Favorites alone on the bar until the categories arrive', () => {
        expect(makeEl({ sourceId: 'src_highresaudio', _hraCategories: [] })._pills)
            .toEqual([['favorites', 'Favorites']]);
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
        expect(el._pills).toEqual([['favorites', 'Favorites']]);
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
