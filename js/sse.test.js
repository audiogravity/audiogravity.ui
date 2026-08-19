/**
 * Unit tests for js/sse.js — the routing between the SSE stream and the pages.
 *
 * These exist because of a defect no other test could have caught: the
 * `services_metrics` event was split into one `service-metrics-sse` per
 * service, and the envelope was dropped. Two pages had been subscribed to
 * `services-metrics` since v0.9.4 with nothing ever emitting it, so the note
 * explaining a dash on a service card was unreachable code — while its own
 * tests passed, because they called the handler directly instead of feeding it
 * an event. The wiring is the thing under test here.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

const emitted = [];

vi.mock('./api.js', () => ({
    apiGet: vi.fn(),
    buildAuthedUrl: vi.fn(() => null),
}));

vi.mock('./common.js', () => ({
    // The real throttle runs on the leading edge, so one event is delivered
    // synchronously. Kept faithful rather than stubbed to a pass-through: a
    // wrapper that swallowed the first call would make these tests lie.
    throttle: (fn, limit) => {
        let inThrottle = false;
        return (...args) => {
            if (inThrottle) return;
            fn(...args);
            inThrottle = true;
            setTimeout(() => { inThrottle = false; }, limit);
        };
    },
    AppState: {},
    EventEmitter: {
        emit: (type, data) => emitted.push({ type, data }),
        on: vi.fn(),
        off: vi.fn(),
    },
    AgTimerManager: { setInterval: vi.fn(), _lowPowerMode: false },
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleWorkerMessage } from './sse.js';

// The throttle wrapper is built once when the module loads, so its closed
// window survives from one test to the next. Fake timers are installed for the
// whole file and wound forward between tests to reopen it — without this, every
// test after the first sees an event that was silently dropped and fails for a
// reason that has nothing to do with routing.
beforeAll(() => { vi.useFakeTimers(); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { emitted.length = 0; vi.advanceTimersByTime(2000); });

/** One `services_metrics` event as the core sends it. */
function metricsEvent(overrides = {}) {
    return {
        data: {
            type: 'services_metrics',
            data: {
                count: 2,
                timestamp: '2026-08-19T06:00:00',
                memory_accounting: false,
                services: {
                    mpd: {
                        systemd_unit: 'mpd.service', state: 'active',
                        cpu_percent: 1.2, memory_mb: null, tasks: 12,
                        io_read_rate: null, io_write_rate: null,
                        network_rx_rate: null, network_tx_rate: null,
                    },
                    upmpdcli: {
                        systemd_unit: 'upmpdcli.service', state: 'active',
                        cpu_percent: 0.3, memory_mb: null, tasks: 4,
                        io_read_rate: 0.5, io_write_rate: 0.1,
                        network_rx_rate: 2.0, network_tx_rate: 0.2,
                    },
                },
                ...overrides,
            },
        },
    };
}

/** Events of one type, in order of emission. */
const of = (type) => emitted.filter(e => e.type === type);

describe('services_metrics routing', () => {
    it('emits the whole event, envelope included', () => {
        handleWorkerMessage(metricsEvent());

        const envelope = of('services-metrics');
        expect(envelope).toHaveLength(1);
        // The flag that says the box counts no memory travels once, on the
        // envelope — it is what lets a page explain the dashes instead of
        // drawing a flat graph that reads as "this service uses nothing".
        expect(envelope[0].data.memory_accounting).toBe(false);
        expect(Object.keys(envelope[0].data.services)).toEqual(['mpd', 'upmpdcli']);
    });

    it('still emits one event per service, unchanged', () => {
        handleWorkerMessage(metricsEvent());

        const perService = of('service-metrics-sse');
        expect(perService.map(e => e.data.serviceId)).toEqual(['mpd', 'upmpdcli']);
        expect(perService[0].data.metrics.memory_mb).toBeNull();
        expect(perService[1].data.metrics.network_rx_rate).toBe(2.0);
    });

    it('emits the envelope before the per-service events', () => {
        handleWorkerMessage(metricsEvent());

        const order = emitted
            .filter(e => e.type === 'services-metrics' || e.type === 'service-metrics-sse')
            .map(e => e.type);
        expect(order[0]).toBe('services-metrics');
    });

    it('carries a true memory_accounting through as well', () => {
        handleWorkerMessage(metricsEvent({ memory_accounting: true }));

        expect(of('services-metrics')[0].data.memory_accounting).toBe(true);
    });

    it('emits the envelope even when the event lists no service', () => {
        // A box whose monitored services are all stopped still tells the page
        // what its kernel counts; suppressing the envelope here would leave a
        // stale note on screen.
        handleWorkerMessage(metricsEvent({ services: {}, count: 0 }));

        expect(of('services-metrics')).toHaveLength(1);
        expect(of('service-metrics-sse')).toHaveLength(0);
    });

    it('delivers one event per throttle window, not one per subscriber', () => {
        handleWorkerMessage(metricsEvent());
        handleWorkerMessage(metricsEvent());

        // The second arrives inside the 1 s window and is dropped — for the
        // envelope exactly as for the per-service events, so the two can never
        // describe different cycles.
        expect(of('services-metrics')).toHaveLength(1);
        expect(of('service-metrics-sse')).toHaveLength(2);

        vi.advanceTimersByTime(1001);
        handleWorkerMessage(metricsEvent());
        expect(of('services-metrics')).toHaveLength(2);
    });
});

describe('worker errors', () => {
    it('routes nothing when the worker reports an error', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        handleWorkerMessage({ data: { type: 'error', error: 'Parse error for sysinfo: bad json' } });

        expect(of('services-metrics')).toHaveLength(0);
        expect(of('service-metrics-sse')).toHaveLength(0);
        spy.mockRestore();
    });

    it('names a dropped connection instead of logging undefined', () => {
        // The shape the worker actually sends when the stream drops — the common
        // failure, far more so than a parse error. It used to travel as `data`
        // while this handler reads `error`, so the one message an owner would
        // look for in the console read 'SSE Worker Error: undefined'.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        handleWorkerMessage({ data: { type: 'error', error: 'SSE connection failed' } });

        expect(spy).toHaveBeenCalledWith('SSE Worker Error:', 'SSE connection failed');
        spy.mockRestore();
    });
});

describe('the worker sends errors in the shape the page reads', () => {
    // A source-level guard, because the worker runs in its own context and no
    // unit test loads it. One of its three error paths posted the message as
    // `data` while handleWorkerMessage destructures `error` — a shape mismatch
    // nothing could catch from the page side, since the page behaves correctly
    // on the field it was given.
    const source = readFileSync(resolve(import.meta.dirname, '../public/js/sse-worker.js'), 'utf8');

    /**
     * Every postMessage(...) call in the source, matched by counting brackets.
     *
     * A regular expression cannot do this: two of the three error payloads are
     * template literals containing `${…}`, so any `[^}]*` stops at the first
     * interpolation and the call is never seen. The first version of this guard
     * did exactly that and inspected one call out of three — it went green while
     * covering nothing but the line that had just been fixed.
     *
     * @param {string} src - the worker source.
     * @returns {string[]} each call, from `postMessage(` to its closing paren.
     */
    function postMessageCalls(src) {
        const calls = [];
        const marker = 'postMessage(';
        for (let i = src.indexOf(marker); i !== -1; i = src.indexOf(marker, i + 1)) {
            let depth = 0;
            let j = i + marker.length - 1;
            for (; j < src.length; j++) {
                if (src[j] === '(') depth++;
                else if (src[j] === ')' && --depth === 0) break;
            }
            calls.push(src.slice(i, j + 1));
        }
        return calls;
    }

    const errorCalls = postMessageCalls(source).filter(c => /type:\s*'error'/.test(c));

    it('sees every error path in the file', () => {
        // Without this, a guard that stops matching silently checks less than it
        // claims — which is how the first version passed while blind to two of
        // the three paths.
        const declared = (source.match(/type:\s*'error'/g) || []).length;
        expect(declared).toBe(3);
        expect(errorCalls).toHaveLength(declared);
    });

    it('never posts an error without an error field', () => {
        // Anchored on the key, not on the word: `/\berror:/` alone is satisfied
        // by a message that merely reads "Connection error: …" inside the
        // payload, so a call that lost the field entirely still passed. Measured
        // — that is exactly what the second version of this guard did.
        for (const call of errorCalls) {
            expect(call, `error posted without an 'error' field: ${call}`).toMatch(/[{,]\s*error\s*:/);
        }
    });

    it('does not route an error through the generic forward helper', () => {
        // forward() posts { type, data }, which is right for events and wrong
        // for errors. Naming the failure mode keeps it from coming back.
        expect(source).not.toMatch(/forward\(\s*'error'/);
    });
});
