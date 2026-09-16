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
    SOURCE_MARKS: {},
    // Only the rows these tests reason about. The page reads `group` off this
    // table for both halves of the banner's question — what plays, and what the
    // screen shows — so an empty one would collapse every group onto its id.
    SOURCE_META: {
        src_mpd:   { label: 'Local Library', group: 'mpd'   },
        src_radio: { label: 'Radio',         group: 'radio' },
        src_qobuz: { label: 'Qobuz',         group: 'qobuz' },
        // Roon answers under two ids that collapse to one group — the very case the
        // refusal has to survive, so the table must carry both.
        'src_mono-sgen': { label: 'Roon',    group: 'roon'  },
        src_roon:        { label: 'Roon',    group: 'roon'  },
    },
    normalizeSearchSources: (raw) => raw ?? [],
    resolvePlayingSource: vi.fn(() => null),
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
const { getSnapshot, getRoonZones } = await import('../../library-store.js');
const { resolvePlayingSource } = await import('../library-constants.js');

function makeEl(overrides = {}) {
    return Object.assign(Object.create(AgLibraryPage.prototype), {
        _sourceId: 'src_mpd', _view: 'browse', _artistId: '', _artistName: '',
        _upnpServers: [], _sources: [],
        // The banner reads the LAST KNOWN source list, which a mounted page always
        // has: one state event in three carries none of its own.
        _rawSources: [
            { source_id: 'src_mpd',        selectable: true },
            { source_id: 'src_radio',      selectable: true },
            { source_id: 'src_qobuz',      selectable: true },
            { source_id: 'src_mono-sgen',  selectable: true },
            { source_id: 'src_roon',       selectable: true },
        ],
        _pendingSource: null, _dismissedGroup: null,
        _zoneId: '', _zoneDisplayName: '', _upnpLocation: '', _upnpName: '',
        _refreshBrowse: vi.fn(),
        ...overrides,
    });
}

/**
 * Value bound to `attr` on the first `<tag` found in the mocked `html` tree.
 * Lit puts a tag and the attribute that follows it in the SAME static string, so
 * the bound value is the interpolation at that string's index.
 *
 * @param {unknown} node - A {strings, values} node, or an array of them.
 * @param {string} tag - Element name, without the angle bracket.
 * @param {string} attr - Attribute name.
 * @returns {unknown} The bound value, or undefined when not found.
 */
function attrValue(node, tag, attr) {
    if (Array.isArray(node)) {
        for (const n of node) {
            const v = attrValue(n, tag, attr);
            if (v !== undefined) return v;
        }
        return undefined;
    }
    if (!node || typeof node !== 'object' || !node.strings) return undefined;
    for (let i = 0; i < node.strings.length; i++) {
        const s = node.strings[i];
        if (typeof s === 'string' && s.includes(`<${tag}`) && s.trimEnd().endsWith(`${attr}=`)) {
            return node.values[i];
        }
    }
    for (const v of node.values ?? []) {
        const found = attrValue(v, tag, attr);
        if (found !== undefined) return found;
    }
    return undefined;
}

/**
 * The @click handler of the button whose label follows it in the template.
 * Lit puts `@click=` at the end of one static string and the label at the start of
 * the next, so the handler is the interpolation between them.
 *
 * @param {unknown} node - A {strings, values} node, or an array of them.
 * @param {string} label - Text inside the button.
 * @returns {Function|undefined}
 */
function handlerFor(node, label) {
    if (Array.isArray(node)) {
        for (const n of node) {
            const f = handlerFor(n, label);
            if (f) return f;
        }
        return undefined;
    }
    if (!node || typeof node !== 'object' || !node.strings) return undefined;
    for (let i = 0; i < node.strings.length - 1; i++) {
        const before = node.strings[i];
        const after = node.strings[i + 1];
        if (typeof before === 'string' && before.includes('<button')
            && before.trimEnd().endsWith('@click=')
            && typeof after === 'string' && after.includes(label)
            && typeof node.values[i] === 'function') {
            return node.values[i];
        }
    }
    for (const v of node.values ?? []) {
        const f = handlerFor(v, label);
        if (f) return f;
    }
    return undefined;
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
              location: 'http://10.0.0.42:9791/desc.xml' },
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

describe('ag-library-page — adopting the source the CONTENT comes from', () => {
    /*
     * A station, a Qobuz album and a UPnP stream all travel over MPD, so the
     * snapshot's `source_id` reads `src_mpd` for the three of them while
     * `content_source_id` names the source each came from. This was the ONE
     * writer of _sourceId reading the transport, and the banner below compares at
     * the content level: the two halves of one screen answered "which source?"
     * off two different fields, and a reader sitting on the radio screen was
     * offered a switch to the radio.
     */
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
    });

    it('adopts the content source, not the transport carrying it', async () => {
        // Shaped like the box's own answer, measured while a station played: the
        // radio is a listed, selectable pipeline node, and the MPD entry carrying it
        // names it in content_source_id.
        getSnapshot.mockResolvedValue({
            source_id: 'src_mpd', content_source_id: 'src_radio',
            sources: [
                { source_id: 'src_mpd',   kind: 'library', selectable: true,
                  content_source_id: 'src_radio' },
                { source_id: 'src_radio', kind: 'radio',   selectable: true },
            ],
        });
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _view: 'browse' });
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_radio');
        // ...and the view mapping is re-applied for the source just adopted.
        expect(el._view).toBe('radio');
    });

    it('takes the transport when nothing names a content source', async () => {
        // Nothing playing: the core builds its state with no origin and no content
        // source, and the resolver hands the transport back. Same as before.
        getSnapshot.mockResolvedValue({
            source_id: 'src_mpd',
            sources: [{ source_id: 'src_mpd', kind: 'library', selectable: true }],
        });
        resolvePlayingSource.mockReturnValue({ id: 'src_mpd', group: 'mpd', label: 'Local Library' });

        const el = makeEl({ _sourceId: '' });
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_mpd');
    });

    it('leaves the source alone when HQPlayer is driven from elsewhere', async () => {
        // The core answers no content source under external control, so the
        // fallback hands back a routing handle — which is no source to browse.
        getSnapshot.mockResolvedValue({ source_id: 'src_hqplayer' });
        resolvePlayingSource.mockReturnValue({ id: 'src_hqplayer', group: 'src_hqplayer', label: 'HQPlayer' });

        const el = makeEl({ _sourceId: 'src_qobuz' });
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_qobuz');
    });

    it('opens the media server a UPnP stream comes from', async () => {
        // The server is browsed by ADDRESS and no player state carries one, so it
        // is fetched — the same path the banner's Switch takes.
        getSnapshot.mockResolvedValue({ source_id: 'src_mpd' });
        resolvePlayingSource.mockReturnValue({ id: 'upnp:uuid:x', group: 'upnp:uuid:x', label: 'Music Library' });
        apiGet.mockResolvedValue([
            { id: 'upnp:uuid:x', friendly_name: 'Music Library',
              location: 'http://10.0.0.42:9791/desc.xml' },
        ]);

        const el = makeEl();
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('upnp:uuid:x');
        expect(el._upnpLocation).toBe('http://10.0.0.42:9791/desc.xml');
        expect(el._view).toBe('upnp-browser');
    });

    it('falls back to the transport when that server is no longer known', async () => {
        // Adopting a udn with no address renders a blank browser; the engine
        // carrying the stream at least shows something.
        getSnapshot.mockResolvedValue({ source_id: 'src_mpd' });
        resolvePlayingSource.mockReturnValue({ id: 'upnp:uuid:gone', group: 'upnp:uuid:gone', label: 'UPnP' });
        apiGet.mockResolvedValue([]);

        const el = makeEl();
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_mpd');
        expect(el._view).toBe('browse');
    });
});

describe('ag-library-page — the banner speaks only for a source the screen is NOT showing', () => {
    /*
     * The radio screen is reached from the tab bar WITHOUT changing the browsed
     * source (_onTabChange moves the view alone), and starting a station there
     * tells nobody — ag-library-radio just plays it. So _sourceId can still name
     * the local library while the reader looks squarely at the radio.
     */
    beforeEach(() => vi.clearAllMocks());

    const event = { source_id: 'src_mpd', sources: [] };

    it('stays silent on the radio screen while a station plays', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _sourceId: 'src_mpd', _view: 'radio' });
        el._onPlayerState(event);

        expect(el._pendingSource).toBeNull();
    });

    it('still speaks on the radio screen when something else plays', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_qobuz', group: 'qobuz', label: 'Qobuz' });

        const el = makeEl({ _sourceId: 'src_mpd', _view: 'radio' });
        el._onPlayerState(event);

        expect(el._pendingSource).toEqual({ id: 'src_qobuz', name: 'Qobuz' });
    });

    it('speaks when a station plays and the reader browses the local library', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _sourceId: 'src_mpd', _view: 'browse' });
        el._onPlayerState(event);

        expect(el._pendingSource).toEqual({ id: 'src_radio', name: 'Radio Choco HD' });
    });
});

describe('ag-library-page — a dismissed banner stays dismissed', () => {
    /*
     * The core republishes the player state about every three seconds while
     * something plays (measured on the box: three events in ten seconds). A
     * refusal that lived only in _pendingSource was undone by the next one, so
     * Dismiss did nothing at all.
     */
    beforeEach(() => vi.clearAllMocks());

    const event = { source_id: 'src_mpd', sources: [] };

    it('remembers which source was refused', () => {
        const el = makeEl({ _pendingSource: { id: 'src_radio', name: 'Radio Choco HD' } });

        el._dismissBanner();

        expect(el._pendingSource).toBeNull();
        expect(el._dismissedGroup).toBe('radio');
    });

    it('does not raise the banner again for that source', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _view: 'browse', _dismissedGroup: 'radio' });
        el._onPlayerState(event);

        expect(el._pendingSource).toBeNull();
    });

    it('lets the refusal lapse once another source plays', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_qobuz', group: 'qobuz', label: 'Qobuz' });

        const el = makeEl({ _view: 'browse', _dismissedGroup: 'radio' });
        el._onPlayerState(event);

        expect(el._pendingSource).toEqual({ id: 'src_qobuz', name: 'Qobuz' });
        expect(el._dismissedGroup).toBeNull();
    });

    it('forgets the refusal when the screen catches up with what plays', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _sourceId: 'src_radio', _view: 'radio', _dismissedGroup: 'radio' });
        el._onPlayerState(event);

        expect(el._dismissedGroup).toBeNull();
    });
});

describe('ag-library-page — what a review caught in the first fix', () => {
    /*
     * Four defects, each with a test that fails without its fix:
     *   1. opening a media server from a plain state refresh yanked the reader off
     *      the screen they were working on;
     *   2. the radio screen REPLACED the browsed source instead of adding to it;
     *   3. the non-source guard named HQPlayer alone, so an externally driven
     *      renderer was adopted as a source nobody can browse;
     *   4. the refusal was pinned to an id where everything else compares groups.
     */
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
    });

    it('a sources-changed refresh never opens a media server', async () => {
        // The account cards that fire sources-changed live ON the sources screen:
        // signing into Qobuz while a UPnP stream plays must not throw the reader
        // into a media browser mid-task.
        getSnapshot.mockResolvedValue({ source_id: 'src_mpd' });
        resolvePlayingSource.mockReturnValue({ id: 'upnp:uuid:x', group: 'upnp:uuid:x', label: 'Music Library' });
        apiGet.mockResolvedValue([
            { id: 'upnp:uuid:x', friendly_name: 'Music Library',
              location: 'http://10.0.0.42:9791/desc.xml' },
        ]);

        const el = makeEl({ _view: 'library' });
        await el._syncActiveSource({ force: true });

        expect(el._view).toBe('library');
        expect(el._sourceId).toBe('src_mpd');
    });

    it('stays silent on the radio screen while the browsed library plays', () => {
        // Reading the radio screen while your own library plays is ordinary. The
        // radio ADDS to what the screen shows; answering "radio" alone here offered
        // a switch to the library already being browsed.
        resolvePlayingSource.mockReturnValue({ id: 'src_mpd', group: 'mpd', label: 'Local Library' });

        const el = makeEl({ _sourceId: 'src_mpd', _view: 'radio' });
        el._onPlayerState({ source_id: 'src_mpd', sources: [] });

        expect(el._pendingSource).toBeNull();
    });

    it('does not adopt a renderer driven from outside', async () => {
        // The core publishes a routing handle `selectable: false`, and names no
        // content source under external control — so the fallback hands one back.
        getSnapshot.mockResolvedValue({
            source_id: 'upnp_renderer',
            sources: [{ source_id: 'upnp_renderer', selectable: false }],
        });
        resolvePlayingSource.mockReturnValue({ id: 'upnp_renderer', group: 'upnp_renderer', label: 'Renderer' });

        const el = makeEl({ _sourceId: 'src_qobuz' });
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_qobuz');
    });

    it('keeps a refusal across Roon\'s two ids for one source', () => {
        // `src_roon` is a documented alias of the `src_mono-sgen` node, so a refusal
        // pinned to an id is undone the moment the core names the other one. Driven
        // through the button, not by setting the refusal by hand — pinning it here
        // would pass against an id-keyed refusal too, i.e. against the regression
        // this claims to guard.
        const el = makeEl({ _view: 'browse',
                            _pendingSource: { id: 'src_mono-sgen', name: 'Roon' } });
        el._dismissBanner();
        expect(el._dismissedGroup).toBe('roon');

        resolvePlayingSource.mockReturnValue({ id: 'src_roon', group: 'roon', label: 'Roon' });
        el._onPlayerState({ source_id: 'src_roon', sources: [] });

        expect(el._pendingSource).toBeNull();
    });
});

describe('ag-library-page — what the second review caught', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
    });

    it('hands the OUTPUTS view the transport, never the content source', async () => {
        // ag-library-outputs turns what it is given into a steering service name, so
        // `src_qobuz` posted {service:'qobuz'} to /steering/switch-output — a service
        // the core does not know, and the switch failed.
        getSnapshot.mockResolvedValue({
            source_id: 'src_mpd',
            sources: [
                { source_id: 'src_mpd',   kind: 'library',   selectable: true },
                { source_id: 'src_qobuz', kind: 'streaming', selectable: true },
            ],
        });
        resolvePlayingSource.mockReturnValue({ id: 'src_qobuz', group: 'qobuz', label: 'Qobuz' });

        const el = makeEl();
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_qobuz');      // what the reader browses
        expect(el._outputsSourceId).toBe('src_mpd');     // what the outputs view steers
    });

    it('a live state never overwrites what the outputs view was given', () => {
        // An SSE lands every three seconds: writing there erased the reader's own
        // pick (Roon → roonbridge) before they could reach the Outputs button.
        resolvePlayingSource.mockReturnValue({ id: 'src_qobuz', group: 'qobuz', label: 'Qobuz' });

        const el = makeEl({ _sourceId: 'src_mono-sgen', _outputsSourceId: 'src_mono-sgen' });
        el._onPlayerState({ source_id: 'src_mpd', sources: [] });

        expect(el._outputsSourceId).toBe('src_mono-sgen');
    });

    it('does not fall back onto a handle when the media server is unknown', async () => {
        // A UPnP stream pushed to HQPlayer names the server as content and the handle
        // as transport; falling back blind re-adopted what the guard just refused.
        getSnapshot.mockResolvedValue({
            source_id: 'src_hqplayer',
            sources: [{ source_id: 'src_hqplayer', selectable: false }],
        });
        resolvePlayingSource.mockReturnValue({ id: 'upnp:uuid:gone', group: 'upnp:uuid:gone', label: 'UPnP' });
        apiGet.mockResolvedValue([]);

        const el = makeEl({ _sourceId: 'src_mpd' });
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_mpd');
    });

    it('adopts the radio when the reader starts a station by hand', () => {
        // Otherwise the radio was only what the VIEW showed: stepping off it put the
        // banner back, offering a switch to the station just started by hand.
        const el = makeEl({ _sourceId: 'src_mpd', _view: 'radio' });

        el._onRadioStarted();

        expect(el._sourceId).toBe('src_radio');
        expect(el._view).toBe('radio');
    });

    it('stays silent after that, once the reader steps off the radio screen', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _sourceId: 'src_mpd', _view: 'radio' });
        el._onRadioStarted();
        el._onTabChange({ detail: { tab: 'queue' } });
        el._onPlayerState({ source_id: 'src_mpd', sources: [] });

        expect(el._view).toBe('queue');
        expect(el._pendingSource).toBeNull();
    });
});

describe('ag-library-page — the outputs view is bound to the transport', () => {
    it('the template hands ag-library-outputs the transport, not the browsed source', () => {
        // Asserting the field alone would pass against a template still binding
        // _sourceId — which IS the defect. So the binding itself is read.
        const el = makeEl({ _sourceId: 'src_qobuz', _outputsSourceId: 'src_mpd' });

        expect(attrValue(el.render(), 'ag-library-outputs', 'source-id')).toBe('src_mpd');
    });

    it('falls back to the browsed source before any state has arrived', () => {
        const el = makeEl({ _sourceId: 'src_mpd', _outputsSourceId: '' });

        expect(attrValue(el.render(), 'ag-library-outputs', 'source-id')).toBe('src_mpd');
    });
});

describe('ag-library-page — what the third review caught', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
    });

    it('picking Roon steers roonbridge, not the engine of whatever plays', () => {
        // ag-library-outputs maps src_mono-sgen → roonbridge; handing it the
        // transport of what happens to play would post {service:'mpd'} and rewrite
        // MPD's ALSA output instead of transferring the Roon zone.
        const el = makeEl({ _outputsSourceId: 'src_mpd' });

        el._onSourceChange({ detail: { sourceId: 'src_mono-sgen', zoneId: 'z1' } });

        expect(attrValue(el.render(), 'ag-library-outputs', 'source-id')).toBe('src_mono-sgen');
    });

    it('the same holds when the zone has to be fetched first', async () => {
        getRoonZones.mockResolvedValue([{ zone_id: 'z1', display_name: 'Salon' }]);
        const el = makeEl({ _outputsSourceId: 'src_mpd' });

        await el._fetchRoonZoneAndSwitch('src_mono-sgen');

        expect(el._outputsSourceId).toBe('src_mono-sgen');
    });

    it('a refresh does not replace the media server the reader is browsing', async () => {
        // sources-changed fires from the account cards while a UPnP stream plays:
        // overwriting upnp:X with the engine sent the reader's own browser back to
        // the local grid, and then offered a switch to the server they had left.
        getSnapshot.mockResolvedValue({
            source_id: 'src_mpd',
            sources: [{ source_id: 'src_mpd', selectable: true }],
        });
        resolvePlayingSource.mockReturnValue({ id: 'upnp:uuid:x', group: 'upnp:uuid:x', label: 'Music Library' });

        const el = makeEl({ _sourceId: 'upnp:uuid:x', _view: 'upnp-browser',
                            _outputsSourceId: 'src_mono-sgen' });
        await el._syncActiveSource({ force: true });

        expect(el._sourceId).toBe('upnp:uuid:x');
        expect(el._view).toBe('upnp-browser');
        // ...and the reader's Roon pick for the outputs view survives it too.
        expect(el._outputsSourceId).toBe('src_mono-sgen');
    });

});

describe('ag-library-page — what the fourth review caught', () => {
    beforeEach(() => vi.clearAllMocks());

    it('a glance at the radio screen does not undo a Dismiss', () => {
        // _shownGroups adds the radio group for the radio VIEW. Clearing the refusal
        // on that match brought the dismissed banner back ~3 s after stepping away.
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _sourceId: 'src_mpd', _view: 'radio', _dismissedGroup: 'radio' });
        el._onPlayerState({ source_id: 'src_mpd', sources: [] });
        expect(el._dismissedGroup).toBe('radio');

        el._onTabChange({ detail: { tab: 'browse' } });
        el._onPlayerState({ source_id: 'src_mpd', sources: [] });

        expect(el._pendingSource).toBeNull();
    });

    it('the refusal still lapses when the browsed source catches up', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _sourceId: 'src_radio', _view: 'radio', _dismissedGroup: 'radio' });
        el._onPlayerState({ source_id: 'src_mpd', sources: [] });

        expect(el._dismissedGroup).toBeNull();
    });
});

describe('ag-library-page — what the fifth review caught', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
        document.querySelector = () => null;
    });

    it('the fullscreen Switch moves the outputs view, not the browsed source', async () => {
        // It hands over state.source_id — a TRANSPORT. Writing it into _sourceId
        // turned an adopted src_radio back into src_mpd, and the next state re-raised
        // the very banner this page suppresses.
        const el = makeEl({ _sourceId: 'src_radio', _view: 'radio' });

        await el._onLibGoto({ detail: { view: 'outputs', source_id: 'src_mpd' } });

        expect(el._sourceId).toBe('src_radio');
        expect(el._outputsSourceId).toBe('src_mpd');
        expect(el._view).toBe('outputs');
    });

    it('and the banner stays silent afterwards', () => {
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });
        const el = makeEl({ _sourceId: 'src_radio', _view: 'radio' });

        el._onLibGoto({ detail: { view: 'outputs', source_id: 'src_mpd' } });
        el._onPlayerState({ source_id: 'src_mpd', sources: [] });

        expect(el._pendingSource).toBeNull();
    });

    it('picking a media server moves the outputs view off the previous pick', () => {
        // Left behind, a stale Roon id moves the Roon zone's output and reports
        // success — worse than the visible failure an unknown service gives.
        const el = makeEl({ _sourceId: 'src_mono-sgen', _outputsSourceId: 'src_mono-sgen' });

        el._onSourceChange({ detail: { sourceId: 'upnp:uuid:x', location: 'http://x/d.xml',
                                       serverName: 'Music Library' } });

        expect(el._outputsSourceId).toBe('upnp:uuid:x');
    });

    it('same when the banner opens that server', async () => {
        apiGet.mockResolvedValue([
            { id: 'upnp:uuid:x', friendly_name: 'Music Library',
              location: 'http://10.0.0.42:9791/desc.xml' },
        ]);
        const el = makeEl({ _outputsSourceId: 'src_mono-sgen' });

        await el._fetchUpnpServerAndSwitch('upnp:uuid:x');

        expect(el._outputsSourceId).toBe('upnp:uuid:x');
    });
});

describe('ag-library-page — what the sixth review caught', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
    });

    it('a refresh refreshes the source list and adopts nothing', async () => {
        // sources-changed fires from the account cards on the sources screen. Adopting
        // there moved the reader off what they were browsing — onto the radio screen
        // when a station happened to play.
        getSnapshot.mockResolvedValue({
            source_id: 'src_mpd',
            sources: [
                { source_id: 'src_mpd',   selectable: true },
                { source_id: 'src_radio', selectable: true },
            ],
        });
        resolvePlayingSource.mockReturnValue({ id: 'src_radio', group: 'radio', label: 'Radio Choco HD' });

        const el = makeEl({ _sourceId: 'src_qobuz', _view: 'browse',
                            _outputsSourceId: 'src_mono-sgen' });
        await el._syncActiveSource({ force: true });

        expect(el._sourceId).toBe('src_qobuz');
        expect(el._view).toBe('browse');
        expect(el._outputsSourceId).toBe('src_mono-sgen');
        expect(el._rawSources).toHaveLength(2);   // the list DID refresh
    });

    it('the banner never offers a routing handle', () => {
        // Under external control the core names no content source, so the resolver
        // hands back the handle: the banner offered "HQPlayer is now playing", and
        // its Switch adopted src_hqplayer as the source to browse.
        resolvePlayingSource.mockReturnValue({ id: 'src_hqplayer', group: 'src_hqplayer', label: 'HQPlayer' });

        const el = makeEl({
            _sourceId: 'src_mpd', _view: 'browse',
            _rawSources: [{ source_id: 'src_hqplayer', protocol: 'hqplayer', selectable: false }],
        });
        el._onPlayerState({ source_id: 'src_hqplayer' });

        expect(el._pendingSource).toBeNull();
    });
});

describe('ag-library-page — what the seventh review caught', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
    });

    it('reads the address under the name the endpoint actually answers', async () => {
        // The route renames the persisted model's `last_location` to `location` on
        // the way out (API.md says so, and the box confirms it). Reading the internal
        // name left every lookup address-less, and an empty address is a valid miss —
        // so it failed silently.
        apiGet.mockResolvedValue([
            { id: 'upnp:uuid:x', friendly_name: 'Music Library',
              location: 'http://10.0.0.42:9791/desc.xml' },
        ]);
        const el = makeEl({ _sources: [] });

        const opened = await el._fetchUpnpServerAndSwitch('upnp:uuid:x');

        expect(opened).toBe(true);
        expect(el._upnpLocation).toBe('http://10.0.0.42:9791/desc.xml');
    });

    it('degrades to the transport against a core that predates content_source_id', async () => {
        // The resolver then falls back to a local table naming src_qobuz, while
        // sources[] still lists only src_mpd. _syncActiveSource is the ONLY writer of
        // _sourceId, so refusing outright left the library on "Select a source".
        getSnapshot.mockResolvedValue({
            source_id: 'src_mpd',
            sources: [{ source_id: 'src_mpd', selectable: true }],
        });
        resolvePlayingSource.mockReturnValue({ id: 'src_qobuz', group: 'qobuz', label: 'Qobuz' });

        const el = makeEl({ _sourceId: '' });
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_mpd');
    });

    it('still refuses when the transport is a handle too', async () => {
        getSnapshot.mockResolvedValue({
            source_id: 'src_hqplayer',
            sources: [{ source_id: 'src_hqplayer', selectable: false }],
        });
        resolvePlayingSource.mockReturnValue({ id: 'src_hqplayer', group: 'src_hqplayer', label: 'HQPlayer' });

        const el = makeEl({ _sourceId: 'src_mpd' });
        await el._syncActiveSource({ navigate: true });

        expect(el._sourceId).toBe('src_mpd');
    });

    it('the banner Switch leaves the outputs view where it was', () => {
        // The banner names what is ALREADY playing, so the engine feeding the DAC has
        // not moved; writing the content id there sent Outputs an unknown service.
        // Driven through the button's own handler — asserting on an untouched field
        // would pass whatever the handler does.
        const el = makeEl({ _sourceId: 'src_mpd', _outputsSourceId: 'src_mpd',
                            _pendingSource: { id: 'src_qobuz', name: 'Qobuz' } });

        const onSwitch = handlerFor(el.render(), 'Switch');
        expect(onSwitch).toBeTypeOf('function');
        onSwitch();

        expect(el._sourceId).toBe('src_qobuz');        // the browse DID follow
        expect(el._outputsSourceId).toBe('src_mpd');   // the engine did not
    });

    it('and the Dismiss button next to it still records the refusal', () => {
        const el = makeEl({ _pendingSource: { id: 'src_qobuz', name: 'Qobuz' } });

        handlerFor(el.render(), 'Dismiss')();

        expect(el._pendingSource).toBeNull();
        expect(el._dismissedGroup).toBe('qobuz');
    });
});
