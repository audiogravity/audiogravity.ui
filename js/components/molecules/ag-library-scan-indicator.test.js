/**
 * Unit tests for ag-library-scan-indicator — the post-apply MPD scan poller.
 * Covers the state machine: optimistic start, scanning→done flash, the
 * "too fast to catch" give-up path, API-error tolerance, disconnect cleanup
 * and the passive re-attach probe (resume an in-flight scan on remount).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api.js', () => ({ apiGet: vi.fn() }));

import { apiGet } from '../../api.js';
import './ag-library-scan-indicator.js';

const POLL_MS = 1500;

/** Mount a fresh element with a given connect-probe result and flush it. */
async function mount(probeResult = { scanning: false }) {
    apiGet.mockResolvedValue(probeResult);
    const el = document.createElement('ag-library-scan-indicator');
    document.body.appendChild(el);          // fires connectedCallback → _resume
    await vi.advanceTimersByTimeAsync(0);    // flush the passive probe
    await el.updateComplete;
    return el;
}

describe('ag-library-scan-indicator', () => {
    let el;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        el?.remove();
        vi.useRealTimers();
    });

    it('renders nothing while idle', async () => {
        el = await mount({ scanning: false });
        expect(el.querySelector('.ag-lsi')).toBeNull();
    });

    it('shows the indexing row once a scan is observed', async () => {
        el = await mount({ scanning: false });
        apiGet.mockReset();
        apiGet.mockResolvedValue({ scanning: true });
        el.start();
        await vi.advanceTimersByTimeAsync(0); // flush first poll
        await el.updateComplete;
        const row = el.querySelector('.ag-lsi');
        expect(row).not.toBeNull();
        expect(row.classList.contains('done')).toBe(false);
        expect(row.textContent).toContain('Indexing library');
    });

    it('flashes "indexed" then hides when the scan completes', async () => {
        el = await mount({ scanning: false });
        apiGet.mockReset();
        apiGet
            .mockResolvedValueOnce({ scanning: true })
            .mockResolvedValue({ scanning: false });
        el.start();
        await vi.advanceTimersByTimeAsync(0);       // poll 1: scanning
        await vi.advanceTimersByTimeAsync(POLL_MS); // poll 2: idle → done
        await el.updateComplete;
        expect(el._state).toBe('done');
        expect(el.querySelector('.ag-lsi.done')).not.toBeNull();

        await vi.advanceTimersByTimeAsync(2500);    // done flash expires
        await el.updateComplete;
        expect(el._state).toBe('idle');
        expect(el.querySelector('.ag-lsi')).toBeNull();
    });

    it('gives up quietly when no scan is ever caught (too fast)', async () => {
        el = await mount({ scanning: false });
        apiGet.mockReset();
        apiGet.mockResolvedValue({ scanning: false });
        el.start();
        // Optimistic first paint shows the row before any idle poll resolves.
        await vi.advanceTimersByTimeAsync(0);
        // Three consecutive idle polls → give up, no "done" flash.
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
        await el.updateComplete;
        expect(el._state).toBe('idle');
        expect(el.querySelector('.ag-lsi')).toBeNull();
    });

    it('tolerates a failing status endpoint without throwing', async () => {
        el = await mount({ scanning: false });
        apiGet.mockReset();
        apiGet.mockRejectedValue(new Error('boom'));
        el.start();
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
        await el.updateComplete;
        expect(el._state).toBe('idle');
    });

    it('stops polling once disconnected', async () => {
        el = await mount({ scanning: false });
        apiGet.mockReset();
        apiGet.mockResolvedValue({ scanning: true });
        el.start();
        await vi.advanceTimersByTimeAsync(0);
        const callsBefore = apiGet.mock.calls.length;
        el.remove(); // disconnectedCallback → _stop()
        await vi.advanceTimersByTimeAsync(POLL_MS * 5);
        expect(apiGet.mock.calls.length).toBe(callsBefore);
    });

    it('resumes the indicator on mount when a scan is already running', async () => {
        // Simulate switching back to the config tab mid-index: a fresh element
        // whose connect probe finds MPD still scanning must show the indicator
        // without anyone calling start().
        el = await mount({ scanning: true });
        expect(el._state).toBe('indexing');
        expect(el.querySelector('.ag-lsi')).not.toBeNull();
        expect(el.querySelector('.ag-lsi').textContent).toContain('Indexing library');

        // And it keeps polling until the scan settles.
        apiGet.mockReset();
        apiGet.mockResolvedValue({ scanning: false });
        await vi.advanceTimersByTimeAsync(POLL_MS);
        await el.updateComplete;
        expect(el._state).toBe('done');
    });
});
