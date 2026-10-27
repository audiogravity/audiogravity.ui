/**
 * Tests for stats-format — how the listening history's figures read.
 *
 * Pinned: a time reads to the minute and never as nothing when something played; a share
 * never reads 0 % for a part that exists; the days are the box's local ones, whatever the
 * viewer's zone; the scale's top is a round value at or above the largest bar.
 */
import { describe, it, expect } from 'vitest';
import {
    HEAT_LEVELS, bucketLabels, fmtBucket, fmtHour, fmtListened, fmtShare, fmtWhen, heatLevel,
    niceCeiling, weekdayNames,
} from './stats-format.js';
import { fmtIsoDate, localDay } from './utils-lit.js';

describe('fmtListened', () => {
    it.each([
        [0, '0 min'], [null, '0 min'], [undefined, '0 min'], [-5, '0 min'],
        [10, '1 min'], [89, '1 min'], [91, '2 min'], [59 * 60, '59 min'],
        [3600, '1 h 00'], [3600 + 5 * 60, '1 h 05'], [3600 + 59 * 60 + 40, '2 h 00'],
        [99 * 3600, '99 h 00'], [100 * 3600, '100 h'], [312.4 * 3600, '312 h'],
    ])('%s s reads %s', (seconds, expected) => {
        expect(fmtListened(seconds)).toBe(expected);
    });
});

describe('fmtShare', () => {
    it.each([
        [38, 100, '38 %'], [1, 3, '33 %'], [1, 200, '<1 %'], [0, 100, '0 %'], [5, 0, '0 %'],
    ])('%s of %s reads %s', (part, whole, expected) => {
        expect(fmtShare(part, whole)).toBe(expected);
    });
});

describe('the days', () => {
    it('a day is the local midnight of its date, never the day before', () => {
        const day = localDay('2026-10-16');
        expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()])
            .toEqual([2026, 9, 16, 0]);
        expect(localDay('not a day')).toBeNull();
    });

    it('the licence\'s end reads through the same day', () => {
        expect(fmtIsoDate('2026-12-31')).toBe(new Date(2026, 11, 31).toLocaleDateString());
        expect(fmtIsoDate('2026-12-31T10:00:00Z')).toBe('2026-12-31T10:00:00Z');
        expect(fmtIsoDate(null)).toBe('');
    });

    it('a bar is read as its day, or its month, in British English whatever the browser', () => {
        // The browser's language wrote "lun. 12 oct." on a phone set to French; the test
        // runner's own (en-US) would write "Mon, Oct 12".
        expect(fmtBucket('2026-10-12', 'day')).toBe('Mon 12 Oct');
        expect(fmtBucket('2026-10-01', 'month')).toBe('October 2026');
    });

    it('labels every bar of a week or a year, three of a month', () => {
        const week = Array.from({ length: 7 }, (_, i) => ({ start: `2026-10-${String(10 + i).padStart(2, '0')}` }));
        expect(bucketLabels(week, 'day').every(Boolean)).toBe(true);
        const month = Array.from({ length: 30 }, (_, i) => ({ start: `2026-09-${String(i + 1).padStart(2, '0')}` }));
        const labels = bucketLabels(month, 'day');
        expect(labels.filter(Boolean)).toHaveLength(3);
        expect([labels[0], labels[14], labels[29]].every(Boolean)).toBe(true);
        const october = Array.from({ length: 31 }, (_, i) => ({ start: `2026-10-${String(i + 1).padStart(2, '0')}` }));
        expect(bucketLabels(october, 'day').filter(Boolean)).toEqual(['1 Oct', '16 Oct', '31 Oct']);
        expect(bucketLabels(week, 'day')).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    });

    it('a month of a long history carries its whole year: "Sep 25" read as a day', () => {
        const months = Array.from({ length: 20 }, (_, i) => {
            const d = new Date(2025, 2 + i, 1);
            return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` };
        });
        const first = bucketLabels(months, 'month')[0];
        expect(first).toContain('2025');
    });
});

describe('niceCeiling', () => {
    it.each([
        [0, 60], [45, 60], [61, 120], [25 * 60, 25 * 60], [26 * 60, 30 * 60], [3600, 3600],
        [3601, 2 * 3600], [7.5 * 3600, 8 * 3600], [31 * 3600, 40 * 3600],
    ])('%s s tops at %s s', (largest, expected) => {
        expect(niceCeiling(largest)).toBe(expected);
    });
});

describe('fmtWhen', () => {
    const now = new Date(2026, 9, 16, 21, 30);

    it('today, the time; yesterday, the word; this week, the day; else the date', () => {
        expect(fmtWhen(new Date(2026, 9, 16, 20, 58).toISOString(), now))
            .toBe(new Date(2026, 9, 16, 20, 58).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
        expect(fmtWhen(new Date(2026, 9, 15, 23, 50).toISOString(), now)).toBe('Yesterday');
        // The day and the month named in British English; a time keeps the browser's digits.
        expect(fmtWhen(new Date(2026, 9, 12, 10, 0).toISOString(), now)).toBe('Monday');
        expect(fmtWhen(new Date(2026, 7, 1, 10, 0).toISOString(), now)).toBe('1 Aug');
        expect(fmtWhen(new Date(2025, 7, 1, 10, 0).toISOString(), now)).toBe('1 Aug 2025');
        expect(fmtWhen('nonsense', now)).toBe('');
    });
});

describe('heatLevel', () => {
    it.each([
        [0, 3600, 0], [null, 3600, 0], [-5, 3600, 0], [600, 0, 0],
        [1, 3600, 1], [900, 3600, 1], [901, 3600, 2], [1800, 3600, 2],
        [2700, 3600, 3], [2701, 3600, 4], [3600, 3600, 4], [5000, 3600, HEAT_LEVELS],
    ])('%s s against a busiest hour of %s s is step %s', (seconds, busiest, expected) => {
        expect(heatLevel(seconds, busiest)).toBe(expected);
    });

    it('any time at all is drawn: never the step of nothing', () => {
        expect(heatLevel(0.5, 100_000)).toBe(1);
    });
});

describe('the week', () => {
    it('names its seven days Monday first', () => {
        const short = weekdayNames('short');
        expect(short).toHaveLength(7);
        expect(short).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        expect(weekdayNames('long')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    });

    it.each([[0, '00:00'], [7, '07:00'], [21, '21:00']])('hour %s reads %s', (hour, expected) => {
        expect(fmtHour(hour)).toBe(expected);
    });
});
