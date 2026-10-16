/**
 * Unit tests for ag-library-queue.js — the per-source badge + filter logic, and the
 * padlock of a streaming track on a box without Pro.
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
const apiGetMock = vi.fn();
vi.mock('../../api.js', () => ({ apiGet: (...a) => apiGetMock(...a) }));
// loadWithState invokes its callback so _load actually sets _queue in tests.
vi.mock('../utils-lit.js', () => ({
    coverUrl: () => '', fmtDuration: () => '',
    loadWithState: async (_host, fn) => { await fn(); },
}));
vi.mock('../library-constants.js', () => ({
    queueSourceLabel: () => 'Source',
    originLabel: (o) => ({ qobuz: 'Qobuz', radio: 'Radio', library: 'Library' }[o] || o),
}));
const removeQueueItemMock = vi.fn();
vi.mock('../../library-api.js', () => ({ removeQueueItem: (...a) => removeQueueItemMock(...a) }));
const showToastMock = vi.fn();
vi.mock('../../ui-helpers.js', () => ({ showToast: (...a) => showToastMock(...a) }));
vi.mock('../../ag-icons.js', () => ({ iconPause: '', iconDragHandle: '', iconArrowLeft: '' }));
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
        _originFilter: 'all', sourceId: 'src_mpd', zoneId: '', ...overrides,
    });

/** Minimal up-next queue item. */
const item = (origin, position, title = 't') => ({ origin, position, title, is_current: false });

beforeEach(() => {
    apiGetMock.mockReset();
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
