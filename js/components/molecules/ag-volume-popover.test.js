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
