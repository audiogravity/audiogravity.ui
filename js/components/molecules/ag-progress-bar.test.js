/**
 * Unit tests for ag-progress-bar — the live variant.
 *
 * A radio station has no end to count down to and no position to seek to. The
 * bar showed its knob stuck at the start, the time listened on one side and
 * "−0:00" on the other; it now gives way to a "Live" marker.
 *
 * Covers:
 * 1. live: the marker replaces the track and the times
 * 2. live and paused: the marker says so, in the grey of the greyed transport buttons
 * 3. live: nothing ticks
 * 4. back to a track: the bar and its ticker return
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readStylesheet, cssRuleBody } from '../../test-utils.js';
import './ag-progress-bar.js';

/**
 * The value of one declaration in a rule's body.
 * @param {string|null} body - The text between a rule's braces (see cssRuleBody).
 * @param {string} property - The property's name.
 * @returns {string|undefined} Its value as written, or undefined when not declared.
 */
function declared(body, property) {
    return body?.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1].trim();
}

/**
 * Mount a progress bar.
 * @param {object} props - Properties to set on it.
 */
async function bar(props) {
    const el = document.createElement('ag-progress-bar');
    Object.assign(el, { title: 'Ma Benz', serverElapsed: 0, duration: 0, ...props });
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });

describe('a live broadcast', () => {
    it('shows a Live marker instead of the track and the times', async () => {
        const el = await bar({ live: true, playing: true });
        const marker = el.querySelector('.ag-pb-live');
        expect(marker).not.toBeNull();
        expect(marker.textContent.trim()).toBe('Live');
        expect(el.querySelector('.ag-pb-track')).toBeNull();
        expect(el.querySelector('.ag-pb-times')).toBeNull();
    });

    it('dims the marker while paused', async () => {
        const el = await bar({ live: true, playing: false });
        expect(el.querySelector('.ag-pb-live').classList.contains('ag-pb-live--paused')).toBe(true);
        el.playing = true;
        await el.updateComplete;
        expect(el.querySelector('.ag-pb-live').classList.contains('ag-pb-live--paused')).toBe(false);
    });

    it('greys out paused in the shade of the greyed transport buttons', () => {
        // Same colour at the same opacity composes to the same shade on any background,
        // the cover-tinted one of the full player included. A grey token of its own
        // (--text-secondary) read as a third, stronger shade beside the buttons.
        const bar = readStylesheet('css', 'components', 'progress-bar.css');
        const controls = readStylesheet('css', 'components', 'playback-controls.css');
        const paused = cssRuleBody(bar, '.ag-pb-live--paused');
        expect(declared(cssRuleBody(bar, '.ag-pb-live'), 'color'))
            .toBe(declared(cssRuleBody(controls, '.ag-pc-ctrl'), 'color'));
        expect(declared(paused, 'color')).toBeUndefined();
        expect(declared(paused, 'opacity'))
            .toBe(declared(cssRuleBody(controls, '.ag-pc-ctrl:disabled'), 'opacity'));
    });

    it('ticks nothing', async () => {
        vi.useFakeTimers();
        const el = await bar({ live: true, playing: true });
        vi.advanceTimersByTime(3000);
        expect(el._elapsed).toBe(0);
        expect(el._ticker).toBeNull();
    });
});

describe('back to a track', () => {
    it('brings the bar, its times and its ticker back', async () => {
        vi.useFakeTimers();
        const el = await bar({ live: true, playing: true });
        Object.assign(el, { live: false, title: 'So What', serverElapsed: 10, duration: 545 });
        await el.updateComplete;
        expect(el.querySelector('.ag-pb-live')).toBeNull();
        expect(el.querySelector('.ag-pb-track')).not.toBeNull();
        expect(el.querySelector('.ag-pb-times')).not.toBeNull();
        vi.advanceTimersByTime(2000);
        expect(el._elapsed).toBeGreaterThan(10);
    });

    it('ticks for a track that starts playing as its title changes', async () => {
        // The same update carried the new title and `playing`: the new-track branch
        // used to return before the ticker was armed, and the position stood still.
        vi.useFakeTimers();
        const el = await bar({ title: 'Track A', duration: 200, serverElapsed: 50, playing: false });
        Object.assign(el, { title: 'Track B', serverElapsed: 1, playing: true });
        await el.updateComplete;
        vi.advanceTimersByTime(2000);
        expect(el._elapsed).toBe(3);
    });
});
