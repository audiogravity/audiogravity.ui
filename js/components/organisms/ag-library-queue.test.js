/**
 * Unit tests for ag-library-queue.js — the per-source badge + filter logic, the
 * padlock of a streaming track on a box without Pro, the list kept on screen while it
 * is read again, and the play/pause button of the track playing.
 * Logic-only (no DOM mount): lit and the component's imports are mocked so the
 * class imports cleanly, then the view/filter helpers are exercised on a bare
 * instance, and the templates read flattened (test-utils `flat`). The filter is
 * display-only — filtered items keep their real MPD position so removal/playback are
 * unaffected, and Clear acts on the shown set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
// repeat() renders its items in order here; the key function is kept for the tests.
const repeatKeys = vi.hoisted(() => ({ fn: null }));
vi.mock('lit/directives/repeat.js', () => ({
    repeat: (items, keyFn, template) => { repeatKeys.fn = keyFn; return items.map(template); },
}));
const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
vi.mock('../../api.js', () => ({
    apiGet: (...a) => apiGetMock(...a),
    apiPost: (...a) => apiPostMock(...a),
}));
// The controller follows the player stream; a bare instance carries a stand-in instead.
vi.mock('../../core/PlayerChangeController.js', () => ({ PlayerChangeController: class {} }));
// The real loadWithState: which of two overlapping reads is the latest is its answer.
vi.mock('../utils-lit.js', async (importOriginal) => ({
    ...(await importOriginal()),
    coverUrl: () => '', fmtDuration: () => '',
}));
vi.mock('../library-constants.js', () => ({
    queueSourceLabel: () => 'Source',
    originLabel: (o) => ({ qobuz: 'Qobuz', radio: 'Radio', library: 'Library' }[o] || o),
}));
const removeQueueItemMock = vi.fn();
vi.mock('../../library-api.js', () => ({ removeQueueItem: (...a) => removeQueueItemMock(...a) }));
const showToastMock = vi.fn();
vi.mock('../../ui-helpers.js', () => ({ showToast: (...a) => showToastMock(...a) }));
vi.mock('../../ag-icons.js', () => ({ iconPause: 'ICON-PAUSE', iconPlay: 'ICON-PLAY', iconArrowLeft: '' }));
vi.mock('../atoms/ag-library-cover.js', () => ({}));
vi.mock('../atoms/ag-pro-lock.js', () => ({}));
vi.mock('../atoms/ag-source-badge.js', () => ({}));
vi.mock('../atoms/ag-filter-bar.js', () => ({}));
// The real rule (isLockedSource); only the way to the licence panel is stood in for.
const openLicensePanelMock = vi.fn();
vi.mock('../../license-tiers.js', async (importOriginal) => ({
    ...(await importOriginal()),
    openLicensePanel: (...a) => openLicensePanelMock(...a),
}));

import { AgLibraryQueue } from './ag-library-queue.js';
import { cssRuleBody, flat, readStylesheet } from '../../test-utils.js';

/** Bare instance with sane defaults (no DOM, no lifecycle). */
const el = (overrides = {}) =>
    Object.assign(Object.create(AgLibraryQueue.prototype), {
        // bare instance (no constructor) → stub the swipe controller render()/handlers reference
        _swipe: { swiping: false },
        // …and the player follower: no state known yet, nothing changed.
        _follow: { state: null, changes: 0, follow: vi.fn() },
        _removing: new Set(), _queueOf: null, _toggling: false, _playPending: null, _refreshing: false,
        _originFilter: 'all', sourceId: 'src_mpd', zoneId: '', ...overrides,
    });

/** Minimal up-next queue item. */
const item = (origin, position, title = 't') => ({ origin, position, title, is_current: false });

/** A promise and the hands that settle it, for answers made to arrive in a chosen order. */
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset().mockResolvedValue({ success: true });
    removeQueueItemMock.mockReset().mockResolvedValue(undefined);
    showToastMock.mockReset();
    openLicensePanelMock.mockReset();
});

describe('ag-library-queue — source filter', () => {
    it('_distinctOrigins dedups, preserves first-seen order, ignores empties', () => {
        const got = el()._distinctOrigins([
            { origin: 'qobuz' }, { origin: 'radio' }, { origin: 'qobuz' },
            { origin: '' }, { origin: undefined },
        ]);
        expect(got).toEqual(['qobuz', 'radio']);
    });

    it('single-source up-next is not "mixed" and offers no filter options', () => {
        const upNext = [item('qobuz', 0), item('qobuz', 1)];
        const v = el()._filterView(upNext);
        expect(v.mixed).toBe(false);
        expect(v.shownNext).toBe(upNext);
        expect(v.filterOpts).toEqual([]);
    });

    it('mixed up-next defaults to showing every source, with All + one option per origin', () => {
        const upNext = [item('qobuz', 0), item('radio', 1)];
        const v = el({ _originFilter: 'all' })._filterView(upNext);
        expect(v.mixed).toBe(true);
        expect(v.activeFilter).toBe('all');
        expect(v.shownNext).toHaveLength(2);
        expect(v.filterOpts).toEqual([
            { label: 'All', value: 'all' },
            { label: 'Qobuz', value: 'qobuz' },
            { label: 'Radio', value: 'radio' },
        ]);
    });

    it('origins come from up-next only — a current-only origin is not a filter option', () => {
        // Only up-next items are passed; the current track never contributes an origin.
        const upNext = [item('radio', 1), item('radio', 2)];
        const v = el()._filterView(upNext);
        expect(v.mixed).toBe(false); // single up-next source, even if current is Qobuz
    });

    it('filtering keeps only the chosen source and preserves real MPD positions', () => {
        const upNext = [item('qobuz', 0), item('radio', 1), item('qobuz', 2)];
        const v = el({ _originFilter: 'qobuz' })._filterView(upNext);
        expect(v.shownNext.map(i => i.position)).toEqual([0, 2]);
    });

    it('a stale filter (its source gone from up-next) falls back to all for display', () => {
        const upNext = [item('qobuz', 0), item('radio', 1)];
        const v = el({ _originFilter: 'tidal' })._filterView(upNext);
        expect(v.activeFilter).toBe('all');
        expect(v.shownNext).toHaveLength(2);
    });

    it('_onFilterChange updates the active filter', () => {
        const e = el();
        e._onFilterChange({ detail: { value: 'radio' } });
        expect(e._originFilter).toBe('radio');
    });
});

describe('ag-library-queue — Clear respects the filter', () => {
    it('_clear removes only the shown (filtered) items, not the whole queue', async () => {
        const e = el({ _originFilter: 'qobuz', sourceId: 'src_qobuz' });
        // queue_id differs from position to prove removal keys on the stable id.
        e._queue = { items: [
            { origin: 'qobuz', position: 0, queue_id: '90', is_current: true },   // current — never deleted
            { origin: 'qobuz', position: 1, queue_id: '91', is_current: false },
            { origin: 'radio', position: 2, queue_id: '92', is_current: false },  // filtered out — kept
            { origin: 'qobuz', position: 3, queue_id: '93', is_current: false },
        ] };
        e._load = vi.fn().mockResolvedValue(undefined); // stub the reload
        await e._clear();
        const removed = removeQueueItemMock.mock.calls.map(c => c[1]).sort();
        expect(removed).toEqual(['91', '93']);   // qobuz up-next, by stable song id
    });

    it('_clear with no filter clears every up-next item', async () => {
        const e = el({ _originFilter: 'all', sourceId: 'src_qobuz' });
        e._queue = { items: [
            { origin: 'qobuz', position: 0, queue_id: '90', is_current: true },
            { origin: 'qobuz', position: 1, queue_id: '91', is_current: false },
            { origin: 'radio', position: 2, queue_id: '92', is_current: false },
        ] };
        e._load = vi.fn().mockResolvedValue(undefined);
        await e._clear();
        const removed = removeQueueItemMock.mock.calls.map(c => c[1]).sort();
        expect(removed).toEqual(['91', '92']);
    });
});

describe('ag-library-queue — _load prunes a stale filter', () => {
    it('drops a filter whose source is no longer up-next', async () => {
        apiGetMock.mockResolvedValue({ items: [
            { origin: 'radio', position: 0, is_current: true },
            { origin: 'radio', position: 1, is_current: false },
        ] });
        const e = el({ _originFilter: 'qobuz', sourceId: 'src_mpd' });
        await e._load();
        expect(e._originFilter).toBe('all');
    });

    it('keeps a filter whose source is still up-next', async () => {
        apiGetMock.mockResolvedValue({ items: [
            { origin: 'qobuz', position: 0, is_current: false },
            { origin: 'radio', position: 1, is_current: false },
        ] });
        const e = el({ _originFilter: 'qobuz', sourceId: 'src_mpd' });
        await e._load();
        expect(e._originFilter).toBe('qobuz');
    });
});


describe('ag-library-queue — truthful removal', () => {
    // The backend now refuses truthfully (503 with MPD's reason); these pin
    // that the organism relays it instead of a console line nobody sees.
    const inst = (queueItems) => {
        const i = el({ _queue: { items: queueItems } });
        i._isRoon = () => false;
        i._load = vi.fn();
        return i;
    };

    it('_remove relays the refusal as a toast and re-syncs the list', async () => {
        removeQueueItemMock.mockRejectedValue(
            new Error('MPD refused to remove queue item 7: ACK [50@0] {deleteid} No such song'));
        const i = inst([]);
        await i._remove(7);
        expect(showToastMock).toHaveBeenCalledWith(
            'error', 'Remove failed', expect.stringContaining('No such song'));
        expect(i._load).toHaveBeenCalled(); // list re-synced with what MPD holds
    });

    it('_remove stays silent on success', async () => {
        const i = inst([]);
        await i._remove(7);
        expect(showToastMock).not.toHaveBeenCalled();
    });

    it('_clear sweeps past failures and summarises them in ONE toast', async () => {
        removeQueueItemMock
            .mockRejectedValueOnce(new Error('gone from the queue'))
            .mockResolvedValueOnce(undefined);
        const i = inst([
            { ...item('qobuz', 0), queue_id: 1 },
            { ...item('qobuz', 1), queue_id: 2 },
        ]);
        await i._clear();
        expect(removeQueueItemMock).toHaveBeenCalledTimes(2); // the sweep finished
        expect(showToastMock).toHaveBeenCalledTimes(1);
        expect(showToastMock.mock.calls[0][2]).toContain('1 track');
        expect(showToastMock.mock.calls[0][2]).toContain('gone from the queue');
    });

    it('_clear stays silent when every removal succeeds', async () => {
        const i = inst([{ ...item('qobuz', 0), queue_id: 1 }]);
        await i._clear();
        expect(showToastMock).not.toHaveBeenCalled();
    });
});

describe('ag-library-queue — a streaming track on a box without Pro', () => {
    // There the relays refuse every streaming track, those queued during the trial
    // included, and the player skips them: a queue of nothing else stops without a word
    // on screen. The core marks each such track (`pro`); the view says it in advance.
    const STARTER = { status: 'starter', pro: false };
    const PRO = { status: 'lifetime', pro: true };
    const track = (over = {}) => ({ origin: 'qobuz', position: 1, queue_id: '91', title: 'T',
        duration: 200, is_current: false, pro: true, ...over });
    const view = (license, ...items) => el({ _license: license, _queue: { items } });
    /** The rendered up-next rows, one string each. */
    const rows = (e) => flat(e.render()).split('<div class="ag-swipe-wrap">').slice(1);

    it('wears the Pro tint, and the padlock where its duration stood', () => {
        const [row] = rows(view(STARTER, track()));
        expect(row).toContain('lib-queue-row--locked');
        expect(row).toContain('<ag-pro-lock></ag-pro-lock>');
        expect(row).not.toContain('lib-queue-dur');
    });

    it('can still be removed, by its button or by a swipe', () => {
        const [row] = rows(view(STARTER, track()));
        expect(row).toContain('ag-swipe-reveal');
        expect(row).toContain('lib-queue-more');
    });

    it.each([
        ['on a box with Pro', PRO, track()],
        ['while the licence is not read yet', null, track()],
        ['for what a Starter box plays', STARTER, track({ origin: 'library', pro: false })],
        ['from a core that does not mark its tracks', STARTER, track({ pro: undefined })],
    ])('is a track like any other %s', (_, license, queued) => {
        const [row] = rows(view(license, queued));
        expect(row).not.toContain('lib-queue-row--locked');
        expect(row).not.toContain('ag-pro-lock');
        expect(row).toContain('lib-queue-dur');
    });

    it('marks only the tracks it will skip in a mixed queue', () => {
        const marked = rows(view(STARTER, track({ origin: 'library', pro: false, queue_id: '90' }),
            track(), track({ origin: 'radio', pro: false, queue_id: '92' })))
            .map((row) => row.includes('lib-queue-row--locked'));
        expect(marked).toEqual([false, true, false]);
    });

    it('marks the track playing when it is one', () => {
        const out = flat(view(STARTER, track({ is_current: true, position: 0 })).render());
        expect(out).toContain('lib-queue-now--locked');
        expect(out).toContain('<ag-pro-lock></ag-pro-lock>');
        const free = flat(view(PRO, track({ is_current: true, position: 0 })).render());
        expect(free).not.toContain('lib-queue-now--locked');
        expect(free).not.toContain('ag-pro-lock');
    });

    it('leads its padlock to the licence panel', () => {
        const e = view(STARTER);
        const tap = e._renderLock().values.find((v) => typeof v === 'function');
        tap();
        expect(openLicensePanelMock).toHaveBeenCalledWith(STARTER);
    });

    it('does not open the panel at the end of a swipe', () => {
        const e = view(STARTER);
        e._swipe.swiping = true;
        e._renderLock().values.find((v) => typeof v === 'function')();
        expect(openLicensePanelMock).not.toHaveBeenCalled();
    });

    it('draws its padlock as a real button, in the padlock button\'s one style', () => {
        expect(flat(view(STARTER)._renderLock())).toMatch(/<button class="plain-btn pro-lock-btn"/);
    });

    it('gives that small mark a finger\'s room, without moving the row', () => {
        // An invisible margin, as the progress bar's (progress-bar.css). One style for every
        // padlock button (pro-lock.css): the player's "Next" wears it too.
        const sheet = readStylesheet('css', 'components', 'pro-lock.css');
        expect(cssRuleBody(sheet, '.pro-lock-btn')).toMatch(/position:\s*relative/);
        expect(cssRuleBody(sheet, '.pro-lock-btn::before')).toMatch(/position:\s*absolute;[\s\S]*inset:\s*-10px -8px/);
    });
});

describe('ag-library-queue — the list stays on screen while it is read again', () => {
    // A removal used to read the whole queue again behind "Loading…": the list blanked,
    // every cover was drawn again, and the reader was sent back to the top of it.
    /** A queue of up-next library tracks, by song id. */
    const queueOf = (...ids) => ({ items: ids.map((id, i) => ({
        origin: 'library', position: i, queue_id: id, title: `t${id}`, is_current: false })) });
    const ids = (e) => e._queue.items.map(i => i.queue_id);

    it('says "Loading…" only while there is nothing to show', () => {
        expect(flat(el({ _loading: true, _queue: null }).render())).toContain('Loading…');
        const shown = flat(el({ _loading: true, _queue: queueOf('1', '2') }).render());
        expect(shown).not.toContain('Loading…');
        expect(shown.split('<div class="ag-swipe-wrap">')).toHaveLength(3);
    });

    it('takes a removed track off at once, before the box answers, then reads the queue', async () => {
        const answer = deferred();
        removeQueueItemMock.mockReturnValue(answer.promise);
        const e = el({ _queue: queueOf('1', '2', '3') });
        e._load = vi.fn();
        const done = e._remove('2');
        expect(ids(e)).toEqual(['1', '3']);
        expect(e._load).not.toHaveBeenCalled();
        answer.resolve();
        await done;
        expect(e._load).toHaveBeenCalledTimes(1);
    });

    it('a refused removal puts the track back, with the box\'s reason', async () => {
        removeQueueItemMock.mockRejectedValue(new Error('No such song'));
        apiGetMock.mockResolvedValue(queueOf('1', '2'));
        const e = el({ _queue: queueOf('1', '2') });
        await e._remove('2');
        expect(showToastMock).toHaveBeenCalledWith('error', 'Remove failed', 'No such song');
        expect(ids(e)).toEqual(['1', '2']);
    });

    it('drops the answer of a read that left before a removal', async () => {
        const before = deferred();
        apiGetMock.mockReturnValueOnce(before.promise).mockResolvedValueOnce(queueOf('1', '3'));
        const e = el({ _queue: queueOf('1', '2', '3') });
        const stale = e._load();
        await e._remove('2');
        expect(ids(e)).toEqual(['1', '3']);
        before.resolve(queueOf('1', '2', '3'));   // track 2 still in it
        await stale;
        expect(ids(e)).toEqual(['1', '3']);
    });

    it('drops it too when it answers while the removal is still on its way', async () => {
        // The window the next read cannot cover: it starts only once the box has answered.
        const before = deferred();
        const removal = deferred();
        apiGetMock.mockReturnValueOnce(before.promise).mockResolvedValueOnce(queueOf('1', '3'));
        removeQueueItemMock.mockReturnValue(removal.promise);
        const e = el({ _queue: queueOf('1', '2', '3') });
        const stale = e._load();
        const removing = e._remove('2');
        before.resolve(queueOf('1', '2', '3'));
        await stale;
        expect(ids(e)).toEqual(['1', '3']);   // not back under the finger
        removal.resolve();
        await removing;
        expect(ids(e)).toEqual(['1', '3']);
    });

    it('keeps out a track whose removal is still on its way from a reading started after it', async () => {
        // Two quick removals: the reading after the first can leave before the box has
        // taken the second.
        const removalOf = { 2: deferred(), 3: deferred() };
        removeQueueItemMock.mockImplementation((_s, id) => removalOf[id].promise);
        apiGetMock.mockResolvedValueOnce(queueOf('1', '3'))   // after 2: 3 not taken yet
            .mockResolvedValueOnce(queueOf('1'));               // after 3
        const e = el({ _queue: queueOf('1', '2', '3') });
        const first = e._remove('2');
        const second = e._remove('3');
        expect(ids(e)).toEqual(['1']);
        removalOf[2].resolve();
        await first;
        expect(ids(e)).toEqual(['1']);   // 3 not back
        removalOf[3].resolve();
        await second;
        expect(ids(e)).toEqual(['1']);
    });

    it('keeps the tracks of a Clear out of a reading made during the sweep', async () => {
        // A change of track, or a Refresh, while the removals go one by one.
        const removalOf = { 2: deferred(), 3: deferred() };
        removeQueueItemMock.mockImplementation((_s, id) => removalOf[id].promise);
        const playing = { origin: 'library', position: 0, queue_id: '1', is_current: true };
        apiGetMock.mockResolvedValueOnce({ items: [playing, ...queueOf('3').items] })   // during
            .mockResolvedValueOnce({ items: [playing] });                                // after
        const e = el({ _queue: { items: [playing, ...queueOf('2', '3').items] } });
        const clearing = e._clear();
        removalOf[2].resolve();
        await e._load();
        expect(ids(e)).toEqual(['1']);
        removalOf[3].resolve();
        await clearing;
        expect(ids(e)).toEqual(['1']);
    });

    it('keeps a Clear\'s track out of a reading that left before the box took it, answered after', async () => {
        const removalOf = { 2: deferred(), 3: deferred() };
        removeQueueItemMock.mockImplementation((_s, id) => removalOf[id].promise);
        const reading = deferred();
        apiGetMock.mockReturnValueOnce(reading.promise).mockResolvedValueOnce({ items: [] });
        const e = el({ _queue: queueOf('2', '3') });
        const clearing = e._clear();
        const during = e._load();      // leaves before the box takes either removal
        removalOf[2].resolve();        // 2 answered; 3 still on its way
        await Promise.resolve();
        reading.resolve(queueOf('2', '3'));
        await during;
        expect(ids(e)).toEqual([]);    // neither back
        removalOf[3].resolve();
        await clearing;
    });

    it('keeps the newest read when an older one answers last', async () => {
        const older = deferred();
        const newer = deferred();
        apiGetMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
        const e = el({ _queue: queueOf('1') });
        const a = e._load();
        const b = e._load();
        newer.resolve(queueOf('1', '2'));
        await b;
        older.resolve(queueOf('9'));
        await a;
        expect(ids(e)).toEqual(['1', '2']);
    });

    it('Clear takes the shown tracks off at once, and keeps the one playing', async () => {
        const answer = deferred();
        removeQueueItemMock.mockReturnValue(answer.promise);
        const e = el({ _queue: { items: [
            { origin: 'library', position: 0, queue_id: '1', is_current: true },
            ...queueOf('2', '3').items,
        ] } });
        e._load = vi.fn();
        const done = e._clear();
        expect(ids(e)).toEqual(['1']);
        answer.resolve();
        await done;
        expect(removeQueueItemMock.mock.calls.map(c => c[1])).toEqual(['2', '3']);
    });

    it('keys each row by its song id — a Roon row, which has none, by its position', () => {
        flat(el({ _queue: queueOf('7') }).render());
        expect(repeatKeys.fn({ queue_id: '7', position: 3 })).toBe('7');
        expect(repeatKeys.fn({ queue_id: null, position: 3 })).toBe('position:3');
    });

    it('lets go of what it shows for another queue, not between the box\'s own sources', () => {
        const e = el({ _queue: queueOf('1'), _queueOf: 'box', sourceId: 'src_mpd' });
        e.sourceId = 'src_qobuz';
        e.willUpdate(new Map([['sourceId', 'src_mpd']]));
        expect(e._queue).not.toBeNull();   // the same MPD queue
        e.sourceId = 'src_roon';
        e.zoneId = 'zone-1';
        e.willUpdate(new Map([['sourceId', 'src_qobuz']]));
        expect(e._queue).toBeNull();       // a Roon zone's: another queue
    });

    it('drops a reading of the queue it has left, answering after the move', async () => {
        const out = deferred();
        apiGetMock.mockReturnValueOnce(out.promise);
        const e = el({ _queue: queueOf('1'), _queueOf: 'box', sourceId: 'src_mpd' });
        const reading = e._load();
        e.sourceId = 'src_roon';
        e.zoneId = 'zone-1';
        e.willUpdate(new Map([['sourceId', 'src_mpd']]));
        out.resolve(queueOf('1', '2'));   // the box's queue, under a Roon zone's name
        await reading;
        expect(e._queue).toBeNull();
    });

    it('greys Refresh while its reading is out, and a second tap meanwhile reads nothing', async () => {
        const out = deferred();
        apiGetMock.mockReturnValueOnce(out.promise);
        const e = el({ _queue: queueOf('1') });
        const refresh = () => e.render();
        const button = (t) => flat(t).match(/<button class="lib-queue-action"[^>]*>Refresh/)[0];
        expect(button(refresh())).toContain('aria-disabled=false');
        const first = e._refresh();
        expect(button(refresh())).toContain('aria-disabled=true');
        await e._refresh();
        expect(apiGetMock).toHaveBeenCalledTimes(1);
        out.resolve(queueOf('1'));
        await first;
        expect(button(refresh())).toContain('aria-disabled=false');
    });

    it('wires the Refresh button to that reading', () => {
        const e = el({ _queue: queueOf('1') });
        e._refresh = vi.fn();
        const tpl = e.render();
        // The handler bound right after the Refresh button's aria-disabled value.
        const handlers = [];
        (function walk(node) {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) { node.forEach(walk); return; }
            if (node.strings) {
                node.strings.forEach((s, i) => {
                    if (/@click=$/.test(s.trimEnd()) && node.strings[i + 1]?.trimStart().startsWith('>Refresh')) handlers.push(node.values[i]);
                    walk(node.values[i]);
                });
            }
        })(tpl);
        expect(handlers).toHaveLength(1);
        handlers[0]();
        expect(e._refresh).toHaveBeenCalledTimes(1);
    });

    it('follows the player only while shown', () => {
        const e = el({ visible: true });
        e._load = vi.fn();
        e.updated(new Map([['visible', false]]));
        expect(e._follow.follow).toHaveBeenLastCalledWith(true);
        e.visible = false;
        e.updated(new Map([['visible', true]]));
        expect(e._follow.follow).toHaveBeenLastCalledWith(false);
    });
});

describe('ag-library-queue — no drag handle', () => {
    // The rows wore a drag handle that moved nothing: the queue's order cannot be changed.
    it('draws none on a row', () => {
        const out = flat(el({ _queue: { items: [
            { origin: 'library', position: 1, queue_id: '5', title: 'x', is_current: false },
        ] } }).render());
        expect(out).not.toContain('grip');
    });

    it('lays a row out without its column, and nothing grabs', () => {
        const sheet = readStylesheet('css', 'components', 'library-queue.css');
        expect(sheet).not.toMatch(/lib-queue-grip|cursor:\s*grab/);
        expect(cssRuleBody(sheet, '.lib-queue-row')).toMatch(/grid-template-columns:\s*36px 1fr auto auto;/);
    });
});

describe('ag-library-queue — the play/pause button of the track playing', () => {
    // It showed a pause sign and opened the full-screen player. It plays and pauses now,
    // the player that holds this queue, and shows what that player does.
    const MPD = (fields = {}) => ({ source_id: 'src_mpd', control_id: 'src_mpd', protocol: 'mpd',
        playing: true, playback_status: 'Playing', title: 'So What', ...fields });
    const AIRPLAY = { source_id: 'src_shairport', control_id: 'src_shairport', protocol: 'mpris',
        playing: true, playback_status: 'Playing', active: true };
    const playingView = (sources, over = {}) => el({
        _follow: { state: { sources }, changes: 1, follow: vi.fn() },
        _queue: { items: [{ origin: 'library', position: 0, queue_id: '1', title: 'So What', is_current: true }] },
        ...over,
    });
    const button = (e) => flat(e._renderPlayPause());
    const tap = (e) => e._renderPlayPause().values.find(v => typeof v === 'function')();

    it('is drawn in the block of the track playing', () => {
        expect(flat(playingView([MPD()]).render())).toContain('class="lib-queue-now-play"');
    });

    it('shows Pause while the box plays, Play while it is paused', () => {
        const playing = button(playingView([MPD()]));
        expect(playing).toContain('ICON-PAUSE');
        expect(playing).toContain('aria-label=Pause');
        expect(playing).toContain('aria-disabled=false');
        const paused = button(playingView([MPD({ playback_status: 'Paused' })]));
        expect(paused).toContain('ICON-PLAY');
        expect(paused).toContain('aria-label=Play');
    });

    it('reads the box\'s own player, whatever else plays', () => {
        // A phone plays over AirPlay; the queue's player, MPD, is paused under it.
        const e = playingView([AIRPLAY, MPD({ playback_status: 'Paused' })]);
        expect(e._playerEntry().source_id).toBe('src_mpd');
        expect(button(e)).toContain('ICON-PLAY');
    });

    it('is greyed in its place, and does nothing, while the player state is not known', () => {
        const e = el({ _queue: { items: [] } });
        expect(button(e)).toContain('aria-disabled=true');
        tap(e);
        expect(apiPostMock).not.toHaveBeenCalled();
    });

    it('offers Play on a box whose player was stopped with a track still current', async () => {
        // Stopped, the box's player has no track in the state — only what plays or is
        // paused does — yet its queue names a current one, and the core takes the Play.
        const stopped = { source_id: 'src_mpd', protocol: 'mpd', playing: false };
        const e = playingView([AIRPLAY, stopped]);
        const out = button(e);
        expect(out).toContain('ICON-PLAY');
        expect(out).toContain('aria-disabled=false');
        await tap(e);
        expect(apiPostMock).toHaveBeenCalledWith('/player/control', { action: 'play', source_id: 'src_mpd' });
    });

    it('stays greyed for a Roon zone that plays nothing: Roon is reached through what it plays', () => {
        const idle = { source_id: 'src_roon', protocol: 'roon', playing: false, zone_id: 'zone-1' };
        const e = playingView([idle], { sourceId: 'src_roon', zoneId: 'zone-1' });
        expect(button(e)).toContain('aria-disabled=true');
    });

    it('takes the finger over 44px while drawn at 36, without moving anything', () => {
        // The touch rule's square; an invisible margin, as the padlock button's.
        const sheet = readStylesheet('css', 'components', 'library-queue.css');
        expect(cssRuleBody(sheet, '.lib-queue-now-play')).toMatch(/position:\s*relative;[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;/);
        expect(cssRuleBody(sheet, '.lib-queue-now-play::before')).toMatch(/content:\s*'';[\s\S]*position:\s*absolute;[\s\S]*inset:\s*-4px;/);
    });

    it('sends the intent it shows, to the player of the queue', async () => {
        const e = playingView([AIRPLAY, MPD()]);
        await tap(e);
        expect(apiPostMock).toHaveBeenCalledWith('/player/control',
            { action: 'pause', source_id: 'src_mpd', control_id: 'src_mpd' });
    });

    it('turns at once, and holds until the box tells a change', async () => {
        const answer = deferred();
        apiPostMock.mockReturnValue(answer.promise);
        const e = playingView([MPD()]);
        const done = e._togglePlay();
        expect(button(e)).toContain('ICON-PLAY');            // turned before the answer
        expect(button(e)).toContain('aria-disabled=true');   // and busy meanwhile
        answer.resolve({ success: true });
        await done;
        // No change told yet — a state sent before the box took the tap tells none.
        expect(button(e)).toContain('ICON-PLAY');
        expect(button(e)).toContain('aria-disabled=false');
        // The box's change arrives, then music played again from another screen.
        e._follow.state = { sources: [MPD({ playback_status: 'Paused' })] };
        e._follow.changes += 1;
        expect(button(e)).toContain('ICON-PLAY');
        e._follow.state = { sources: [MPD()] };
        e._follow.changes += 1;
        expect(button(e)).toContain('ICON-PAUSE');
    });

    it('a second tap while the first is on its way does nothing', async () => {
        const answer = deferred();
        apiPostMock.mockReturnValue(answer.promise);
        const e = playingView([MPD()]);
        const first = e._togglePlay();
        await e._togglePlay();
        expect(apiPostMock).toHaveBeenCalledTimes(1);
        answer.resolve({});
        await first;
    });

    it('refused for want of Pro: back to what the box says, with the reason', async () => {
        apiPostMock.mockRejectedValue(Object.assign(new Error('403'),
            { status: 403, detail: 'Streaming tracks need Pro' }));
        const e = playingView([MPD({ playback_status: 'Paused' })]);
        await e._togglePlay();
        expect(showToastMock).toHaveBeenCalledWith('error', 'Playback blocked', 'Streaming tracks need Pro');
        expect(button(e)).toContain('ICON-PLAY');
        expect(e._toggling).toBe(false);
    });

    it('declined by the device: back to what the box says, silently', async () => {
        apiPostMock.mockRejectedValue(Object.assign(new Error('503'), { status: 503 }));
        const e = playingView([MPD()]);
        await e._togglePlay();
        expect(showToastMock).not.toHaveBeenCalled();
        expect(button(e)).toContain('ICON-PAUSE');
    });

    it('acts on the Roon zone shown, for a Roon queue', async () => {
        const zone = (id) => ({ source_id: 'src_roon', control_id: `roon:${id}`, protocol: 'roon',
            playing: true, playback_status: 'Playing', zone_id: id });
        const e = playingView([MPD(), zone('zone-2'), zone('zone-1')], { sourceId: 'src_roon', zoneId: 'zone-1' });
        await e._togglePlay();
        expect(apiPostMock).toHaveBeenCalledWith('/player/control',
            { action: 'pause', source_id: 'src_roon', control_id: 'roon:zone-1' });
    });

    it('is no longer a way to the full-screen player', () => {
        // The file's text: the event was fired from a handler, which a flattened template drops.
        const queue = readStylesheet('js', 'components', 'organisms', 'ag-library-queue.js');
        expect(queue).not.toContain('lib-open-np');
    });
});
