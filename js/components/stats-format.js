/**
 * @module StatsFormat
 * @description How the listening history's figures read: a time listened, a share, the
 * days and months of its chart, the moment of a listen. Shared by the history's view and
 * its parts, so that a time reads the same in the headline, a bar and a row.
 *
 * Dates are the box's local days as the core sends them (`YYYY-MM-DD`), read by localDay
 * (utils-lit.js) so that no day moves.
 */
import { localDay } from './utils-lit.js';

/**
 * A time listened, to the minute: `45 min`, `1 h 05`, `312 h`.
 *
 * @param {number|null|undefined} seconds - Seconds listened.
 * @returns {string} `0 min` for nothing; any time at all reads at least a minute.
 */
export function fmtListened(seconds) {
    const s = Number(seconds) || 0;
    if (s <= 0) return '0 min';
    const minutes = Math.max(1, Math.round(s / 60));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours >= 100) return `${Math.round(minutes / 60)} h`;
    return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * A part of a whole, in whole percent: `38 %`; under one percent, `<1 %`.
 *
 * @param {number} part - The part.
 * @param {number} whole - The whole.
 * @returns {string} `0 %` when the whole is nothing.
 */
export function fmtShare(part, whole) {
    if (!whole || !part) return '0 %';
    const pct = (part / whole) * 100;
    return pct < 1 ? '<1 %' : `${Math.round(pct)} %`;
}

/**
 * A day or a month of the chart, as its readout names it: `Mon 12 Oct`, `October 2026`.
 *
 * @param {string} iso - The bucket's first day.
 * @param {'day'|'month'} unit - What a bucket is.
 * @returns {string}
 */
export function fmtBucket(iso, unit) {
    const day = localDay(iso);
    if (!day) return String(iso || '');
    return unit === 'month'
        ? day.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The labels under the chart's bars: every one when there is room, else the first, the
 * middle and the last.
 *
 * @param {Array<{start: string}>} buckets - The bars, oldest first.
 * @param {'day'|'month'} unit - What a bar is.
 * @returns {string[]} One label per bar; '' where none is shown.
 */
export function bucketLabels(buckets, unit) {
    const n = buckets.length;
    const every = n <= 12;
    const middle = Math.floor((n - 1) / 2);
    return buckets.map((b, i) => {
        const day = localDay(b.start);
        if (!day) return '';
        if (every) {
            return unit === 'month'
                ? day.toLocaleDateString(undefined, { month: 'narrow' })
                : day.toLocaleDateString(undefined, { weekday: 'short' });
        }
        if (i !== 0 && i !== middle && i !== n - 1) return '';
        // The year in full: "Sep 25" read as a day, the 25th of September.
        return unit === 'month'
            ? day.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
            : day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    });
}

/**
 * A rounded top for the chart's scale, at or above its largest bar: whole minutes under
 * an hour, whole hours above.
 *
 * @param {number} seconds - The largest bar.
 * @returns {number} Seconds; at least a minute.
 */
export function niceCeiling(seconds) {
    const s = Math.max(Number(seconds) || 0, 60);
    const steps = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200, 250,
                   300, 400, 500, 600, 800, 1000];
    if (s <= 3600) {
        const minutes = steps.find(x => x * 60 >= s) ?? 60;
        return minutes * 60;
    }
    const hours = steps.find(x => x * 3600 >= s) ?? Math.ceil(s / 3600);
    return hours * 3600;
}

/**
 * When a listen started, as the latest listens show it: the time today, `Yesterday`, the
 * day this week, else the date.
 *
 * @param {string} iso - When it started (UTC, ISO 8601).
 * @param {Date} [now] - The present.
 * @returns {string}
 */
export function fmtWhen(iso, now = new Date()) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
    if (days <= 0) return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return at.toLocaleDateString(undefined, { weekday: 'long' });
    return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short',
        year: at.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
