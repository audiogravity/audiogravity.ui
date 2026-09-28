/**
 * Unit tests for ag-latency-test — what the test sends, and what it refuses to send.
 *
 * The CPU affinity went out as `cpu_affinity` while the core reads `affinity`: it
 * was dropped, and the test never ran on the cores asked for. The fields allowed
 * values the core refuses (32 threads, 100 loops, priority 0), so the refusal only
 * came back once TEST was pressed.
 *
 * Covers:
 * 1. the default settings are within what the core accepts
 * 2. a setting outside it is named, with its range, before anything is sent
 * 3. the affinity goes out under the core's name — none by default, the cores typed otherwise
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
}));
vi.mock('../../common.js', () => ({
    apiGet: vi.fn(), apiPost: vi.fn(), AgTimerManager: {}, EventEmitter: { on: vi.fn(), off: vi.fn() },
    showToast: vi.fn(), handleError: vi.fn(), addToHistory: vi.fn(),
}));
vi.mock('../../test-history.js', () => ({
    saveLatencyResult: vi.fn(), getTestHistory: () => [], clearTestHistory: vi.fn(),
}));
vi.mock('../../ag-icons.js', () => ({ iconHistory: '' }));
vi.mock('../atoms/ag-stat-box.js', () => ({}));
vi.mock('../atoms/ag-switch.js', () => ({}));

globalThis.customElements ??= { define: () => {} };

const common = await import('../../common.js');
const { AgLatencyTest, LATENCY_LIMITS, latencyConfigProblem } = await import('./ag-latency-test.js');

/** A component as the constructor leaves it, without rendering. */
function latencyTest() {
    const el = Object.create(AgLatencyTest.prototype);
    el.config = {
        threads: 1, priority: 99, loops: 10000, interval_us: 100,
        histogram_max_us: 5000, cpu_affinity: '', mlockall: true, quiet: true,
    };
    el._startPolling = vi.fn();
    return el;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('the settings the core accepts', () => {
    it('the defaults pass', () => {
        expect(latencyConfigProblem(latencyTest().config)).toBe(null);
    });

    it.each([
        ['threads', 17, 'Threads must be between 1 and 16.'],
        ['priority', 0, 'Priority (RT) must be between 1 and 99.'],
        ['loops', 100, 'Loops must be between 1000 and 10000000.'],
        ['interval_us', 5, 'Interval (µs) must be between 10 and 10000.'],
        ['histogram_max_us', 60000, 'Histogram Max (µs) must be between 100 and 50000.'],
    ])('%s = %s is refused with its range', (key, value, message) => {
        expect(latencyConfigProblem({ ...latencyTest().config, [key]: value })).toBe(message);
    });

    it('matches the core (modules/performance/models.py)', () => {
        expect(LATENCY_LIMITS.threads).toMatchObject({ min: 1, max: 16 });
        expect(LATENCY_LIMITS.loops).toMatchObject({ min: 1000, max: 10000000 });
    });

    it('sends nothing when a setting is out of range', async () => {
        const el = latencyTest();
        el.config.threads = 32;
        await el._startTest();
        expect(common.apiPost).not.toHaveBeenCalled();
        expect(common.showToast).toHaveBeenCalledWith('error', 'Latency Test', 'Threads must be between 1 and 16.');
    });
});

describe('the affinity sent to the core', () => {
    it('goes out as affinity, empty by default', async () => {
        const el = latencyTest();
        common.apiPost.mockResolvedValueOnce({ test_id: 't1' });
        await el._startTest();
        const payload = common.apiPost.mock.calls[0][1];
        expect(payload).toHaveProperty('affinity', null);
        expect(payload).not.toHaveProperty('cpu_affinity');
    });

    it('carries the cores typed', async () => {
        const el = latencyTest();
        el.config.cpu_affinity = '2, 3';
        common.apiPost.mockResolvedValueOnce({ test_id: 't2' });
        await el._startTest();
        expect(common.apiPost.mock.calls[0][1].affinity).toEqual([2, 3]);
    });
});
