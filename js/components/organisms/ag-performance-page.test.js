/**
 * Unit tests for ag-performance-page — what Apply All offers, and the load history.
 *
 * Apply All offered the first core's governor as read at the last load of the
 * page, and changing a core on its card reloads nothing: a governor just chosen
 * on a card was offered back as its old value.
 *
 * Each core's load is kept like the System tab's metrics: a window of the newest
 * samples, a gap after a pause in the stream, and the arrival times, from which a
 * card says how long its bars cover.
 *
 * Covers:
 * 1. after a choice on a card, Apply All offers that governor
 * 2. with no choice made, it offers the first core's; with nothing known, performance
 * 3. a failed choice is not offered
 * 4. each core keeps the newest samples of its window
 * 5. a pause in the stream opens a gap in every core; a normal silence does not
 * 6. the samples are timed, for the span a card writes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CPU_CORE_METRICS_WINDOW, MAX_SAMPLE_GAP_MS, spanOfLast } from '../../core/metrics-window.js';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: Symbol('nothing'),
}));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../common.js', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    AppState: {},
    addToHistory: vi.fn(),
    handleError: vi.fn(),
    getUserFriendlyError: vi.fn(),
    EventEmitter: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('../../auth.js', () => ({ isGuest: () => false }));
vi.mock('../../core/FetchController.js', () => ({ FetchController: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('../../utils.js', () => ({ logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } }));
vi.mock('../../components/molecules/ag-rt-monitor.js', () => ({}));
vi.mock('../atoms/ag-button.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-governor-card.js', () => ({}));
vi.mock('../atoms/ag-stat-box.js', () => ({}));
vi.mock('./ag-latency-test.js', () => ({}));
vi.mock('./ag-network-test.js', () => ({}));

globalThis.customElements ??= { define: () => {} };

const common = await import('../../common.js');
const { AgPerformancePage } = await import('./ag-performance-page.js');

/** A page that knows two cores, both on schedutil. */
function page() {
    const el = Object.create(AgPerformancePage.prototype);
    el.cpuInfo = [
        { cpu_id: 0, current_governor: 'schedutil' },
        { cpu_id: 1, current_governor: 'schedutil' },
    ];
    el._lastChosenGovernor = null;
    el._loadData = vi.fn();
    el._cpuMetricsMap = new Map();
    el._historyTimes = [];
    return el;
}

/** The governor Apply All asks to confirm. */
async function offered(el) {
    common.showConfirm.mockResolvedValueOnce(false);
    await el._applyAllGovernors();
    return common.showConfirm.mock.calls.at(-1)[1];
}

beforeEach(() => { vi.clearAllMocks(); });

describe('Apply All', () => {
    it('offers the governor just chosen on a card', async () => {
        const el = page();
        common.apiPost.mockResolvedValueOnce({});
        await el._handleGovernorChange({ detail: { cpuId: 1, governor: 'performance' } });

        expect(await offered(el)).toBe('Set "performance" governor on all CPUs?');
        expect(el.cpuInfo[1].current_governor).toBe('performance');
    });

    it("offers the first core's governor when none was chosen", async () => {
        expect(await offered(page())).toBe('Set "schedutil" governor on all CPUs?');
    });

    it('falls back to performance when nothing is known', async () => {
        const el = page();
        el.cpuInfo = [];
        expect(await offered(el)).toBe('Set "performance" governor on all CPUs?');
    });

    it('does not offer a choice the box refused', async () => {
        const el = page();
        common.apiPost.mockRejectedValueOnce(new Error('refused'));
        await el._handleGovernorChange({ detail: { cpuId: 1, governor: 'powersave' } });

        expect(await offered(el)).toBe('Set "schedutil" governor on all CPUs?');
    });

    it('puts the governor the box reports raw', async () => {
        // showConfirm shows a string message as text: escaped, `&lt;` would show.
        const el = page();
        el.cpuInfo[0].current_governor = '<b>x</b>';
        expect(await offered(el)).toBe('Set "<b>x</b>" governor on all CPUs?');
    });
});

describe('the load of each core', () => {
    afterEach(() => { vi.useRealTimers(); });

    /** Hand the page one monitoring update, arriving at `at` (ms), with these loads. */
    function update(el, at, loads) {
        vi.setSystemTime(at);
        el._handleSysinfoUpdate({ cpu_per_core: loads });
    }

    it('keeps the newest samples of the window, per core', () => {
        vi.useFakeTimers();
        const el = page();
        for (let i = 0; i < CPU_CORE_METRICS_WINDOW + 5; i++) update(el, i * 2000, [i, 100 - i]);

        const first = el._cpuMetricsMap.get(0).history;
        expect(first).toHaveLength(CPU_CORE_METRICS_WINDOW);
        expect(first[0]).toBe(5);
        expect(first.at(-1)).toBe(CPU_CORE_METRICS_WINDOW + 4);
        expect(el._cpuMetricsMap.get(1).history.at(-1)).toBe(100 - (CPU_CORE_METRICS_WINDOW + 4));
        expect(el._historyTimes).toHaveLength(CPU_CORE_METRICS_WINDOW);
    });

    it('opens a gap in every core after a pause in the stream', () => {
        vi.useFakeTimers();
        const el = page();
        update(el, 0, [5, 6]);
        update(el, MAX_SAMPLE_GAP_MS + 1, [7, 8]);

        expect(el._cpuMetricsMap.get(0).history).toEqual([5, null, 7]);
        expect(el._cpuMetricsMap.get(1).history).toEqual([6, null, 8]);
        expect(el._historyTimes).toHaveLength(3);
    });

    it('opens none over the silence of a stream at its slowest rate', () => {
        vi.useFakeTimers();
        const el = page();
        update(el, 0, [5, 6]);
        update(el, 30_000, [7, 8]);

        expect(el._cpuMetricsMap.get(0).history).toEqual([5, 7]);
    });

    it('times the samples, for the span a card writes', () => {
        vi.useFakeTimers();
        const el = page();
        [0, 10_000, 20_000].forEach((at, i) => update(el, at, [i, i]));

        expect(spanOfLast(el._historyTimes, el._cpuMetricsMap.get(0).history.length)).toBe(20_000);
    });
});
