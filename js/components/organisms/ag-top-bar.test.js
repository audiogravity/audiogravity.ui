/**
 * Tests for the top bar's machine metrics: the figures a reading shows, and their colours.
 *
 * The real component on the real bus (common.js), readings delivered the way the
 * stream delivers them (sse.js's handleWorkerMessage).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Partial: common.js calls initAuth as it loads, so the real module must stay.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    // common.js gates its own module load on this and throws otherwise.
    requireAuth: () => true,
}));

import { AppState } from '../../common.js';
import { handleWorkerMessage, updateConnectionStatus } from '../../sse.js';
import './ag-top-bar.js';

const READING = { uptime: 7200, cpu_percent: 12.5, cpu_temp: 45.2, memory_percent: 35.8 };

/** Mount a bar in the document, as the app does. */
async function mount() {
    const el = document.createElement('ag-top-bar');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/** The figures as the bar shows them — none when it shows none. */
function figures(el) {
    return [...el.querySelectorAll('.system-metrics .metric-value')].map(v => v.textContent.trim());
}

/**
 * A reading arriving on the stream. sse.js hands on one per second at most: the
 * clock is moved past that, so the next one is not dropped.
 */
async function streamed(el, data) {
    handleWorkerMessage({ data: { type: 'sysinfo', data: { ...data } } });
    vi.advanceTimersByTime(1000);
    await el.updateComplete;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // No stream open yet: nothing kept from another test.
    updateConnectionStatus(false);
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('ag-top-bar — machine metrics', () => {
    it('shows the four figures of a reading', async () => {
        const el = await mount();
        await streamed(el, READING);

        const [uptime, cpu, temp, memory] = figures(el);
        expect(uptime).not.toBe('--');
        expect([cpu, temp, memory]).toEqual(['12.5%', '45.2°C', '35.8%']);
    });

    it('does not show an unknown temperature as a hot one', async () => {
        // Before the first reading — and for good on a machine with no sensor —
        // the temperature is unknown: a dash, not the red glow of a critical one.
        const el = await mount();
        const temp = el.querySelectorAll('.system-metrics .metric-value')[2];

        expect(temp.textContent.trim()).toBe('--°C');
        expect(temp.classList.contains('activity-high')).toBe(false);
    });

    it('gives no colour to any figure it does not know', async () => {
        const el = await mount();
        await streamed(el, { uptime: 60, cpu_percent: null, memory_percent: null, cpu_temp: null });

        const bands = [...el.querySelectorAll('.system-metrics .metric-value')]
            .map(v => [...v.classList].filter(c => c.startsWith('activity-')));
        expect(bands).toEqual([[], [], [], []]);
    });

    it('colours each figure by its own bands', async () => {
        // Values chosen where the bands differ: CPU from 50 % and 80 %, temperature
        // from 60 °C and 75 °C, memory from 60 % and 85 %. Read with another figure's
        // bands, each would change colour.
        const el = await mount();
        await streamed(el, { cpu_percent: 82, cpu_temp: 55, memory_percent: 82 });

        const [, cpu, temp, memory] = el.querySelectorAll('.system-metrics .metric-value');
        expect([cpu, temp, memory].map(v => [...v.classList].find(c => c.startsWith('activity-'))))
            .toEqual(['activity-high', 'activity-low', 'activity-medium']);
    });
});
