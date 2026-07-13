/**
 * Unit tests for ag-library-queue.js — the per-source badge + filter logic.
 * Logic-only (no DOM mount): lit and the component's imports are mocked so the
 * class imports cleanly, then the view/filter helpers are exercised on a bare
 * instance. The filter is display-only — filtered items keep their real MPD
 * position so removal/playback are unaffected, and Clear acts on the shown set.
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
vi.mock('../../ag-icons.js', () => ({ iconPause: '', iconDragHandle: '', iconArrowLeft: '' }));
vi.mock('../atoms/ag-library-cover.js', () => ({}));
vi.mock('../atoms/ag-source-badge.js', () => ({}));
vi.mock('../atoms/ag-filter-bar.js', () => ({}));

import { AgLibraryQueue } from './ag-library-queue.js';

/** Bare instance with sane defaults (no DOM, no lifecycle). */
const el = (overrides = {}) =>
    Object.assign(Object.create(AgLibraryQueue.prototype), {
        _originFilter: 'all', sourceId: 'src_mpd', zoneId: '', ...overrides,
    });

/** Minimal up-next queue item. */
const item = (origin, position, title = 't') => ({ origin, position, title, is_current: false });

beforeEach(() => {
    apiGetMock.mockReset();
    removeQueueItemMock.mockReset().mockResolvedValue(undefined);
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
        e._queue = { items: [
            { origin: 'qobuz', position: 0, is_current: true },   // current — never deleted
            { origin: 'qobuz', position: 1, is_current: false },
            { origin: 'radio', position: 2, is_current: false },  // filtered out — kept
            { origin: 'qobuz', position: 3, is_current: false },
        ] };
        e._load = vi.fn().mockResolvedValue(undefined); // stub the reload
        await e._clear();
        const removed = removeQueueItemMock.mock.calls.map(c => c[1]).sort((a, b) => a - b);
        expect(removed).toEqual([1, 3]);
    });

    it('_clear with no filter clears every up-next item', async () => {
        const e = el({ _originFilter: 'all', sourceId: 'src_qobuz' });
        e._queue = { items: [
            { origin: 'qobuz', position: 0, is_current: true },
            { origin: 'qobuz', position: 1, is_current: false },
            { origin: 'radio', position: 2, is_current: false },
        ] };
        e._load = vi.fn().mockResolvedValue(undefined);
        await e._clear();
        const removed = removeQueueItemMock.mock.calls.map(c => c[1]).sort((a, b) => a - b);
        expect(removed).toEqual([1, 2]);
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
