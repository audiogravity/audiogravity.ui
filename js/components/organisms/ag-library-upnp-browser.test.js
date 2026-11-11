/**
 * Unit tests for ag-library-upnp-browser.js — the media server browser.
 *
 * What it could not do (user, 2026-11-11, MinimServer "Music Library"): play an album
 * whole — an album row only opened, and a track tapped inside it played alone, the album
 * stopping after it — nor reach a level's entries past the first 200: "474 albums"
 * showed 200, the last one "IRM". The core API is mocked; the rows are the real ones.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet }));

const lib = vi.hoisted(() => ({
    upnpPlay: vi.fn(),
    queueItem: vi.fn(),
    queueWithFeedback: vi.fn(),
    playWithFeedback: vi.fn(),
}));
vi.mock('../../library-api.js', () => lib);

import { PAGE_SIZE, AUTO_LOAD_ROWS } from './ag-library-upnp-browser.js';

const SERVER = 'upnp:uuid:a3f9b925';
const LOCATION = 'http://10.0.0.42:9791/a3f9b925/Upnp/device.xml';

const ALBUM = {
    id: '0$albums$*a12', title: 'Purple Rain', subtitle: 'Prince', hint: 'container', res: null,
    upnp_class: 'object.container.album.musicAlbum',
};
const PLAYLIST = { ...ALBUM, id: '0$playlists$*p3', title: 'Late night', upnp_class: 'object.container.playlistContainer' };
const UNTAGGED = { id: '0$untagged', title: '[untagged]', hint: 'container', res: null, upnp_class: 'object.container' };

/**
 * Tracks as a media server lists them, ids `i<n>` from `first` on.
 * @param {number} first
 * @param {number} count
 * @returns {object[]}
 */
function tracks(first, count) {
    return Array.from({ length: count }, (_, k) => ({
        id: `i${first + k}`, title: `T${first + k}`, hint: 'item',
        res: `http://srv/${first + k}.flac`, upnp_class: 'object.item.audioItem.musicTrack',
    }));
}

/** Every IntersectionObserver created, newest last (jsdom has none). */
let observers;
class FakeIntersectionObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
    /** The sentinel comes into reach. */
    reach() { this.callback([{ isIntersecting: true }]); }
}

/**
 * Answer the browse requests from a map of levels, paging as the core does.
 * @param {Record<string, {items: object[], total?: number}>} levels - By object id.
 */
function serve(levels) {
    apiGet.mockImplementation(async (url) => {
        const q = new URL(url, 'http://ui').searchParams;
        const level = levels[q.get('object_id')];
        const offset = Number(q.get('offset') ?? 0);
        const limit = Number(q.get('limit'));
        return { title: '', total: level.total ?? level.items.length, offset,
                 items: level.items.slice(offset, offset + limit) };
    });
}

/** Let pending promises and the resulting renders land. */
async function settle(el) {
    for (let i = 0; i < 5; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
        await el.updateComplete;
    }
}

/**
 * Mount the browser on a server, its root answered from `levels['0']`.
 * @param {Record<string, {items: object[], total?: number}>} levels
 * @returns {Promise<HTMLElement>}
 */
async function mount(levels) {
    serve(levels);
    const el = document.createElement('ag-library-upnp-browser');
    el.sourceId = SERVER;
    el.serverName = 'Music Library';
    document.body.appendChild(el);
    el.location = LOCATION;
    await settle(el);
    return el;
}

const rows = (el) => [...el.querySelectorAll('ag-upnp-item')];
const button = (row, label) => row.querySelector(`.lib-browser-right button[aria-label="${label}"]`);
/** The offsets the browse requests asked for, in order. */
const offsets = () => apiGet.mock.calls.map(([url]) => Number(new URL(url, 'http://ui').searchParams.get('offset')));

/** Open a container by tapping its row, as a reader would. */
async function open(el, title) {
    rows(el).find((r) => r.item.title === title).querySelector('.lib-browser-row').click();
    await settle(el);
}

beforeEach(() => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    apiGet.mockReset();
    Object.values(lib).forEach((fn) => fn.mockReset());
    lib.queueItem.mockResolvedValue({ ok: true });
    lib.upnpPlay.mockResolvedValue({ ok: true });
    lib.queueWithFeedback.mockImplementation(async (fn) => { await fn(); });
    lib.playWithFeedback.mockImplementation(async (fn) => { await fn(); return true; });
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('ag-library-upnp-browser — an album or a playlist, whole', () => {
    it('plays an album whole from its row, and opens the player', async () => {
        const el = await mount({ 0: { items: [ALBUM] } });
        const openNp = vi.fn();
        el.addEventListener('lib-open-np', openNp);
        button(rows(el)[0], 'Play').click();
        await settle(el);

        expect(lib.queueItem).toHaveBeenCalledWith({
            sourceId: SERVER, itemType: 'album', itemId: ALBUM.id, itemTitle: 'Purple Rain', action: 'play',
        });
        expect(lib.upnpPlay).not.toHaveBeenCalled();
        expect(openNp).toHaveBeenCalledTimes(1);
    });

    it('queues an album whole with "+", and says so, without leaving the list', async () => {
        const el = await mount({ 0: { items: [ALBUM] } });
        const openNp = vi.fn();
        el.addEventListener('lib-open-np', openNp);
        button(rows(el)[0], 'Add to queue').click();
        await settle(el);

        expect(lib.queueItem).toHaveBeenCalledWith(expect.objectContaining({
            itemType: 'album', itemId: ALBUM.id, action: 'add' }));
        expect(lib.queueWithFeedback).toHaveBeenCalledWith(expect.any(Function), 'Purple Rain');
        expect(openNp).not.toHaveBeenCalled();
    });

    it('names a playlist of the server a playlist', async () => {
        const el = await mount({ 0: { items: [PLAYLIST] } });
        button(rows(el)[0], 'Play').click();
        await settle(el);

        expect(lib.queueItem).toHaveBeenCalledWith(expect.objectContaining({
            itemType: 'playlist', itemId: PLAYLIST.id }));
    });

    it('still opens the album on a tap of its row, playing nothing', async () => {
        const el = await mount({ 0: { items: [ALBUM] }, [ALBUM.id]: { items: tracks(1, 3) } });
        await open(el, 'Purple Rain');

        expect(rows(el).map((r) => r.item.title)).toEqual(['T1', 'T2', 'T3']);
        expect(lib.queueItem).not.toHaveBeenCalled();
        expect(lib.upnpPlay).not.toHaveBeenCalled();
    });
});

describe('ag-library-upnp-browser — a track inside an album', () => {
    const levels = () => ({ 0: { items: [ALBUM, UNTAGGED] }, [ALBUM.id]: { items: tracks(1, 5) },
                            [UNTAGGED.id]: { items: tracks(20, 3) } });

    it('plays the album from the track tapped: the ones after it follow', async () => {
        const el = await mount(levels());
        await open(el, 'Purple Rain');
        rows(el)[2].querySelector('.lib-browser-row').click();
        await settle(el);

        expect(lib.queueItem).toHaveBeenCalledWith({
            sourceId: SERVER, itemType: 'album', itemId: ALBUM.id, itemTitle: 'Purple Rain',
            action: 'play', startIndex: 2, startItemId: 'i3',
        });
        expect(lib.upnpPlay).not.toHaveBeenCalled();
    });

    it('does the same from the track\'s Play button', async () => {
        const el = await mount(levels());
        await open(el, 'Purple Rain');
        button(rows(el)[0], 'Play').click();
        await settle(el);

        expect(lib.queueItem).toHaveBeenCalledWith(expect.objectContaining({ startIndex: 0, startItemId: 'i1' }));
    });

    it('adds that track alone with "+"', async () => {
        const el = await mount(levels());
        await open(el, 'Purple Rain');
        button(rows(el)[3], 'Add to queue').click();
        await settle(el);

        expect(lib.upnpPlay).toHaveBeenCalledWith(expect.objectContaining({
            res: 'http://srv/4.flac', action: 'add', sourceId: SERVER }));
        expect(lib.queueItem).not.toHaveBeenCalled();
    });

    it('starts at the copy tapped when a playlist holds a track twice under one id', async () => {
        // Looking the id up found the first copy whichever was tapped (review, 2026-11-11).
        const [a, b] = tracks(1, 2);
        const again = { ...a };                   // same id, another row
        const el = await mount({ 0: { items: [PLAYLIST] }, [PLAYLIST.id]: { items: [a, b, again] } });
        await open(el, 'Late night');
        rows(el)[2].querySelector('.lib-browser-row').click();
        await settle(el);

        expect(lib.queueItem).toHaveBeenCalledWith(expect.objectContaining({
            itemType: 'playlist', startIndex: 2, startItemId: 'i1' }));
    });

    it('plays a track alone where the level is not an album — "[untagged]", a folder', async () => {
        const el = await mount(levels());
        await open(el, '[untagged]');
        rows(el)[1].querySelector('.lib-browser-row').click();
        await settle(el);

        expect(lib.upnpPlay).toHaveBeenCalledWith(expect.objectContaining({
            res: 'http://srv/21.flac', action: 'play' }));
        expect(lib.queueItem).not.toHaveBeenCalled();
    });
});

describe('ag-library-upnp-browser — a level longer than a page', () => {
    const albums = (n) => Array.from({ length: n }, (_, k) => ({
        ...ALBUM, id: `0$albums$*a${k}`, title: `Album ${String(k).padStart(3, '0')}` }));

    it('lists the rest as the reader nears the end, page after page', async () => {
        const el = await mount({ 0: { items: albums(450) } });
        expect(rows(el)).toHaveLength(PAGE_SIZE);
        expect(el.querySelector('#lib-upnp-sentinel')).not.toBeNull();

        observers.at(-1).reach();
        await settle(el);
        expect(rows(el)).toHaveLength(400);

        observers.at(-1).reach();
        await settle(el);
        expect(rows(el)).toHaveLength(450);
        expect(offsets()).toEqual([0, 200, 400]);
        expect(rows(el).at(-1).item.title).toBe('Album 449');
        // Whole: nothing left to watch for.
        expect(el.querySelector('#lib-upnp-sentinel')).toBeNull();
        expect(observers.every((o) => o.disconnected)).toBe(true);
    });

    it('lists the next pages on a tap of "Show more" past the rows that load on their own', async () => {
        // Every row stays in the page: 6,472 rows took it from 14 MB to 42 MB (Chromium).
        const el = await mount({ 0: { items: albums(AUTO_LOAD_ROWS + 450) } });
        while (el.querySelector('#lib-upnp-sentinel')) {
            observers.at(-1).reach();
            await settle(el);
        }
        expect(rows(el)).toHaveLength(AUTO_LOAD_ROWS);
        const more = () => [...el.querySelectorAll('.lib-browser-more button')]
            .find((b) => b.textContent.trim() === 'Show more');
        expect(more()).toBeDefined();
        expect(observers.every((o) => o.disconnected)).toBe(true);   // nothing loads on its own

        more().click();
        await settle(el);
        expect(rows(el)).toHaveLength(AUTO_LOAD_ROWS + PAGE_SIZE);
        more().click();
        await settle(el);
        more().click();
        await settle(el);
        expect(rows(el)).toHaveLength(AUTO_LOAD_ROWS + 450);
        expect(more()).toBeUndefined();                                // the level is whole
    // It renders the 1,450 rows the browser would: 6.4 s measured at low priority on
    // the .254 (2026-11-11) — past the default 5 s, so its own bound.
    }, 30000);

    it('shows no sentinel for a level that fits in one page', async () => {
        const el = await mount({ 0: { items: albums(23) } });
        expect(rows(el)).toHaveLength(23);
        expect(el.querySelector('#lib-upnp-sentinel')).toBeNull();
        expect(observers).toHaveLength(0);
    });

    it('reads on while a server that gives no count hands out full pages', async () => {
        const el = await mount({ 0: { items: albums(250), total: 0 } });
        expect(el.querySelector('#lib-upnp-sentinel')).not.toBeNull();

        observers.at(-1).reach();
        await settle(el);
        expect(rows(el)).toHaveLength(250);
        expect(el.querySelector('#lib-upnp-sentinel')).toBeNull();   // a short page: the end
    });

    it('drops a page that lands once the reader has opened something else', async () => {
        const el = await mount({ 0: { items: albums(450) }, [ALBUM.id]: { items: tracks(1, 3) } });
        let answer;
        const browse = apiGet.getMockImplementation();
        apiGet.mockImplementation((url) => (url.includes('offset=200')
            ? new Promise((r) => { answer = r; }) : browse(url)));
        observers.at(-1).reach();                       // page 2 asked for…
        el._browseInto(ALBUM);                          // …and the reader opens an album
        await settle(el);
        answer({ total: 450, items: albums(450).slice(200, 400) });
        await settle(el);

        expect(rows(el).map((r) => r.item.title)).toEqual(['T1', 'T2', 'T3']);
    });

    it('asks a failing server again only when the reader scrolls, not in a loop', async () => {
        const el = await mount({ 0: { items: albums(450) } });
        const browse = apiGet.getMockImplementation();
        apiGet.mockImplementation((url) => (url.includes('offset=200')
            ? Promise.reject(new Error('server gone')) : browse(url)));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const watching = observers.length;
        observers.at(-1).reach();
        await settle(el);

        expect(offsets().filter((o) => o === 200)).toHaveLength(1);
        expect(observers).toHaveLength(watching);       // the same observer, no new report
        expect(el.querySelector('#lib-upnp-sentinel')).not.toBeNull();
        expect(el.querySelector('.lib-loading')).toBeNull();
    });
});

describe('ag-library-upnp-browser — two levels asked for in quick succession', () => {
    it('keeps the level opened last when the one opened before answers after it', async () => {
        // Open, then back: two reads on their way, and nothing kept the first from
        // answering last and writing its list over the second.
        const el = await mount({ 0: { items: [ALBUM, PLAYLIST] }, [ALBUM.id]: { items: tracks(1, 3) } });
        let answer;
        const browse = apiGet.getMockImplementation();
        apiGet.mockImplementation((url) => (
            new URL(url, 'http://ui').searchParams.get('object_id') === ALBUM.id
                ? new Promise((r) => { answer = r; }) : browse(url)));
        el._browseInto(ALBUM);                          // the album is slow to answer…
        el._browseBack();                               // …and the reader is back first
        await settle(el);
        answer({ total: 3, items: tracks(1, 3) });      // the album's answer lands last
        await settle(el);

        expect(rows(el).map((r) => r.item.title)).toEqual(['Purple Rain', 'Late night']);
    });
});
