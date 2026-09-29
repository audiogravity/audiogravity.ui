/**
 * Unit tests for ag-governor-card — the THROTTLED badge, and the load chart.
 *
 * The card used to compare the throttle count it received with the previous one
 * it had seen, but the Performance tab rebuilds its cards on every reload, so no
 * card ever had a previous count and the badge never appeared. The comparison is
 * the core's now (core/cpu_throttle.py); the card shows what it is told.
 *
 * The load is drawn in bars, as on the System tiles, but on a scale from 0 to 100 %
 * shared by every core: each card used to scale its own curve to its own values, so
 * a core idling between 1 and 3 % drew as tall as one at 80 %. The time the bars
 * cover is written beside "Load", so that the chart keeps the card's size.
 *
 * Covers:
 * 1. the badge shows when the page says the core was throttled
 * 2. it does not otherwise — including on a count, which no longer decides anything
 * 3. the load is drawn in bars on a fixed 0–100 % scale, over the page's window
 * 4. the time covered is written beside "Load", and nothing before it is known
 * 5. the CPU number and its socket and core share one line, the badge after the number
 *    (the line this frees goes to the chart: css/performance.css)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../auth.js', () => ({ isGuest: () => false }));
// The sparkline needs ResizeObserver, which jsdom lacks; the badge does not need it.
vi.mock('../atoms/ag-sparkline.js', () => ({}));
await import('./ag-governor-card.js');
const { CPU_CORE_METRICS_WINDOW } = await import('../../core/metrics-window.js');

const cpu = {
    cpu_id: 0, physical_id: 0, core_id: 2, current_governor: 'performance',
    available_governors: ['performance', 'schedutil'], throttle_count: 42,
};

/**
 * Render a card and return it once updated.
 * @param {boolean|undefined} throttled - Value handed down by the page.
 * @param {Object} [props] - Other properties handed down by the page.
 */
async function card(throttled, props = {}) {
    const el = document.createElement('ag-governor-card');
    el.cpu = cpu;
    if (throttled !== undefined) el.throttled = throttled;
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the THROTTLED badge', () => {
    it('shows when the core says the core was throttled', async () => {
        const el = await card(true);
        expect(el.querySelector('.throttled-badge')?.textContent).toBe('THROTTLED');
    });

    it('stays away otherwise, whatever the count', async () => {
        expect((await card(false)).querySelector('.throttled-badge')).toBe(null);
        expect((await card(undefined)).querySelector('.throttled-badge')).toBe(null);
    });
});

describe('the header', () => {
    it('holds the CPU number and its socket and core on one line, the badge after the number', async () => {
        const el = await card(true);
        const header = el.querySelector('.governor-header');
        expect([...header.children].map((c) => c.className)).toEqual(['cpu-id', 'cpu-details']);
        expect(header.querySelector('.cpu-id').textContent.replace(/\s+/g, ' ').trim()).toBe('CPU 0 THROTTLED');
        expect(header.querySelector('.cpu-details').textContent).toBe('Socket: 0, Core: 2');
    });
});

describe('the load chart', () => {
    it('draws bars on a 0–100 % scale shared by every core, over the page window', async () => {
        const history = [1.5, null, 2, 80];
        const chart = (await card(false, { usageHistory: history })).querySelector('ag-sparkline');
        expect(chart.getAttribute('variant')).toBe('bars');
        expect(chart.getAttribute('slots')).toBe(String(CPU_CORE_METRICS_WINDOW));
        expect(chart.getAttribute('min-value')).toBe('0');
        expect(chart.getAttribute('max-value')).toBe('100');
        // Scaled to its own values, an idle core would draw as tall as a busy one.
        expect(chart.hasAttribute('auto-scale')).toBe(false);
        expect(chart.data).toBe(history);
    });

    it('writes the time the bars cover beside "Load"', async () => {
        const el = await card(false, { usageSpan: 10 * 60 * 1000 });
        expect(el.querySelector('.cpu-usage-label .cpu-usage-span')?.textContent).toBe('· 10m');
    });

    it('writes no time before two samples are known', async () => {
        const el = await card(false, { usageSpan: 0 });
        expect(el.querySelector('.cpu-usage-span')).toBe(null);
        expect(el.querySelector('.cpu-usage-label').textContent).toContain('Load');
    });
});
