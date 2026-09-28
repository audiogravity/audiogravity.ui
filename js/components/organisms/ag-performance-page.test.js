/**
 * Unit tests for ag-performance-page — what Apply All offers.
 *
 * Apply All offered the first core's governor as read at the last load of the
 * page, and changing a core on its card reloads nothing: a governor just chosen
 * on a card was offered back as its old value.
 *
 * Covers:
 * 1. after a choice on a card, Apply All offers that governor
 * 2. with no choice made, it offers the first core's; with nothing known, performance
 * 3. a failed choice is not offered
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
