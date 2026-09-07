/**
 * Unit tests for ag-library-page — navigation and the sources-changed funnel.
 *
 * Logic-only (no DOM mount): lit and the page's imports are mocked, then the
 * handlers are exercised on a bare instance. What these pin:
 *
 *   - the 'browse'→'upnp-browser' and 'browse'→'radio' mappings have ONE home
 *     (_setView). The UPnP one used to be written twice and the tab-bar copy
 *     diverged from _navigate's; the radio one arrived written three times;
 *   - a tab switch stays free — the browse keeps its grid and scroll;
 *   - sources-changed reloads the browse. The browse stays mounted across tabs
 *     (the views only toggle a class), so nothing else re-asks it what the
 *     account may do — an HRA sign-in on the sources view left it offering what
 *     the PREVIOUS account could, however the reader came back to it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
// apiPost answers a promise: the handlers attach a .catch to it, so a mock
// returning undefined fails on the call rather than on what is asserted.
vi.mock('../../api.js', () => ({
    apiGet: vi.fn(async () => []), apiPost: vi.fn(async () => ({})),
}));
vi.mock('../../library-store.js', () => ({
    getSnapshot: vi.fn(async () => null),
    getRoonZones: vi.fn(async () => []),
    subscribePlayerState: vi.fn(() => () => {}),
}));
vi.mock('../library-constants.js', () => ({
    SOURCE_MARKS: {}, SOURCE_META: {},
    normalizeSearchSources: (raw) => raw ?? [],
    resolvePlayingSource: () => null,
}));
vi.unmock('../../ag-icons.js');
vi.mock('../molecules/ag-lib-tabbar.js', () => ({}));
vi.mock('./ag-library-browse.js', () => ({}));
vi.mock('./ag-library-outputs.js', () => ({}));
vi.mock('./ag-library-queue.js', () => ({}));
vi.mock('./ag-library-radio.js', () => ({}));
vi.mock('./ag-library-roon-browser.js', () => ({}));
vi.mock('./ag-library-search.js', () => ({}));
vi.mock('./ag-library-sources.js', () => ({}));
vi.mock('./ag-library-upnp-browser.js', () => ({}));

const { AgLibraryPage } = await import('./ag-library-page.js');
// The mocked module, to assert what the page asked of it.
const { apiGet, apiPost } = await import('../../api.js');

function makeEl(overrides = {}) {
    return Object.assign(Object.create(AgLibraryPage.prototype), {
        _sourceId: 'src_mpd', _view: 'browse', _artistId: '', _artistName: '',
        _upnpServers: [],
        _refreshBrowse: vi.fn(),
        ...overrides,
    });
}

describe('ag-library-page — one home for the view mapping', () => {
    it('the tab bar and _navigate agree on where "browse" goes for a UPnP source', () => {
        const viaTab = makeEl({ _sourceId: 'upnp:minim' });
        viaTab._onTabChange({ detail: { tab: 'browse' } });
        const viaNavigate = makeEl({ _sourceId: 'upnp:minim' });
        viaNavigate._navigate('browse');
        expect(viaTab._view).toBe('upnp-browser');
        expect(viaTab._view).toBe(viaNavigate._view);
    });

    it('every path that opens the radio goes through that same home', () => {
        // The radio arrived with its mapping written three times — in _setView,
        // in the source picker, and in the banner's Switch button — in a file
        // whose test header records that this exact duplication already diverged
        // once for UPnP. All three must now answer identically.
        const viaTab = makeEl({ _sourceId: 'src_radio' });
        viaTab._onTabChange({ detail: { tab: 'browse' } });

        const viaPicker = makeEl({ _sourceId: 'src_mpd' });
        viaPicker._onSourceChange({ detail: { sourceId: 'src_radio' } });

        const viaNavigate = makeEl({ _sourceId: 'src_radio' });
        viaNavigate._navigate('browse');

        expect(viaTab._view).toBe('radio');
        expect(viaPicker._view).toBe('radio');
        expect(viaNavigate._view).toBe('radio');
    });

    it('an unknown tab lands on the browse rather than nowhere', () => {
        const el = makeEl();
        el._onTabChange({ detail: { tab: 'someday-a-new-tab' } });
        expect(el._view).toBe('browse');
    });

    it('a tab switch does not reload the browse — it keeps its grid and its scroll', () => {
        const el = makeEl();
        el._onTabChange({ detail: { tab: 'queue' } });
        el._onTabChange({ detail: { tab: 'browse' } });
        expect(el._refreshBrowse).not.toHaveBeenCalled();
    });

    it('_navigate still reloads the browse — its callers arrive with a reason to', () => {
        const el = makeEl();
        el._navigate('browse');
        expect(el._refreshBrowse).toHaveBeenCalledTimes(1);
    });

    it('_navigate reloads without asking the core to walk the source again', () => {
        // Two different costs behind one verb. A reload reads the album list the core
        // already holds; a refresh makes it re-enumerate MPD, one round trip per album
        // (0.19 s for 475 albums, measured). Arriving on the browse is not a request
        // for fresh data — the cached list expires on its own.
        const el = makeEl();
        el._navigate('browse');
        expect(el._refreshBrowse).toHaveBeenCalledWith();
    });

    it('the ↻ button is the one caller that does ask for it', () => {
        // Driven through the rendered button, so a template that stopped passing the
        // flag is caught here — but through THAT button's own handler, found by the
        // label beside it. Calling every function in the tree would fire _navigate,
        // _onTabChange and a global np-expand event, and then any caller passing true
        // would satisfy the assertion, which is not what this claims to pin.
        const el = makeEl({ _sources: [], _upnpServers: [], _view: 'browse' });
        const calls = [];
        el._refreshBrowse = (...args) => calls.push(args);

        /** Depth-first walk of the mocked `html` tree: {strings, values}. */
        const handlerNextTo = (node, label) => {
            if (Array.isArray(node)) {
                for (const n of node) { const f = handlerNextTo(n, label); if (f) return f; }
                return null;
            }
            if (!node || typeof node !== 'object' || !node.strings) return null;
            const owns = node.strings.some(s => typeof s === 'string' && s.includes(label));
            if (owns) {
                // The click handler is the value that sits in the interpolation just
                // before the label's own string, and it is the only function there.
                const fn = node.values.find(v => typeof v === 'function');
                if (fn) return fn;
            }
            for (const v of node.values ?? []) {
                const f = handlerNextTo(v, label);
                if (f) return f;
            }
            return null;
        };

        const onClick = handlerNextTo(el.render(), 'aria-label="Refresh library"');
        expect(onClick, 'the Refresh button is not in this render').toBeTypeOf('function');
        onClick();
        expect(calls).toEqual([[{ refresh: true }]]);
    });

    it('the ↻ handler ignores an event handed to it as its argument', () => {
        // `@click=${this._refreshBrowse}` is the shorthand used three lines away for
        // _onTabChange and _onSourceChange. With a positional boolean, that binding
        // would pass a PointerEvent — truthy — and quietly re-enumerate the library.
        const browse = { _load: vi.fn() };
        // The factory stubs _refreshBrowse for every other case here; this one is about
        // the real method, so it is put back.
        const el = makeEl({
            _refreshBrowse: AgLibraryPage.prototype._refreshBrowse,
            updateComplete: Promise.resolve(),
            querySelector: () => browse,
        });
        el._refreshBrowse(new Event('click'));
        return el.updateComplete.then(() => {
            expect(browse._load).toHaveBeenCalledWith({ refresh: false });
        });
    });

    it('a tab switch leaves artist mode', () => {
        const el = makeEl({ _artistId: 'x', _artistName: 'X' });
        el._onTabChange({ detail: { tab: 'search' } });
        expect(el._artistId).toBe('');
        expect(el._view).toBe('search');
    });
});

describe('ag-library-page — the sources-changed funnel', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reloads the browse when the source list changes — the one signal an account change sends', async () => {
        const el = makeEl({
            _syncActiveSource: vi.fn(async () => {}),
            _loadUpnpServers: vi.fn(async () => {}),
        });
        await el._onSourcesChanged();
        expect(el._refreshBrowse).toHaveBeenCalledTimes(1);
    });

    it('after the source list is current, so the browse reads the new state, not the old', async () => {
        const order = [];
        const el = makeEl({
            _syncActiveSource: vi.fn(async () => order.push('sync')),
            _loadUpnpServers: vi.fn(async () => {}),
            _refreshBrowse: vi.fn(() => order.push('refresh')),
        });
        await el._onSourcesChanged();
        expect(order).toEqual(['sync', 'refresh']);
    });
});

describe('ag-library-page — switching to a media server from the banner', () => {
    /*
     * The banner names the source that is playing, and since the backend answers
     * `content_source_id`, that source can be a UPnP server (`upnp:<udn>`). A
     * server is not a pipeline source: it is browsed by ADDRESS and nothing is
     * posted to /player/source for it. The normal path gets that address from the
     * picker's event; the banner has not got it, so it fetches it — and taking the
     * ordinary branch instead would set a udn as the source id, render an
     * address-less browser (a blank page) and post a udn the core would store as
     * its active node.
     */
    beforeEach(() => vi.clearAllMocks());

    it('fetches the address and opens the browser, without posting a source', async () => {
        const el = makeEl({ _sources: [], _upnpLocation: '', _upnpName: '' });
        apiGet.mockResolvedValue([
            { id: 'upnp:uuid:x', friendly_name: 'Music Library',
              last_location: 'http://10.0.0.42:9791/desc.xml' },
        ]);

        await el._fetchUpnpServerAndSwitch('upnp:uuid:x');

        expect(apiGet).toHaveBeenCalledWith('/library/upnp-known-servers');
        expect(el._sourceId).toBe('upnp:uuid:x');
        expect(el._upnpLocation).toBe('http://10.0.0.42:9791/desc.xml');
        expect(el._upnpName).toBe('Music Library');
        expect(el._view).toBe('upnp-browser');
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('leaves the view alone when the server is no longer known', async () => {
        // An address-less browser renders a blank page; not switching says more.
        const el = makeEl({ _sources: [], _view: 'browse', _upnpLocation: '' });
        apiGet.mockResolvedValue([]);

        await el._fetchUpnpServerAndSwitch('upnp:uuid:gone');

        expect(el._view).toBe('browse');
        expect(el._sourceId).toBe('src_mpd');
        expect(apiPost).not.toHaveBeenCalled();
    });
});
