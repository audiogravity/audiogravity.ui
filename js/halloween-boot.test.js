/**
 * Unit tests for public/halloween-boot.js: the one rule that says it is Halloween.
 *
 * The script runs as the page would run it, with a document of its own each time, so that
 * the listeners of one test never hear another's events.
 *
 * Covers:
 * 1. 31 October on the device's clock, whatever the year — not the days around it
 * 2. ?halloween any day, read once as the page opens
 * 3. the class kept right while the page stays open: when it comes back into view, at
 *    midnight, and within the hour of a clock set late — one timer waiting at a time
 * 4. loaded before the first paint on both pages
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readStylesheet } from './test-utils.js';

const SOURCE = readStylesheet('public', 'halloween-boot.js');

/**
 * Open a page at a moment, with an address: the script runs once, on a document of its own.
 *
 * @param {Date} at - The device's clock.
 * @param {string} [search] - The address's query string.
 */
function open(at, search = '') {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(at);
    const listeners = [];
    const page = {
        documentElement: document.createElement('html'),
        visibilityState: 'visible',
        addEventListener: (type, fn) => listeners.push([type, fn]),
    };
    const location = { search };
    new Function('document', 'location', SOURCE)(page, location);
    return {
        location,
        get on() { return page.documentElement.classList.contains('ag-halloween'); },
        /** The page is hidden or shown again. */
        show(state = 'visible') {
            page.visibilityState = state;
            for (const [type, fn] of listeners) if (type === 'visibilitychange') fn();
        },
    };
}

afterEach(() => { vi.useRealTimers(); });

describe('the day', () => {
    it.each([
        [new Date(2026, 9, 31, 0, 0, 1), true],
        [new Date(2026, 9, 31, 23, 59, 59), true],
        [new Date(2031, 9, 31, 12, 0), true],
        [new Date(2026, 9, 30, 23, 59, 59), false],
        [new Date(2026, 10, 1, 0, 0), false],
        [new Date(2026, 2, 31, 12, 0), false],   // another month's 31st
    ])('%s: %s', (at, expected) => {
        expect(open(at).on).toBe(expected);
    });
});

describe('a look on another day', () => {
    it.each([
        ['?halloween', true],
        ['?halloween=1', true],
        ['?tab=library&halloween', true],
        ['?halloweenx', false],
        ['?nohalloween', false],
        ['', false],
    ])('"%s": %s', (search, expected) => {
        expect(open(new Date(2026, 4, 12, 10, 0), search).on).toBe(expected);
    });

    it('lasts while the page stays open, though the app moves to another address', () => {
        const page = open(new Date(2026, 4, 12, 10, 0), '?halloween');
        page.location.search = '';
        page.show();
        expect(page.on).toBe(true);
        vi.advanceTimersByTime(24 * 3600_000);
        expect(page.on).toBe(true);
    });
});

describe('kept right while the page stays open', () => {
    it('reads the date again when the page comes back into view: an app left open across midnight', () => {
        const page = open(new Date(2026, 9, 30, 22, 0));
        page.show('hidden');
        vi.setSystemTime(new Date(2026, 9, 31, 7, 30));
        expect(page.on).toBe(false);   // hidden, nothing read
        page.show();
        expect(page.on).toBe(true);
        page.show('hidden');
        vi.setSystemTime(new Date(2026, 10, 1, 7, 30));
        page.show();
        expect(page.on).toBe(false);
    });

    it('reads it again at midnight, for a screen left on all night', () => {
        const page = open(new Date(2026, 9, 30, 23, 59, 30));
        expect(page.on).toBe(false);
        vi.advanceTimersByTime(30_000);
        expect(page.on).toBe(false);   // midnight exactly: a second's grace
        vi.advanceTimersByTime(1_000);
        expect(page.on).toBe(true);
        vi.advanceTimersByTime(24 * 3600_000);
        expect(page.on).toBe(false);
    });

    it('sees within the hour a clock set right after the page opened', () => {
        // A box's screen started on a clock still a day behind; then the time is set.
        const page = open(new Date(2026, 9, 30, 8, 0));
        expect(page.on).toBe(false);
        vi.setSystemTime(new Date(2026, 9, 31, 8, 0));
        vi.advanceTimersByTime(3600_000);
        expect(page.on).toBe(true);
    });

    it('keeps one timer waiting, however often the page comes back', () => {
        const page = open(new Date(2026, 9, 31, 9, 0));
        for (let i = 0; i < 5; i += 1) page.show();
        expect(vi.getTimerCount()).toBe(1);
    });
});

describe('where it runs', () => {
    it.each(['index.html', 'login.html'])('%s loads it as a plain script, before the stylesheet', (file) => {
        const page = readStylesheet(file);
        const tag = '<script src="/halloween-boot.js"></script>';
        expect(page.split(tag)).toHaveLength(2);
        expect(page.indexOf(tag)).toBeLessThan(page.indexOf('<link rel="stylesheet" href="css/main.css">'));
        expect(page.indexOf(tag)).toBeLessThan(page.indexOf('<body'));
    });
});
