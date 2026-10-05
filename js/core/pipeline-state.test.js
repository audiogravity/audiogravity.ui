/**
 * Unit tests for pipeline-state.js — the newest pipeline the page knows.
 *
 * The diagram and the list beside it each kept their own copy, and either could go back
 * in time: a reading of the core that came back after a live update, the offline replay
 * of a pipeline saved up to 5 s earlier, a component opened again after updates it had
 * not been there to hear. The diagram's Audio events wrote such steps back as playbacks.
 *
 * Covers:
 * 1. which of two pipelines is the newer, by the time the core computed it
 * 2. the core is read once for the callers of the moment, and not at all once a live
 *    update is held
 * 3. an older pipeline, from either side, never replaces a newer one
 * 4. a failed reading is not kept
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiGet = vi.fn();
vi.mock('../api.js', () => ({ apiGet: (...args) => apiGet(...args) }));

/** A fresh copy of the module: what it holds is held per page. */
async function fresh() {
    vi.resetModules();
    return import('./pipeline-state.js');
}

/** A live update from the core. */
function live(pipeline) {
    window.dispatchEvent(new CustomEvent('audio-pipeline-update', { detail: pipeline }));
}

const AT = (time) => ({ timestamp: `2026-10-04T13:${time}`, nodes: [] });

beforeEach(() => {
    apiGet.mockReset();
});

describe('the newer of two pipelines', () => {
    it('is the one the core computed later', async () => {
        const { isNewerPipeline } = await fresh();
        expect(isNewerPipeline(AT('39:36.252100'), AT('39:36.146661'))).toBe(true);
        expect(isNewerPipeline(AT('39:36.146661'), AT('39:36.252100'))).toBe(false);
    });

    it('is not the same pipeline come again', async () => {
        const { isNewerPipeline } = await fresh();
        expect(isNewerPipeline(AT('39:36.146661'), AT('39:36.146661'))).toBe(false);
    });

    it('orders a time whose fraction the core left out, at zero, as its value', async () => {
        const { isNewerPipeline } = await fresh();
        expect(isNewerPipeline(AT('39:37'), AT('39:36.999999'))).toBe(true);
        expect(isNewerPipeline(AT('39:36.000001'), AT('39:36'))).toBe(true);
    });

    it('is any pipeline when none is held, or when one has no time to order by', async () => {
        const { isNewerPipeline } = await fresh();
        expect(isNewerPipeline(AT('39:36'), null)).toBe(true);
        expect(isNewerPipeline({ nodes: [] }, AT('39:36'))).toBe(true);
        expect(isNewerPipeline({ timestamp: 'soon', nodes: [] }, AT('39:36'))).toBe(true);
        expect(isNewerPipeline(null, AT('39:36'))).toBe(false);
    });

    it('reads the two ways the core writes universal time as one instant', async () => {
        // "…Z" over REST, "…+00:00" over the stream (read on the dev instance, 2026-10-04).
        const { isNewerPipeline } = await fresh();
        const rest = { timestamp: '2026-10-04T20:14:05.106461Z' };
        const stream = { timestamp: '2026-10-04T20:14:05.106461+00:00' };
        expect(isNewerPipeline(rest, stream)).toBe(false);
        expect(isNewerPipeline(stream, rest)).toBe(false);
        expect(isNewerPipeline({ timestamp: '2026-10-04T20:14:05.106462+00:00' }, rest)).toBe(true);
    });

    it('orders the hour repeated when the clocks go back by when it was', async () => {
        // 25/10 in Paris: 02:55 summer time comes before 02:10 winter time. As text,
        // the second sorted first, and the page held on to the older pipeline.
        const { isNewerPipeline } = await fresh();
        const summer = { timestamp: '2026-10-25T02:55:00.000000+02:00' };
        const winter = { timestamp: '2026-10-25T02:10:00.000000+01:00' };
        expect(isNewerPipeline(winter, summer)).toBe(true);
        expect(isNewerPipeline(summer, winter)).toBe(false);
        // As the core stamps them now, in universal time.
        expect(isNewerPipeline({ timestamp: '2026-10-25T01:10:00Z' },
            { timestamp: '2026-10-25T00:55:00Z' })).toBe(true);
    });
});

describe('the pipeline now', () => {
    it('reads the core once for the callers of the moment', async () => {
        const { currentPipeline } = await fresh();
        let answer;
        apiGet.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));

        const diagram = currentPipeline();
        const list = currentPipeline();
        answer(AT('39:36'));

        expect(await diagram).toEqual(AT('39:36'));
        expect(await list).toBe(await diagram);
        expect(apiGet).toHaveBeenCalledExactlyOnceWith('/audio_pipeline/current');
    });

    it('asks the core nothing once it holds a live update', async () => {
        const { currentPipeline } = await fresh();
        live(AT('40:06'));

        expect(await currentPipeline()).toEqual(AT('40:06'));
        expect(apiGet).not.toHaveBeenCalled();
    });

    it('keeps the live update that arrived while the reading was on its way, if newer', async () => {
        const { currentPipeline } = await fresh();
        let answer;
        apiGet.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));

        const reading = currentPipeline();
        live(AT('40:06'));
        answer(AT('39:36'));

        expect(await reading).toEqual(AT('40:06'));
    });

    it('keeps the reading when it is the newer of the two', async () => {
        // Measured on the dev instance: a reading of 13:39:36.252 against a live update
        // of 13:39:36.146 — two computations overlapping.
        const { currentPipeline } = await fresh();
        let answer;
        apiGet.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));

        const reading = currentPipeline();
        live(AT('39:36.146661'));
        answer(AT('39:36.252100'));

        expect(await reading).toEqual(AT('39:36.252100'));
    });

    it('sets aside an older live update — the offline replay of a saved pipeline', async () => {
        const { currentPipeline } = await fresh();
        live(AT('40:06'));
        live(AT('39:58'));

        expect(await currentPipeline()).toEqual(AT('40:06'));
    });

    it('keeps no failure: the next caller reads the core again', async () => {
        const { currentPipeline } = await fresh();
        apiGet.mockRejectedValueOnce(new Error('offline'));
        await expect(currentPipeline()).rejects.toThrow('offline');

        apiGet.mockResolvedValueOnce(AT('39:36'));
        expect(await currentPipeline()).toEqual(AT('39:36'));
        expect(apiGet).toHaveBeenCalledTimes(2);
    });
});
