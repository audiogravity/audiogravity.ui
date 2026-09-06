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
