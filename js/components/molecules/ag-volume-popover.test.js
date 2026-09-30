/**
 * Unit tests for ag-volume-popover — the self-healing live value.
 *
 * `_liveVolume` keeps the slider stable while SSE echoes lag a drag, but it
 * used to persist until the popover CLOSED: a volume the backend REFUSED
 * (mixerless output — /player/control answers 503 and the value never moves)
 * stayed on screen as a phantom. The fix is a grace timer: the dragged value
 * holds for LIVE_HOLD_MS after the last interaction, then the `volume` prop
 * (server truth, republished after every control) shows through. These tests
 * pin that release — that it happens, that interacting rearms it, and that a
 * confirmed change makes it invisible.
 *
 * And what the popover sends: a range input fires on every value it crosses,
 * and each event used to become a request. From the slider, `volume-change`
 * now goes out once per EMIT_INTERVAL_MS, always the latest value, and the
 * value it stops on as soon as the gesture ends — a pointer or a touch lifting
 * or cancelled, or the slider's `change`, which each key press fires. Step
 * buttons are sent at once, and nothing is sent once a gesture has ended: the
 * parents route the event to the source displayed when it arrives, so a late
 * value could change another one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import './ag-volume-popover.js';
import { AgVolumePopover } from './ag-volume-popover.js';

/**
 * Mount an open popover at a given confirmed volume.
 *
 * @param {number} volume - The parent-confirmed volume prop.
 * @returns {Promise<HTMLElement>} the mounted element
 */
async function mount(volume = 40) {
    const el = document.createElement('ag-volume-popover');
    el.volume = volume;
    document.body.appendChild(el);
    await el.updateComplete;
    el.toggle();
    await el.updateComplete;
    return el;
}

/**
 * Drag the slider to a value through the real input handler.
 *
 * @param {HTMLElement} el - Mounted popover.
 * @param {number} value - Target slider value.
 */
async function drag(el, value) {
    const slider = el.querySelector('.avp-slider');
    slider.value = String(value);
    slider.dispatchEvent(new Event('input'));
    await el.updateComplete;
}

/** @param {HTMLElement} el @returns {string} the value the header displays */
function shown(el) {
    return el.querySelector('.avp-val').textContent;
}

describe('ag-volume-popover live-value release', () => {
    beforeEach(() => { vi.useFakeTimers(); });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('shows the dragged value while the hold lasts', async () => {
        const el = await mount(40);
        await drag(el, 80);
        expect(shown(el)).toBe('80');
    });

    it('falls back to the prop after the hold — a refused volume snaps back', async () => {
        const el = await mount(40);
        await drag(el, 80);
        // Backend refused: the prop never moves off 40.
        vi.advanceTimersByTime(AgVolumePopover.LIVE_HOLD_MS + 1);
        await el.updateComplete;
        expect(shown(el)).toBe('40');
    });

    it('is invisible when the change was confirmed before the release', async () => {
        const el = await mount(40);
        await drag(el, 80);
        el.volume = 80; // SSE republish confirmed the new value
        vi.advanceTimersByTime(AgVolumePopover.LIVE_HOLD_MS + 1);
        await el.updateComplete;
        expect(shown(el)).toBe('80');
    });

    it('rearms on every interaction — no snap-back mid-drag', async () => {
        const el = await mount(40);
        await drag(el, 60);
        vi.advanceTimersByTime(AgVolumePopover.LIVE_HOLD_MS - 100);
        await drag(el, 80); // still dragging, just before expiry
        vi.advanceTimersByTime(AgVolumePopover.LIVE_HOLD_MS - 100);
        await el.updateComplete;
        expect(shown(el)).toBe('80'); // neither value was released
    });

    it('step buttons hold and release the same way', async () => {
        const el = await mount(40);
        el.querySelector('.avp-step-btn').click(); // volume down → 39
        await el.updateComplete;
        expect(shown(el)).toBe('39');
        vi.advanceTimersByTime(AgVolumePopover.LIVE_HOLD_MS + 1);
        await el.updateComplete;
        expect(shown(el)).toBe('40'); // refused: prop unchanged
    });

    it('closing releases immediately and cancels the timer', async () => {
        const el = await mount(40);
        await drag(el, 80);
        el.close();
        await el.updateComplete;
        expect(el._liveVolume).toBe(null);
        expect(el._liveReleaseTimer).toBe(null);
    });
});

/**
 * Record the volumes a popover emits.
 *
 * @param {HTMLElement} el - Mounted popover.
 * @returns {number[]} filled as `volume-change` events arrive
 */
function emitted(el) {
    const volumes = [];
    el.addEventListener('volume-change', (e) => volumes.push(e.detail.volume));
    return volumes;
}

/** Let go — a pointer lifting, seen on the window: it may have left the slider meanwhile. */
function lift() {
    window.dispatchEvent(new Event('pointerup'));
}

/**
 * Press an arrow key on the slider: a range input fires `input`, then `change`.
 *
 * @param {HTMLElement} el - Mounted popover.
 * @param {number} value - The value the key moves to.
 */
async function key(el, value) {
    await drag(el, value);
    el.querySelector('.avp-slider').dispatchEvent(new Event('change'));
}

describe('ag-volume-popover volume-change damping', () => {
    beforeEach(() => { vi.useFakeTimers(); });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('sends the first value of a drag at once', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 41);
        expect(sent).toEqual([41]);
    });

    it('sends one value per interval while the slider moves — the latest', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        for (let v = 41; v <= 60; v++) await drag(el, v); // one event per value crossed
        expect(sent).toEqual([41]);
        vi.advanceTimersByTime(AgVolumePopover.EMIT_INTERVAL_MS);
        expect(sent).toEqual([41, 60]);
    });

    it('lifting the finger sends the value it stops on at once, and nothing after', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 41);
        await drag(el, 55);
        lift();
        expect(sent).toEqual([41, 55]);
        vi.advanceTimersByTime(AgVolumePopover.EMIT_INTERVAL_MS * 4);
        expect(sent).toEqual([41, 55]);
    });

    it('a touch ending inside the popover is seen, though the popover stops touch events', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 41);
        await drag(el, 52);
        el.querySelector('.avp-slider').dispatchEvent(new Event('touchend', { bubbles: true }));
        expect(sent).toEqual([41, 52]);
    });

    it('a touch the browser takes back sends the value reached', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 41);
        await drag(el, 47);
        window.dispatchEvent(new Event('pointercancel'));
        expect(sent).toEqual([41, 47]);
    });

    it('a touch cancelled sends the value reached', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 41);
        await drag(el, 44);
        window.dispatchEvent(new Event('touchcancel'));
        expect(sent).toEqual([41, 44]);
    });

    it('a tap on the track sends its value once', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 70);
        lift();
        el.querySelector('.avp-slider').dispatchEvent(new Event('change'));
        vi.advanceTimersByTime(AgVolumePopover.EMIT_INTERVAL_MS * 4);
        expect(sent).toEqual([70]);
    });

    it('a drag down to 0 ends on 0', async () => {
        const el = await mount(10);
        const sent = emitted(el);
        for (let v = 9; v >= 0; v--) await drag(el, v);
        lift();
        expect(sent.at(-1)).toBe(0);
    });

    it('the keyboard sends each step at once, as before', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await key(el, 41);
        await key(el, 42);
        await key(el, 43);
        expect(sent).toEqual([41, 42, 43]);
    });

    it('a pointer pressed without a release leaves nothing held — a right click', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        el.querySelector('.avp-slider').dispatchEvent(new Event('pointerdown'));
        await key(el, 41);
        await key(el, 42);
        expect(sent).toEqual([41, 42]);
    });

    it('step buttons send each tap at once', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        const down = el.querySelector('.avp-step-btn');
        down.click(); down.click(); down.click();
        expect(sent).toEqual([39, 38, 37]);
    });

    it('nothing is sent once a gesture has ended — it could reach another source', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        el.querySelector('.avp-step-btn').click();
        await drag(el, 50);
        await drag(el, 52);
        lift();
        const settled = [...sent];
        vi.advanceTimersByTime(AgVolumePopover.EMIT_INTERVAL_MS * 10);
        expect(sent).toEqual(settled);
    });

    it('closing the popover mid-drag sends the value reached at once', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 41);
        await drag(el, 48);
        el.close();
        expect(sent).toEqual([41, 48]);
    });

    it('listens on the window only while open', async () => {
        const added = vi.spyOn(window, 'addEventListener');
        const removed = vi.spyOn(window, 'removeEventListener');
        const el = await mount(40); // mount() opens it
        const types = AgVolumePopover.GESTURE_END_EVENTS;
        for (const type of types) {
            expect(added.mock.calls.some(([t, , capture]) => t === type && capture === true)).toBe(true);
        }
        el.close();
        for (const type of types) {
            const handler = added.mock.calls.find(([t]) => t === type)[1];
            expect(removed.mock.calls.some(([t, h, c]) => t === type && h === handler && c === true)).toBe(true);
        }
        added.mockRestore();
        removed.mockRestore();
    });

    it('a value still waiting when the popover goes away is dropped, not sent later', async () => {
        const el = await mount(40);
        const sent = emitted(el);
        await drag(el, 41);
        await drag(el, 48);
        el.remove();
        vi.advanceTimersByTime(AgVolumePopover.EMIT_INTERVAL_MS * 4);
        lift();
        expect(sent).toEqual([41]);
    });
});
