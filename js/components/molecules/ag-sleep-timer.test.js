/**
 * Unit tests for ag-sleep-timer.
 *
 * While it counted, the button showed the time left alone: "14:52" in the player's
 * header, beside the queue button, read as the time of day. The clock now stays,
 * with the time left beside it.
 *
 * Covers:
 * 1. idle: the clock, nothing else
 * 2. counting: the clock, then the time left, which ticks down
 * 3. cancelled: back to the clock alone
 * 4. the popover: presets, and Cancel only while counting
 * 5. the gap between the clock and the time left is on the spacing scale
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readStylesheet, cssRuleBody } from '../../test-utils.js';
import './ag-sleep-timer.js';

/**
 * Mount a sleep timer.
 * @param {object} props - Properties to set on it.
 * @returns {Promise<HTMLElement>} The mounted element.
 */
async function timer(props = {}) {
    const el = document.createElement('ag-sleep-timer');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/**
 * What the header button shows, in order: 'clock' for the icon, the text otherwise.
 * @param {HTMLElement} el - The sleep timer.
 * @returns {string[]}
 */
function shown(el) {
    const button = el.querySelector('button[aria-label="Sleep timer"]');
    return [...button.children].map((c) => (c.tagName.toLowerCase() === 'svg' ? 'clock' : c.textContent.trim()));
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });

describe('the header button', () => {
    it('shows the clock alone while no timer is set', async () => {
        const el = await timer();
        expect(shown(el)).toEqual(['clock']);
        expect(el.querySelector('button').classList.contains('active')).toBe(false);
    });

    it('keeps the clock and shows the time left beside it while counting', async () => {
        vi.useFakeTimers();
        const el = await timer({ sleepEnd: Date.now() + 15 * 60 * 1000 });
        expect(shown(el)).toEqual(['clock', '15:00']);
        expect(el.querySelector('button').classList.contains('active')).toBe(true);
    });

    it('counts the time left down', async () => {
        vi.useFakeTimers();
        const el = await timer({ sleepEnd: Date.now() + 15 * 60 * 1000 });
        vi.advanceTimersByTime(8000);
        await el.updateComplete;
        expect(shown(el)).toEqual(['clock', '14:52']);
    });

    it('goes back to the clock alone once the timer is cleared', async () => {
        const el = await timer({ sleepEnd: Date.now() + 30 * 60 * 1000 });
        el.sleepEnd = null;
        await el.updateComplete;
        expect(shown(el)).toEqual(['clock']);
        expect(el._tick).toBeNull();
    });
});

describe('the popover', () => {
    it('offers the presets and sends the one chosen', async () => {
        const el = await timer();
        const sent = [];
        el.addEventListener('sleep-set', (e) => sent.push(e.detail));
        el.querySelector('button').click();
        await el.updateComplete;
        const options = [...el.querySelectorAll('.ag-st-opt')].map((b) => b.textContent.trim());
        expect(options).toEqual(['15 min', '30 min', '45 min', '60 min']);
        el.querySelectorAll('.ag-st-opt')[1].click();
        await el.updateComplete;
        expect(sent).toEqual([{ minutes: 30 }]);
        expect(el.querySelector('.ag-st-popover')).toBeNull();
    });

    it('offers Cancel only while counting', async () => {
        const el = await timer({ sleepEnd: Date.now() + 15 * 60 * 1000 });
        let cancelled = 0;
        el.addEventListener('sleep-cancel', () => { cancelled += 1; });
        el.querySelector('button').click();
        await el.updateComplete;
        el.querySelector('.ag-st-opt.cancel').click();
        expect(cancelled).toBe(1);

        el.sleepEnd = null;
        el.querySelector('button').click();
        await el.updateComplete;
        expect(el.querySelector('.ag-st-opt.cancel')).toBeNull();
    });
});

describe('its style', () => {
    it('spaces the clock and the time left with a step of the scale', () => {
        const sheet = readStylesheet('css', 'components', 'sleep-timer.css');
        expect(cssRuleBody(sheet, '.ag-st-btn')).toMatch(/gap:\s*var\(--spacing-xs\)/);
    });
});
