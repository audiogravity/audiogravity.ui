/**
 * The local-library pills ask the core for a different order, instead of shuffling
 * what is already on screen.
 *
 * Reported symptom: All / Recent / A–Z had no effect. Two causes, and only one of
 * them was the obvious one:
 *
 *   - the core already sorts by title, so the client's own A–Z sort was a no-op and
 *     'All' and 'A–Z' produced byte-identical lists;
 *   - 'Recent' never looked at a date. It took `_albums.slice(0, 50)` — the first
 *     fifty *alphabetically* — and labelled them recent.
 *
 * And no client-side sort could have been correct: pagination is server-side, fifty
 * albums a page, so the browser can only order the pages it happens to hold. The
 * pills now map to a `sort` the core applies across the whole library before paging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    // `svg` too: ag-icons.js — imported for real below — builds its glyphs with it.
    html: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
const apiGetMock = vi.fn(async () => []);
vi.mock('../../api.js', () => ({ apiGet: (...a) => apiGetMock(...a) }));
vi.mock('../../library-store.js', () => ({
    subscribePlayerState: () => () => {},
    getHraConnection: async () => null,
    hasSubscription: (conn) => conn?.has_subscription !== false,
}));
vi.mock('../utils-lit.js', () => ({
    coverUrl: () => '',
    loadWithState: async (_h, fn) => fn(),
    // The real one wraps an icon in a sized <svg>; here only its presence matters.
    svgIcon: (icon) => ({ strings: ['<svg>'], values: [icon] }),
}));
vi.mock('../../library-api.js', () => ({}));
// The real icon module: they are plain strings with no side effects, and a stub would
// have to enumerate every export vitest checks for.
vi.unmock('../../ag-icons.js');
vi.mock('../atoms/ag-library-cover.js', () => ({}));
vi.mock('../atoms/ag-library-add-btn.js', () => ({}));
vi.mock('../atoms/ag-library-fav-btn.js', () => ({}));
vi.mock('../molecules/ag-library-list-row.js', () => ({}));

const { AgLibraryBrowse } = await import('./ag-library-browse.js');

/**
 * A bare instance on a local (MPD) source — no constructor, no DOM.
 *
 * `_isStreaming` and friends are getters derived from `sourceId`, so they are set by
 * choosing the source rather than assigned: 'src_mpd' is not one of the three
 * streaming ids, which makes every one of them false without touching the class.
 */
const el = (overrides = {}) => Object.assign(Object.create(AgLibraryBrowse.prototype), {
    sourceId: 'src_mpd',
    artistId: null,
    zoneId: '',
    _filter: 'all',
    _albums: [],
    _offset: 0,
    _hasMore: false,
    _loadingMore: false,
    _detachObserver() {},
    _fav: { load() {} },
    // The two controllers the constructor would have built. render() asks the scroll
    // one whether the bar hides pills at all — here it never does, so no chevron.
    _edges: { overflows: false, attach() {}, measure() {} },
    _genreEdges: { overflows: false, attach() {}, measure() {} },
    _playlistEdges: { overflows: false, attach() {}, measure() {} },
    _playlistKind: 'editorial',
    _hraCategories: [],
    _genres: [],
    _genre: null,
    ...overrides,
});

/** The `sort` value of the last /library/albums call. */
const lastSort = () => {
    const url = apiGetMock.mock.calls.at(-1)?.[0] ?? '';
    return new URLSearchParams(url.split('?')[1] ?? '').get('sort');
};

beforeEach(() => apiGetMock.mockClear());

describe('each pill asks the core for its own order', () => {
    it('All requests the alphabetical sort', async () => {
        await el({ _filter: 'all' })._fetchPage(0);
        expect(lastSort()).toBe('title');
    });

    it('A–Z requests the alphabetical sort', async () => {
        await el({ _filter: 'az' })._fetchPage(0);
        expect(lastSort()).toBe('title');
    });

    it('Recent requests the library-add order — the fix', async () => {
        // The heart of the report: this used to send no sort at all and then slice
        // fifty alphabetical entries off the result.
        await el({ _filter: 'recent' })._fetchPage(0);
        expect(lastSort()).toBe('added');
    });

    it('an unknown pill falls back to alphabetical rather than to nothing', async () => {
        await el({ _filter: 'nonsense' })._fetchPage(0);
        expect(lastSort()).toBe('title');
    });
});

describe('changing pill reloads only when the order really changes', () => {
    it('reloads when moving to Recent', () => {
        const host = el({ _filter: 'all' });
        const load = vi.fn(); host._load = load;
        host._setFilter('recent');
        expect(host._filter).toBe('recent');
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('does not refetch between All and A–Z — they are the same order today', () => {
        // NOT a feature: both pills map to 'title', so A–Z provably changes nothing on a
        // local library. Half the reported symptom therefore survives this fix, and this
        // case pins the consequence rather than the intent — refetching the library to
        // obtain a byte-identical list would spend the box's budget for nothing.
        //
        // What to do with the redundant pill (drop it, or turn it into an alphabet jump)
        // is an interface decision, not a bug fix; it is traced in ops/BACKLOG.md. When it
        // is taken, this case is the one to rewrite.
        const host = el({ _filter: 'all' });
        const load = vi.fn(); host._load = load;
        host._setFilter('az');
        expect(host._filter).toBe('az');
        expect(load).not.toHaveBeenCalled();
    });

    it('ignores a click on the pill already active', () => {
        const host = el({ _filter: 'recent' });
        const load = vi.fn(); host._load = load;
        host._setFilter('recent');
        expect(load).not.toHaveBeenCalled();
    });
});

describe('the client no longer reorders what the core sent', () => {
    it('hands the pages through untouched', () => {
        // Re-sorting here would order the loaded window rather than the library —
        // the defect this replaced. The order must be exactly what arrived.
        const albums = [{ title: 'Zebra' }, { title: 'Apple' }, { title: 'Mango' }];
        const host = el({ _filter: 'az', _albums: albums });
        expect(host._filtered()).toEqual(albums);
    });

    it('does not truncate Recent to a fixed head', () => {
        // `slice(0, 50)` is what made 'Recent' a subset instead of an order; with a
        // server-side sort the whole library must stay reachable by scrolling.
        const albums = Array.from({ length: 120 }, (_, i) => ({ title: `A${i}` }));
        expect(el({ _filter: 'recent', _albums: albums })._filtered()).toHaveLength(120);
    });
});

describe('Roon is not offered an order it cannot honour', () => {
    // Roon browses its own library through its own paged API: the core only ever sees the
    // window it asked for, so it cannot order the library, and Roon reports no add date.
    // The first version of this fix left the three pills there — the exact defect being
    // fixed, reproduced on another source, plus a full refetch on every toggle.
    const roon = (over = {}) => el({ sourceId: 'src_roon', zoneId: 'zone-1', ...over });

    it('sends no sort parameter', async () => {
        await roon()._fetchPage(0);
        expect(lastSort()).toBeNull();
    });

    it('renders no sort pills at all', () => {
        const host = roon();
        // render() reads them through the same chain the template uses.
        expect(host._isRoon).toBe(true);
        const out = host.render();
        const flat = JSON.stringify(out);
        expect(flat).not.toContain('Recent');
        expect(flat).not.toContain('A–Z');
    });

    it('does not refetch when a filter value changes', () => {
        const host = roon({ _filter: 'all' });
        const load = vi.fn(); host._load = load;
        host._setFilter('recent');
        expect(load).not.toHaveBeenCalled();
    });
});

describe('a page in flight cannot land in the wrong order', () => {
    it('drops a load-more that resolves after a reload', async () => {
        // Switching pill now reloads on MPD, which it did not before — so a page requested
        // under the previous sort can resolve into the new list, mixing two orders and
        // pushing _offset past albums nobody ever fetched.
        const host = el({ _filter: 'all', _albums: [{ title: 'old' }], _offset: 50, _hasMore: true });
        let release;
        apiGetMock.mockImplementationOnce(() => new Promise(r => { release = () => r([{ title: 'stale' }]); }));

        const inFlight = host._loadMore();
        host._loadToken++;                 // a reload happened while that page was open
        host._albums = [{ title: 'fresh' }];
        release();
        await inFlight;

        expect(host._albums).toEqual([{ title: 'fresh' }]);
        expect(host._offset).toBe(50);
    });

    it('keeps a load-more that resolves within its own generation', async () => {
        const host = el({ _filter: 'all', _albums: [{ title: 'a' }], _offset: 50, _hasMore: true });
        apiGetMock.mockImplementationOnce(async () => [{ title: 'b' }]);
        await host._loadMore();
        expect(host._albums.map(a => a.title)).toEqual(['a', 'b']);
        expect(host._offset).toBe(51);
    });

    it('releases the load-more gate on reload so the next page can be fetched', async () => {
        // Left latched by a stale request, infinite scroll would stop for good.
        const host = el({ _loadingMore: true });
        host._detachObserver = () => {};
        apiGetMock.mockImplementationOnce(async () => []);
        await host._load();
        expect(host._loadingMore).toBe(false);
    });
});

describe('a pill bar that scrolls says so', () => {
    // Fifteen pills where Qobuz has four: without a marker the bar cut the last label
    // in half, and the hidden scrollbar left nothing to say the strip continued.
    const bar = ({ _loading = false, ...edges } = {}) => el({
        sourceId: 'src_highresaudio',
        _hraCategories: [{ title: 'Editors Choice', label: 'Editors Choice' }],
        _filter: 'favorites',
        _loading,
        _edges: { attach() {}, ...edges },
    });

    it('offers no chevron at all while every pill fits', () => {
        const out = JSON.stringify(bar({ overflows: false }).render());
        expect(out).not.toContain('lib-filters-nav');
    });

    it('offers both chevrons as soon as pills are hidden', () => {
        // Both, from the first hidden pill on: they sit beside the bar, so dropping the
        // one that cannot move would widen the bar mid-scroll. Which of the two is inert
        // is a CSS answer, driven by the classes the controller writes.
        const out = JSON.stringify(bar({ overflows: true }).render());
        expect(out).toContain('Previous filters');
        expect(out).toContain('More filters');
    });

    it('names the chevrons after what the bar holds on every source, not just HRA', () => {
        // They serve the Qobuz, Tidal and local bars too; "categories" would have been
        // read out on a bar of sort buttons.
        const out = JSON.stringify(el({ _edges: { attach() {}, overflows: true } }).render());
        expect(out).toContain('More filters');
        expect(out).not.toContain('categories');
    });

    it('names each strip\'s chevrons after the strip they move', () => {
        // Both bars can be on screen at once; "More filters" heard twice tells a
        // screen-reader user nothing about which one moved.
        const host = bar({ overflows: true });
        const filters = JSON.stringify(host._renderPillNav(1, 'filters'));
        const genres = JSON.stringify(host._renderPillNav(1, 'genres'));
        expect(filters).toContain('More filters');
        expect(genres).toContain('More genres');
    });

    it('names a strip added later after itself, not after the filters', () => {
        // The mapping used to be a ternary with one special case, so every strip
        // added after the genres announced itself as "More filters".
        const host = bar({ overflows: true });
        expect(JSON.stringify(host._renderPillNav(1, 'playlists'))).toContain('More playlists');
        expect(JSON.stringify(host._renderPillNav(-1, 'genres'))).toContain('Previous genres');
    });

    it('keeps the chevrons out of the global tab swipe', () => {
        // They sit beside the bar, so the swipe guard's "is an ancestor scrolling
        // sideways?" walk finds nothing — the 20px they occupy used to belong to the
        // bar's own padding, which was swipe-immune by being part of the scroller.
        const out = JSON.stringify(bar({ overflows: true }).render());
        expect(out).toContain('no-swipe');
    });

    it('leaves the wrapper class alone so the markers survive a render', () => {
        // The controller writes has-left / has-right straight onto this element. Lit only
        // leaves an attribute alone when the template holds it as a static string: bind it
        // to a value and every render would wipe both markers.
        const out = JSON.stringify(bar({ overflows: true }).render());
        expect(out).toContain('class=\\"lib-filters-wrap\\"');
        expect(out).not.toContain('has-left');
    });

    it('keeps the bar up while a page loads', () => {
        // It used to be replaced by the loading line, and came back scrolled to the
        // start with the pill just chosen off-screen — invisible with four pills,
        // the normal case with fifteen.
        const out = JSON.stringify(bar({ overflows: true, _loading: true }).render());
        expect(out).toContain('lib-filters');
        expect(out).toContain('Loading');
    });
});

describe('the genre strip drills in place', () => {
    const GENRES = [{ title: 'Jazz', path: 'Jazz', subgenres: [{ title: 'Bebop', path: 'Jazz/Bebop' }] }];
    const hra = (over = {}) => el({
        sourceId: 'src_highresaudio', _hraCategories: [], _genres: GENRES, ...over,
    });

    it('shows no genre strip on any other pill', () => {
        const out = JSON.stringify(hra({ _filter: 'favorites' }).render());
        expect(out).not.toContain('"genres"');
    });

    it('shows the strip on the Genres pill, with its own data-strip name', () => {
        // The name is what tells the two strips apart: each has its own controller and
        // its own chevrons, and both carry the same classes.
        const out = JSON.stringify(hra({ _filter: 'genres' }).render());
        expect(out).toContain('"genres"');
        expect(out).toContain('Jazz');
    });

    it('offers a way back to the list once a genre is chosen', () => {
        const out = JSON.stringify(hra({ _filter: 'genres', _genre: 'Jazz/Bebop' }).render());
        expect(out).toContain('← ');
        expect(out).toContain('Bebop');
    });

    it('says to choose a genre rather than reporting no albums', () => {
        const out = JSON.stringify(hra({ _filter: 'genres', _albums: [] }).render());
        expect(out).toContain('Choose a genre');
        expect(out).not.toContain('No albums found');
    });
});
