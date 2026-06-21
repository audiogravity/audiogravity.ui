/**
 * Unit tests for ag-network-test.js — memory leak fix (P2).
 * Fix: _jitterChart.destroy() must be called in disconnectedCallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
