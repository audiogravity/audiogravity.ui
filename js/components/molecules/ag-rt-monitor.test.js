/**
 * Unit tests for ag-rt-monitor — the _load array-coercion invariant.
 *
 * Regression: render() does `this._processes.map(...)`. When apiGet resolves to
 * a non-array (undefined, or an error object that did not throw), the map crashed
 * the render (unhandled TypeError). _load now coerces the response to an array so
 * the property invariant holds. Mirrors ag-tabs.test.js: lit / icons / api mocked
 * so the component class imports without the api.js auth-check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../ag-icons.js', () => ({ iconSpinner: '' }));
const apiGetMock = vi.fn();
vi.mock('../../api.js', () => ({ apiGet: (...args) => apiGetMock(...args) }));

import { AgRtMonitor } from './ag-rt-monitor.js';

/** Bare instance whose reactive setters are inert (LitElement is mocked). */
function makeEl() {
    return Object.assign(Object.create(AgRtMonitor.prototype), {
        _processes: [], _error: null, _loading: true,
    });
}

describe('ag-rt-monitor — _load array coercion', () => {
    beforeEach(() => apiGetMock.mockReset());

    it('keeps an array response as-is', async () => {
        apiGetMock.mockResolvedValueOnce([{ pid: 1 }, { pid: 2 }]);
        const el = makeEl();
        await el._load();
        expect(el._processes).toEqual([{ pid: 1 }, { pid: 2 }]);
        expect(el._error).toBeNull();
    });

    it('coerces an undefined response to [] (no .map crash)', async () => {
        apiGetMock.mockResolvedValueOnce(undefined);
        const el = makeEl();
        await el._load();
        expect(Array.isArray(el._processes)).toBe(true);
        expect(el._processes).toEqual([]);
    });

    it('coerces a non-array object response to []', async () => {
        apiGetMock.mockResolvedValueOnce({ detail: 'unexpected shape' });
        const el = makeEl();
        await el._load();
        expect(el._processes).toEqual([]);
    });

    it('leaves _processes an array and records the error when apiGet throws', async () => {
        apiGetMock.mockRejectedValueOnce(new Error('offline'));
        const el = makeEl();
        await el._load();
        expect(Array.isArray(el._processes)).toBe(true);
        expect(el._error).toBe('offline');
    });
});

/** Flatten a mocked template to its text, strings interleaved with values. */
const text = (tpl) => {
    if (!tpl || typeof tpl !== 'object') return String(tpl ?? '');
    if (Array.isArray(tpl)) return tpl.map(text).join('');
    return (tpl.strings ?? []).reduce((out, s, i) => out + s + text(tpl.values?.[i]), '');
};

describe('ag-rt-monitor — MPD read on its sound threads', () => {
    const mpd = (over = {}) => ({
        name: 'mpd', pid: 838, running: true, policy: 'SCHED_FIFO', priority: 40,
        is_rt: true, audio_threads: true, outranked: false, ...over,
    });

    it('says which threads the reading comes from', () => {
        const row = text(makeEl()._renderRow(mpd()));
        expect(row).toContain('sound threads');
        expect(row).toContain('rt-badge rt');
        expect(row).toContain('SCHED_FIFO');
    });

    it('a program read on its main thread carries no such line', () => {
        const row = text(makeEl()._renderRow(mpd({ name: 'shairport-sync', audio_threads: false })));
        expect(row).not.toContain('sound threads');
    });

    it('a sound outranked by the rest of MPD shows OUTRANKED, not a green badge', () => {
        const row = text(makeEl()._renderRow(mpd({ outranked: true })));
        expect(row).toContain('rt-badge outranked');
        expect(row).toContain('OUTRANKED');
        expect(row).not.toContain('rt-badge rt"');
    });

    it('sound threads MPD could not raise still read NON-RT', () => {
        const row = text(makeEl()._renderRow(mpd({ is_rt: false, policy: 'SCHED_OTHER', priority: 0 })));
        expect(row).toContain('NON-RT');
    });

    it('explains OUTRANKED only when a program is', () => {
        const el = makeEl();
        Object.assign(el, { _loading: false, _error: null, _processes: [mpd({ outranked: true })] });
        expect(text(el.render())).toContain('apply Audio Optimized to it and');
        el._processes = [mpd()];
        expect(text(el.render())).not.toContain('OUTRANKED: another part');
    });
});

