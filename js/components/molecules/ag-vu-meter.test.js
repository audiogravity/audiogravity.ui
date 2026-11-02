/**
 * Tests for ag-vu-meter — two VU dials moved by the core's level stream.
 *
 * The needle's law first (pure functions), then the component: it follows the stream
 * only while it is in a visible page — a meter subscribed keeps MPD's copy of its
 * stream on — and turns its needles without rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const unsubscribe = vi.fn();
const subscribeLevels = vi.fn(() => unsubscribe);
vi.mock('../../library-store.js', () => ({ subscribeLevels: (...a) => subscribeLevels(...a) }));

import { VU_REFERENCE_DBFS, needleAngle, stepNeedle, vuAmplitude } from './ag-vu-meter.js';

describe('the needle\'s law', () => {
    it('rests at silence and reads 0 VU at the reference', () => {
        expect(vuAmplitude(null)).toBe(0);
        expect(vuAmplitude(-Infinity)).toBe(0);
        expect(vuAmplitude(VU_REFERENCE_DBFS)).toBeCloseTo(1, 6);
        expect(vuAmplitude(VU_REFERENCE_DBFS + 6)).toBeCloseTo(1.995, 3);
    });

    it('sweeps 90 degrees from rest to +3 VU, and pins a little past it', () => {
        expect(needleAngle(0)).toBe(-45);
        expect(needleAngle(10 ** (3 / 20))).toBeCloseTo(45, 6);
        expect(needleAngle(100)).toBeCloseTo(-45 + 90 * 1.06, 6);
        // A VU scale: 0 VU stands right of centre, the marks crowding towards −20.
        expect(needleAngle(1)).toBeGreaterThan(15);
        expect(needleAngle(10 ** (-10 / 20))).toBeLessThan(-20);
    });

    it('reaches 99 % of a step in about 300 ms, without overshoot', () => {
        let state = [0, 0];
        let peak = 0;
        let at99 = null;
        for (let frame = 1; frame <= 60; frame++) {
            state = stepNeedle(...state, 1, 1 / 60);
            peak = Math.max(peak, state[0]);
            if (at99 === null && state[0] >= 0.99) at99 = frame / 60;
        }
        expect(at99).toBeGreaterThan(0.25);
        expect(at99).toBeLessThan(0.36);
        expect(peak).toBeLessThan(1.01);
    });

    it('takes a long pause between frames as 50 ms', () => {
        const [position] = stepNeedle(0, 0, 1, 10);
        expect(position).toBeCloseTo(stepNeedle(0, 0, 1, 0.05)[0], 9);
    });
});

describe('ag-vu-meter', () => {
    let frames;

    beforeEach(() => {
        subscribeLevels.mockClear();
        unsubscribe.mockClear();
        frames = [];
        vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
        vi.stubGlobal('cancelAnimationFrame', () => {});
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    async function meter(props = {}) {
        const el = document.createElement('ag-vu-meter');
        Object.assign(el, props);
        document.body.appendChild(el);
        await el.updateComplete;
        return el;
    }

    /** Run the frames the component asked for, at ``now`` milliseconds. */
    function runFrames(now) {
        const due = frames;
        frames = [];
        for (const cb of due) cb(now);
    }

    it('draws a left and a right dial', async () => {
        const el = await meter();
        const faces = el.querySelectorAll('.ag-vu-face');
        expect([...faces].map((f) => f.getAttribute('aria-label'))).toEqual([
            'Left channel level meter', 'Right channel level meter']);
        expect(el.querySelectorAll('.ag-vu-needle')).toHaveLength(2);
        expect(el.querySelectorAll('.ag-vu-label')).toHaveLength(22);   // 11 marks a dial
    });

    it('says its look and its layout to the stylesheet', async () => {
        const el = await meter({ variant: 'classic', layout: 'auto' });
        expect(el.getAttribute('variant')).toBe('classic');
        expect(el.getAttribute('layout')).toBe('auto');
    });

    it('follows the stream while it is in the page, and leaves it when it goes', async () => {
        const el = await meter();
        expect(subscribeLevels).toHaveBeenCalledTimes(1);
        el.remove();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('leaves the stream while the page is hidden: the box turns the copy off', async () => {
        await meter();
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        visibility.mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        expect(subscribeLevels).toHaveBeenCalledTimes(2);
        visibility.mockRestore();
    });

    it('fed by hand, follows nothing', async () => {
        await meter({ live: false });
        expect(subscribeLevels).not.toHaveBeenCalled();
    });

    it('turns its needles with the levels, without rendering', async () => {
        const el = await meter({ live: false });
        const render = vi.spyOn(el, 'render');
        const [left, right] = el.querySelectorAll('.ag-vu-needle');
        // The stream's 25 levels a second, on a clock of the test's own.
        let t = 1000;
        const clock = vi.spyOn(performance, 'now').mockImplementation(() => t);
        for (let i = 1; i <= 30; i++) {
            t += 16;
            if (i % 2 === 1) el.setLevels([VU_REFERENCE_DBFS, null]);
            runFrames(t);
        }
        clock.mockRestore();
        const angle = (needle) => Number(needle.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]);
        expect(angle(left)).toBeGreaterThan(10);
        expect(angle(right)).toBe(-45);
        expect(render).not.toHaveBeenCalled();
    });

    it('lets its needles fall when the levels stop, then asks for no more frames', async () => {
        const el = await meter({ live: false });
        el.setLevels([VU_REFERENCE_DBFS, VU_REFERENCE_DBFS]);
        const start = performance.now();
        let now = start;
        for (let i = 0; i < 200 && frames.length; i++) runFrames(now += 16);
        expect(frames).toHaveLength(0);
        const [left] = el.querySelectorAll('.ag-vu-needle');
        expect(Number(left.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1])).toBeCloseTo(-45, 0);
    });

    it('lights its peak lamp when a level goes into the red', async () => {
        const el = await meter({ live: false });
        el.setLevels([VU_REFERENCE_DBFS + 4, VU_REFERENCE_DBFS]);
        runFrames(performance.now());
        const [left, right] = el.querySelectorAll('.ag-vu-peak');
        expect(left.classList.contains('on')).toBe(true);
        expect(right.classList.contains('on')).toBe(false);
    });

    it('says why when the box cannot measure', async () => {
        const el = await meter({ live: false });
        el.setStatus({ state: 'unavailable', reason: 'not_configured' });
        await el.updateComplete;
        expect(el.querySelector('.ag-vu-message').textContent).toContain('not set up on this box');
        el.setStatus({ state: 'idle' });
        await el.updateComplete;
        expect(el.querySelector('.ag-vu-message')).toBeNull();
    });
});

import { readStylesheet, cssRuleBody, mediaBlock } from '../../test-utils.js';

describe('ag-vu-meter — the dials\' layout', () => {
    // jsdom lays nothing out: the contract is read from the stylesheet. Stacked dials
    // with a flex basis of 0 had no height — two borders in the cover's place, the
    // needles moving out of sight (measured in Chromium, 390 px wide, 2026-11-01).
    const sheet = readStylesheet('css', 'components', 'vu-meter.css');

    it('gives a dial no flex basis of its own: stacked, it takes its drawing\'s height', () => {
        expect(cssRuleBody(sheet, 'ag-vu-meter .ag-vu-face')).not.toMatch(/flex\s*:/);
    });

    it('shares the width between the dials side by side', () => {
        expect(cssRuleBody(sheet, 'ag-vu-meter[layout="auto"] .ag-vu-face')).toMatch(/flex:\s*1 1 0/);
        expect(sheet).toMatch(/ag-vu-meter\[layout="row"\] \.ag-vu-face,\s*ag-vu-meter\[layout="auto"\] \.ag-vu-face\s*\{/);
    });

    it('stacks the showcase\'s dials in portrait, at their full height', () => {
        const portrait = mediaBlock(sheet.slice(sheet.indexOf('flex: 1 1 0')), /@media\s*\(orientation:\s*portrait\)/);
        expect(cssRuleBody(portrait, 'ag-vu-meter[layout="auto"] .ag-vu-face')).toMatch(/flex:\s*none/);
    });
});
