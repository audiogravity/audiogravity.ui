/**
 * Unit tests for ag-network-test.js.
 *
 * Covers:
 * 1. memory leak fix (P2): _jitterChart.destroy() must be called in disconnectedCallback
 * 2. the jitter chart draws one bar per second, in the theme's network colour — it was a
 *    smoothed line in a blue read from a token no theme declares (2026-10-26)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// The chart is read on the component (_jitterChart), not in the stand-in's list: the
// first test resets the modules, and the component then loads a stand-in of its own.
vi.mock('chart.js/auto', () => import('../../test-chart-stub.js'));

vi.mock('lit', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual };
});

vi.mock('../../api.js', () => ({
    apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn(),
    showToast: vi.fn(), handleError: vi.fn(),
}));

vi.mock('../../test-history.js', () => ({
    saveNetworkResult: vi.fn(),
    getTestHistory: vi.fn().mockReturnValue([]),
    clearTestHistory: vi.fn(),
}));

vi.mock('../../ag-icons.js', () => ({}));
vi.mock('../../ui-helpers.js', () => ({
    showToast: vi.fn(), showConfirm: vi.fn(),
}));

describe('AgNetworkTest.disconnectedCallback — jitterChart destroy (Fix P2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // EventEmitter is a global in the app
        globalThis.EventEmitter = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    });

    it('destroys _jitterChart when component is disconnected', async () => {
        vi.resetModules();
        const { AgNetworkTest } = await import('./ag-network-test.js');
        const instance = new AgNetworkTest();
        const destroyMock = vi.fn();
        instance._jitterChart = { destroy: destroyMock };

        instance.disconnectedCallback();

        expect(destroyMock).toHaveBeenCalledOnce();
        expect(instance._jitterChart).toBeNull();
    });

    it('does not throw when _jitterChart is null', async () => {
        const { AgNetworkTest } = await import('./ag-network-test.js');
        const instance = new AgNetworkTest();
        instance._jitterChart = null;

        expect(() => instance.disconnectedCallback()).not.toThrow();
    });
});

describe('the jitter chart', () => {
    beforeEach(() => {
        document.body.style.setProperty('--chart-network', '#047857');
        globalThis.EventEmitter = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    });
    afterEach(() => { document.body.style.removeProperty('--chart-network'); });

    it('draws itself again in the colours of the mode a switch puts in force', async () => {
        // Black bars, drawn in Minimal's light mode, stayed black on the dark ground and
        // vanished (code review, 2026-10-26).
        const { AgNetworkTest } = await import('./ag-network-test.js');
        const el = new AgNetworkTest();
        el.querySelector = () => ({});
        el.resultData = { stats: { test_type: 'iperf3_udp', iperf3_stats: { jitter_history: [0.02, 0.03] } } };
        el._renderJitterChart();
        document.body.style.setProperty('--chart-network', '#aaaaaa');
        el._redrawForTheme();
        expect(el._jitterChart.config.data.datasets[0].backgroundColor).toBe('#aaaaaa');
    });

    it('redraws on a theme change and on a light/dark switch alike', async () => {
        const { AgNetworkTest } = await import('./ag-network-test.js');
        const el = new AgNetworkTest();
        el.connectedCallback();
        const handlers = Object.fromEntries(globalThis.EventEmitter.on.mock.calls);
        expect(handlers['theme-applied']).toBe(el._bindTheme);
        expect(handlers['theme-changed']).toBe(el._bindTheme);
        el.disconnectedCallback();
        const dropped = Object.fromEntries(globalThis.EventEmitter.off.mock.calls);
        expect(dropped['theme-changed']).toBe(el._bindTheme);
    });

    it('draws one bar per second of the run, in the theme\'s network colour', async () => {
        const { AgNetworkTest } = await import('./ag-network-test.js');
        const el = new AgNetworkTest();
        el.querySelector = () => ({});
        el.resultData = { stats: { test_type: 'iperf3_udp', iperf3_stats: { jitter_history: [0.024, 0.087, 0.019] } } };

        el._renderJitterChart();

        const { config } = el._jitterChart;
        expect(config.type).toBe('bar');
        expect(config.data.labels).toEqual(['1s', '2s', '3s']);
        const [dataset] = config.data.datasets;
        expect(dataset.data).toEqual([0.024, 0.087, 0.019]);
        expect(dataset.backgroundColor).toBe('#047857');
    });
});

describe('the servers suggested under the field', () => {
    beforeEach(() => {
        localStorage.removeItem('ag_iperf_history');
        globalThis.EventEmitter = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
        Object.assign(globalThis, { showToast: vi.fn(), handleError: vi.fn(), addToHistory: vi.fn() });
    });

    it('keep only a server the core took: one it refuses (422) is not suggested again', async () => {
        const api = await import('../../api.js');
        const { AgNetworkTest } = await import('./ag-network-test.js');
        const el = new AgNetworkTest();
        el.testType = 'iperf3_udp';
        const stored = () => JSON.parse(localStorage.getItem('ag_iperf_history') ?? '[]');

        el.config = { ...el.config, iperf3Server: '192.0.2.10:abc' };
        api.apiPost.mockRejectedValueOnce(new Error('422'));
        await el._startTest();
        expect(stored()).toEqual([]);

        el.config = { ...el.config, iperf3Server: '192.0.2.10:5201' };
        api.apiPost.mockResolvedValueOnce({ test_id: 't1' });
        await el._startTest();
        expect(stored()).toEqual(['192.0.2.10:5201']);
    });
});
