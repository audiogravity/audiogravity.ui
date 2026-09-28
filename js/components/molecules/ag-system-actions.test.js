/**
 * Unit tests for ag-system-actions — coming back after Restart Core / Reboot OS.
 *
 * The reconnect loop polled a bare '/health', which asks the server serving the
 * page: on an installed box that path does not exist, so the loop never saw the
 * core come back and the page stayed on "Restarting…" until reloaded by hand.
 *
 * Covers:
 * 1. the loop asks the core, through API_BASE_URL, and reloads once it answers
 * 2. it keeps polling while the core is away, and does not reload on a failure
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({
    showConfirm: vi.fn(), showPasswordConfirm: vi.fn(), showToast: vi.fn(), getUserFriendlyError: vi.fn(),
}));
vi.mock('../../auth.js', () => ({ isAdmin: () => true }));

const { API_BASE_URL } = await import('../../core/config.js');
await import('./ag-system-actions.js');

describe('reconnect polling after a restart', () => {
    let el;
    let reload;
    const originalLocation = window.location;

    beforeEach(() => {
        vi.useFakeTimers();
        reload = vi.fn();
        Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } });
        el = document.createElement('ag-system-actions');
        document.body.appendChild(el);
    });

    afterEach(() => {
        el._stopReconnectPolling();
        el.remove();
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('asks the core for /health and reloads once it answers', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        el._startReconnectPolling(false);
        await vi.advanceTimersByTimeAsync(3000 + 2000);

        expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/health`, { cache: 'no-store' });
        expect(`${API_BASE_URL}/health`).not.toBe('/health');
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('keeps polling while the core is away', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        el._startReconnectPolling(false);
        await vi.advanceTimersByTimeAsync(3000 + 2000);
        expect(reload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2000);
        expect(reload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2000);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
