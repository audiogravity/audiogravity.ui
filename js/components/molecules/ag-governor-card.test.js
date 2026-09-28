/**
 * Unit tests for ag-governor-card — the THROTTLED badge.
 *
 * The card used to compare the throttle count it received with the previous one
 * it had seen, but the Performance tab rebuilds its cards on every reload, so no
 * card ever had a previous count and the badge never appeared. The comparison is
 * the core's now (core/cpu_throttle.py); the card shows what it is told.
 *
 * Covers:
 * 1. the badge shows when the page says the core was throttled
 * 2. it does not otherwise — including on a count, which no longer decides anything
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../auth.js', () => ({ isGuest: () => false }));
// The sparkline needs ResizeObserver, which jsdom lacks; the badge does not need it.
vi.mock('../atoms/ag-sparkline.js', () => ({}));
await import('./ag-governor-card.js');

const cpu = {
    cpu_id: 0, current_governor: 'performance',
    available_governors: ['performance', 'schedutil'], throttle_count: 42,
};

/**
 * Render a card and return it once updated.
 * @param {boolean|undefined} throttled - Value handed down by the page.
 */
async function card(throttled) {
    const el = document.createElement('ag-governor-card');
    el.cpu = cpu;
    if (throttled !== undefined) el.throttled = throttled;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the THROTTLED badge', () => {
    it('shows when the core says the core was throttled', async () => {
        const el = await card(true);
        expect(el.querySelector('.throttled-badge')?.textContent).toBe('THROTTLED');
    });

    it('stays away otherwise, whatever the count', async () => {
        expect((await card(false)).querySelector('.throttled-badge')).toBe(null);
        expect((await card(undefined)).querySelector('.throttled-badge')).toBe(null);
    });
});
