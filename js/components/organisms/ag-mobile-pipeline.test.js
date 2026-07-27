/**
 * Unit tests for ag-mobile-pipeline.js — data acquisition only, no DOM mount.
 *
 * What these tests really pin down is that the pipeline tab STOPS POLLING.
 * It used to re-request /audio_pipeline/current every 5 s; measured on the box
 * (2026-07-27) that endpoint costs ~570 ms of server time, so an open tab burned
 * roughly seven minutes of CPU per hour on the machine that plays the music
 * (CLAUDE.md rule 12). Reintroducing a poll on that endpoint has to fail here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {
        connectedCallback() {}
        disconnectedCallback() {}
    },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconSmartphone: '', iconServer: '', iconCpu: '', iconAudioWaveform: '',
    iconAudioLines: '', iconVolume: '', iconMusicNote: '', iconDatabase: '',
    iconConnection: '',
}));

import { apiGet } from '../../api.js';
import { AgMobilePipeline } from './ag-mobile-pipeline.js';

const PIPELINE = '/audio_pipeline/current';
const STEERING = '/steering/status';

/** Count the calls made to one endpoint. */
const callsTo = (path) => apiGet.mock.calls.filter(([p]) => p === path).length;

function makeEl() {
    const el = new AgMobilePipeline();
    // customElements.define ran at import time; the lifecycle is driven by hand here.
    AgMobilePipeline._injectStyles = vi.fn();
    return el;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    apiGet.mockResolvedValue({});
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ag-mobile-pipeline data acquisition', () => {
    it('requests the pipeline exactly once, then listens', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(0);

        expect(callsTo(PIPELINE)).toBe(1);
    });

    it('never polls the pipeline endpoint again, however long the tab stays open', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(5 * 60_000);

        // The old code would sit at 60 calls here.
        expect(callsTo(PIPELINE)).toBe(1);
    });

    it('takes its updates from the SSE event instead', () => {
        const el = makeEl();
        el.connectedCallback();

        window.dispatchEvent(new CustomEvent('audio-pipeline-update', {
            detail: { streams: [{ id: 'src_mpd' }] },
        }));

        expect(el._pipeline).toEqual({ streams: [{ id: 'src_mpd' }] });
        expect(callsTo(PIPELINE)).toBe(1);  // the event costs no request
    });

    it('still polls steering, which has no event on the dashboard channel', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(45_000);

        expect(callsTo(STEERING)).toBe(4);  // once on connect, then every 15 s
    });

    it('stops listening and polling once disconnected', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(0);
        el._pipeline = 'untouched';
        const steeringBefore = callsTo(STEERING);

        el.disconnectedCallback();
        window.dispatchEvent(new CustomEvent('audio-pipeline-update', { detail: { streams: [] } }));
        await vi.advanceTimersByTimeAsync(60_000);

        expect(el._pipeline).toBe('untouched');
        expect(callsTo(STEERING)).toBe(steeringBefore);
    });

    it('survives a failing backend without leaving the tab on the loader', async () => {
        apiGet.mockRejectedValue(new Error('backend down'));
        const el = makeEl();

        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(0);

        expect(el._loading).toBe(false);
    });
});
