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

vi.mock('lit', () => ({ LitElement: class {}, html: () => ({}), nothing: null }));
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
