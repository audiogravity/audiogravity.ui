/**
 * Unit tests for the frontend performance cockpit, after LOW POWER went.
 *
 * LOW POWER turned the app's animations off, refreshed its live figures half as often
 * and slowed two checks, on the device showing the app; it switched itself on from
 * the battery level in Chromium browsers alone, and took three taps to turn off after
 * a manual switch. Nothing on the box depended on it, and the Animations setting
 * already turns animations off: it was removed, with the Device Battery tile that
 * accompanied it (decided with the user on 2026-09-28).
 *
 * Covers:
 * 1. the cockpit shows neither the badge nor the battery, and does not read it
 * 2. a timer runs at the interval it was given
 * 3. nothing in the app reads the battery
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSources, flat } from '../../test-utils.js';

vi.mock('lit', () => ({
    LitElement: class { requestUpdate() {} connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
}));
vi.mock('../../common.js', () => ({
    AgTimerManager: { setInterval: vi.fn(), clearInterval: vi.fn(), listActiveTimers: () => [] },
    sseStats: { totalEvents: 0, eventsInLastSecond: 0, startTime: Date.now(), eventsByType: {} },
}));
vi.mock('../atoms/ag-button.js', () => ({}));
vi.mock('../atoms/ag-stat-box.js', () => ({}));

globalThis.customElements ??= { define: () => {} };

const { AgPerfMonitor } = await import('./ag-perf-monitor.js');

afterEach(() => { vi.unstubAllGlobals(); });

describe('the cockpit', () => {
    it('shows neither LOW POWER nor the battery', () => {
        const el = new AgPerfMonitor();
        el.expanded = true;
        const out = flat(el.render());
        expect(out).toContain('UI Performance Cockpit');
        expect(out).not.toMatch(/LOW POWER|Battery|Effective/);
    });

    it('does not read the battery when it opens', () => {
        const getBattery = vi.fn();
        vi.stubGlobal('navigator', { ...navigator, getBattery });
        new AgPerfMonitor().connectedCallback();
        expect(getBattery).not.toHaveBeenCalled();
    });
});

describe('the timers', () => {
    it('run at the interval they were given', async () => {
        vi.resetModules();
        vi.doUnmock('../../common.js');
        const { AgTimerManager } = await import('../../timer.js');
        const spy = vi.spyOn(globalThis, 'setInterval');
        AgTimerManager.setInterval('probe', () => {}, 1234, false);
        expect(spy).toHaveBeenCalledWith(expect.any(Function), 1234);
        expect(AgTimerManager.listActiveTimers().find(t => t.id === 'probe'))
            .toEqual({ id: 'probe', interval: 1234, pauseOnHidden: false, running: true, ticks: 0 });
        AgTimerManager.clearInterval('probe');
        spy.mockRestore();
    });
});

describe('the app', () => {
    it('never reads the battery', () => {
        const readers = appSources().filter((file) => readFileSync(file, 'utf8').includes('getBattery'));
        expect(readers).toEqual([]);
    });
});
