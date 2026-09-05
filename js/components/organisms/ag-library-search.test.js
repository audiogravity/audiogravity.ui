/**
 * Unit tests for ag-library-search — where a search goes, and what it says when it
 * comes back wrong.
 *
 * Logic-only (no DOM mount): lit and the component's imports are mocked, then the
 * methods are exercised on a bare instance. Four of these cases pin defects the
 * HIGHRESAUDIO filters introduced, each of which showed the reader something untrue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
const apiGetMock = vi.fn();
vi.mock('../../api.js', () => ({ apiGet: (...a) => apiGetMock(...a) }));
vi.mock('../utils-lit.js', () => ({
    coverUrl: () => '',
    // The real one wraps the call and writes _loading / _error; here it just runs.
    loadWithState: async (_host, fn) => fn(),
    svgIcon: (icon) => ({ strings: ['<svg>'], values: [icon] }),
}));
vi.mock('../../library-api.js', () => ({
    queueItem: vi.fn(), queueWithFeedback: vi.fn(), playWithFeedback: vi.fn(),
}));
const getHraConnectionMock = vi.fn(async () => null);
vi.mock('../../library-store.js', () => ({
    getFavoriteAlbumIds: vi.fn().mockResolvedValue(new Set()),
    setAlbumFavorited: vi.fn(),
    subscribeFavorites: vi.fn(() => () => {}),
    getHraConnection: (...args) => getHraConnectionMock(...args),
    hasSubscription: (conn) => conn?.has_subscription !== false,
}));
vi.mock('../molecules/ag-library-list-row.js', () => ({}));
vi.mock('../molecules/ag-hra-search-filters.js', () => ({}));

const { AgLibrarySearch } = await import('./ag-library-search.js');

/** The HRA advanced criteria, unset unless named. */
const filters = (over = {}) => ({
    artist: '', composer: '', label: '', release: '', format: '', mood: '', sort: '', ...over,
});

const el = (over = {}) => Object.assign(Object.create(AgLibrarySearch.prototype), {
    sourceId: 'src_highresaudio',
    zoneId: '',
    sources: [],
    _query: '',
    _results: null,
    _loading: false,
    _error: '',
    _hraSubscribed: true,
    _debounce: null,
    _searchToken: 0,
    _hraFilters: filters(),
    _fav: { load() {} },
    ...over,
});

const lastUrl = () => apiGetMock.mock.calls.at(-1)?.[0] ?? '';

describe('ag-library-search — where a HIGHRESAUDIO search goes', () => {
    beforeEach(() => apiGetMock.mockReset().mockResolvedValue([]));

    it('uses the ordinary search while no filter is set', async () => {
        await el({ _query: 'queen' })._search();
        expect(lastUrl()).toContain('/library/search?');
        expect(lastUrl()).toContain('source_id=src_highresaudio');
    });

    it('uses the filtered endpoint as soon as one is set', async () => {
        await el({ _query: 'queen', _hraFilters: filters({ composer: 'Mozart' }) })._search();
        expect(lastUrl()).toContain('/library/highresaudio-search?');
        expect(lastUrl()).toContain('composer=Mozart');
    });

    it('answers with albums only, and empties the other two sections', async () => {
        // The filtered endpoint knows nothing of artists and tracks; leaving the old
        // ones on screen would show results that no longer match the filter.
        apiGetMock.mockResolvedValue([{ id: 'a1', title: 'x' }]);
        const host = el({
            _query: 'queen',
            _hraFilters: filters({ composer: 'Mozart' }),
            _results: { artists: [{ id: 'old' }], albums: [], tracks: [{ id: 'old' }] },
        });
        await host._search();
        expect(host._results.albums).toHaveLength(1);
        expect(host._results.artists).toEqual([]);
        expect(host._results.tracks).toEqual([]);
    });

    it('leaves the filters behind when the source does', () => {
        // The filter row is rendered for HRA only: it is destroyed on the way out and
        // rebuilt blank on the way back, so its values must not outlive it — they
        // narrowed every later search with nothing on screen to undo them.
        const host = el({ _hraFilters: filters({ composer: 'Mozart' }), sourceId: 'src_qobuz' });
        host.updated(new Map([['sourceId', 'src_highresaudio']]));
        expect(host._hraFilters).toEqual(filters());
    });

    it('keeps the filters when the source did not change', () => {
        const host = el({ _hraFilters: filters({ composer: 'Mozart' }) });
        host.updated(new Map([['_query', 'x']]));
        expect(host._hraFilters.composer).toBe('Mozart');
    });

    it('searches on a criterion alone, with the box left empty', async () => {
        // The defect the whole form was rebuilt around: this ran only when the box
        // held something, so filling in a criterion and pressing Search did nothing
        // at all. HRA's advanced endpoint needs no term — `label=ECM` alone answers
        // with a full page of them.
        const host = el({ _query: '', _hraFilters: filters({ label: 'ECM' }) });
        await host._search();
        expect(lastUrl()).toContain('/library/highresaudio-search?');
        expect(lastUrl()).toContain('label=ECM');
        expect(lastUrl()).not.toContain('q=');
    });

    it('sends every criterion the form applied, under the core\'s own names', async () => {
        const host = el({
            _query: 'queen',
            _hraFilters: filters({
                artist: 'Queen', release: '2026', format: 'fl192',
                mood: 'Dreamy', sort: '-title',
            }),
        });
        await host._search();
        const url = lastUrl();
        for (const pair of ['q=queen', 'artist=Queen', 'release=2026', 'format=fl192',
            'mood=Dreamy', 'sort=-title']) {
            expect(url).toContain(pair);
        }
    });

    it('searches a two-letter term, filtered or not', async () => {
        // A three-character minimum used to be enforced here. It belongs to the plain
        // search, never applied to this endpoint, and turned "U2" with a criterion set
        // into a catalogue with no U2 in it.
        await el({ _query: 'U2' })._search();
        expect(lastUrl()).toContain('/library/search?');
        await el({ _query: 'U2', _hraFilters: filters({ composer: 'Mozart' }) })._search();
        expect(lastUrl()).toContain('/library/highresaudio-search?');
        expect(lastUrl()).toContain('q=U2');
    });

    it('does not send an order with nothing to arrange, and says why', async () => {
        // Measured on the box: an order on its own returns an empty list, in either
        // direction, and so does a request with no criterion at all. Sending it would
        // spend HRA's slowest call to come back with "no results for those criteria",
        // which reads as an empty catalogue rather than as a question missing half.
        const host = el({ _query: '', _hraFilters: filters({ sort: '-importDate' }) });
        await host._search();
        expect(apiGetMock).not.toHaveBeenCalled();
        expect(host._error).toContain('add something to search for');
        expect(host._results).toBeNull();
    });

    it('sends the order along once there is something to arrange', async () => {
        const host = el({ _query: '', _hraFilters: filters({ label: 'ECM', sort: '-title' }) });
        await host._search();
        expect(lastUrl()).toContain('label=ECM');
        expect(lastUrl()).toContain('sort=-title');
        expect(host._error).toBe('');
    });

    it('drops the results when the form is cleared with an empty box', async () => {
        const host = el({ _query: '', _results: { albums: [{ id: 'a' }] } });
        host._onHraFilters({ detail: filters() });
        expect(host._results).toBeNull();
        expect(apiGetMock).not.toHaveBeenCalled();
    });

    it('keeps searching on the criteria when the box is emptied', async () => {
        // Emptying the box does not empty the screen while criteria stand: they are a
        // search of their own, and it is the one still running.
        vi.useFakeTimers();
        const host = el({ _query: 'queen', _hraFilters: filters({ label: 'ECM' }) });
        host._search = vi.fn();
        host._onInput({ target: { value: '' } });
        vi.runAllTimers();
        expect(host._search).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('drops an answer that arrives after a newer search', async () => {
        // A filtered search can take tens of seconds on HRA; a later, faster one must
        // not be overwritten when the slow one finally lands.
        let release;
        apiGetMock.mockImplementationOnce(() => new Promise((r) => { release = () => r([{ id: 'slow' }]); }));
        const host = el({ _query: 'queen', _hraFilters: filters({ composer: 'Mozart' }) });
        const slow = host._search();
        host._searchToken += 1;          // a newer search was started meanwhile
        release();
        await slow;
        expect(host._results).toBeNull();
    });

    it('a filter change disarms the pending keystroke search', () => {
        // Left armed, it fires an unfiltered request after this one and can win.
        vi.useFakeTimers();
        const host = el({ _query: 'queen' });
        host._search = vi.fn();
        host._onInput({ target: { value: 'queen' } });
        host._onHraFilters({ detail: filters({ composer: 'Mozart' }) });
        vi.runAllTimers();
        expect(host._search).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});

describe('ag-library-search — an account without a subscription', () => {
    // The catalogue search answers NO SUBSCRIPTION to such an account on every
    // query. The browse already narrows itself to the Vault; a search tab that
    // kept offering the catalogue was the same defect one screen over.
    beforeEach(() => { apiGetMock.mockReset(); apiGetMock.mockResolvedValue([]); });

    it('says where the purchases are instead of running a search that cannot answer', async () => {
        const host = el({ _query: 'queen', _hraSubscribed: false });
        await host._search();
        expect(apiGetMock).not.toHaveBeenCalled();
        expect(host._results).toBeNull();
        expect(host._error).toContain('Vault');
    });

    it('does not ask for the ★ Set its account is refused', async () => {
        const favLoad = vi.fn();
        const host = el({ _query: 'queen', _hraSubscribed: false, _fav: { load: favLoad } });
        await host._search();
        expect(favLoad).not.toHaveBeenCalled();
    });

    it('leaves every other source alone — the flag only means something on HRA', async () => {
        const host = el({ sourceId: 'src_qobuz', _query: 'queen', _hraSubscribed: false });
        await host._search();
        expect(apiGetMock).toHaveBeenCalled();
        expect(host._error).toBe('');
    });

    it('reads the connection through the store when arriving on HRA', async () => {
        getHraConnectionMock.mockClear();
        getHraConnectionMock.mockResolvedValue({ connected: true, has_subscription: false });
        const host = el({ _hraSubscribed: true });
        await host._loadHraConnection();
        expect(getHraConnectionMock).toHaveBeenCalledTimes(1);
        expect(host._hraSubscribed).toBe(false);
    });
});
