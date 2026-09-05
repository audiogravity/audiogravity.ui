/**
 * Unit tests for utils-lit.js — pure formatting and utility functions.
 */
import { describe, it, expect , vi, afterEach} from 'vitest';
import {
    safeToFixed, formatMemory, formatUptime, formatRate,
    fmtDuration, getActivityLevel, getActivityLevelForCPU,
    getActivityLevelForMemory, getActivityLevelForRate,
    coverUrl, pickPrimaryCoverToken,
    formatTimestamp, loadConnection, svgIcon, catalogueErrorMessage, fmtIsoDate, isPast, planLabel } from './utils-lit.js';

describe('svgIcon', () => {
    it('wraps an icon in a sized <svg> with the Lucide stroke convention', () => {
        const tpl = svgIcon('ICON');
        expect(tpl.strings.join('')).toContain('<svg viewBox="0 0 24 24"');
        expect(tpl.strings.join('')).toContain('stroke="currentColor"');
        expect(tpl.values).toContain('ICON');
        expect(tpl.values).toContain('1em');   // default size
    });
    it('honours a custom size', () => {
        expect(svgIcon('X', { size: '22px' }).values).toContain('22px');
    });
});

describe('safeToFixed', () => {
    it('formats valid numbers', () => {
        expect(safeToFixed(3.14159, 2)).toBe('3.14');
        expect(safeToFixed(100, 0)).toBe('100');
    });
    it('returns fallback for null/undefined/NaN', () => {
        expect(safeToFixed(null)).toBe('--');
        expect(safeToFixed(undefined)).toBe('--');
        expect(safeToFixed(NaN)).toBe('--');
    });
    it('supports custom fallback', () => {
        expect(safeToFixed(null, 1, 'N/A')).toBe('N/A');
    });
});

describe('formatMemory', () => {
    it('formats MB', () => {
        expect(formatMemory(512)).toBe('512 MB');
    });
    it('formats GB', () => {
        expect(formatMemory(1536)).toBe('1.5 GB');
    });
    it('handles null', () => {
        expect(formatMemory(null)).toBe('--');
    });
});

describe('formatUptime', () => {
    it('formats days', () => {
        expect(formatUptime(90000)).toBe('1d 1h');
    });
    it('formats hours', () => {
        expect(formatUptime(7200)).toBe('2h 0m');
    });
    it('formats minutes', () => {
        expect(formatUptime(300)).toBe('5m');
    });
    it('handles null', () => {
        expect(formatUptime(null)).toBe('--');
    });
});

describe('formatRate', () => {
    it('formats MB/s', () => {
        expect(formatRate(5.5)).toBe('5.5 MB/s');
    });
    it('formats GB/s', () => {
        expect(formatRate(1500)).toBe('1.5 GB/s');
    });
    it('formats KB/s', () => {
        expect(formatRate(0.5)).toBe('512 KB/s');
    });
    it('handles non-number', () => {
        expect(formatRate('abc')).toBe('0.0 MB/s');
    });
});

describe('fmtDuration', () => {
    it('formats seconds as M:SS', () => {
        expect(fmtDuration(65)).toBe('1:05');
        expect(fmtDuration(0)).toBe('0:00');
        expect(fmtDuration(3661)).toBe('61:01');
    });
    it('returns --:-- for null/NaN', () => {
        expect(fmtDuration(null)).toBe('--:--');
        expect(fmtDuration(undefined)).toBe('--:--');
        expect(fmtDuration(NaN)).toBe('--:--');
    });
});

describe('getActivityLevel', () => {
    it('returns correct levels', () => {
        expect(getActivityLevel(75)).toBe('high');
        expect(getActivityLevel(25)).toBe('medium');
        expect(getActivityLevel(5)).toBe('low');
    });
    it('handles non-number', () => {
        expect(getActivityLevel('abc')).toBe('low');
    });
});

describe('getActivityLevelForCPU', () => {
    it('returns correct levels', () => {
        expect(getActivityLevelForCPU(30)).toBe('high');
        expect(getActivityLevelForCPU(10)).toBe('medium');
        expect(getActivityLevelForCPU(2)).toBe('low');
    });
});

describe('getActivityLevelForMemory', () => {
    it('returns correct levels', () => {
        expect(getActivityLevelForMemory(200)).toBe('high');
        expect(getActivityLevelForMemory(50)).toBe('medium');
        expect(getActivityLevelForMemory(10)).toBe('low');
    });
});

describe('getActivityLevelForRate', () => {
    it('returns correct levels', () => {
        expect(getActivityLevelForRate(10)).toBe('high');
        expect(getActivityLevelForRate(3)).toBe('medium');
        expect(getActivityLevelForRate(0.5)).toBe('low');
    });
});

describe('pickPrimaryCoverToken', () => {
    it('returns track token when only track', () => {
        expect(pickPrimaryCoverToken({ cover_token: 'trk' })).toBe('trk');
    });
    it('returns station token when only station', () => {
        expect(pickPrimaryCoverToken({ station_logo_token: 'stn' })).toBe('stn');
    });
    it('returns null for empty item', () => {
        expect(pickPrimaryCoverToken({})).toBeNull();
    });
    it('returns null for null', () => {
        expect(pickPrimaryCoverToken(null)).toBeNull();
    });
    it('prefers track when both present (default)', () => {
        expect(pickPrimaryCoverToken({ cover_token: 'trk', station_logo_token: 'stn' })).toBe('trk');
    });
    it('prefers station when preferStation=true', () => {
        expect(pickPrimaryCoverToken(
            { cover_token: 'trk', station_logo_token: 'stn' },
            { preferStation: true }
        )).toBe('stn');
    });
});

describe('formatTimestamp', () => {
    it('returns -- for null', () => {
        expect(formatTimestamp(null)).toBe('--');
    });
    it('returns -- for undefined', () => {
        expect(formatTimestamp(undefined)).toBe('--');
    });
    it('returns "Just now" for recent timestamps', () => {
        const now = new Date().toISOString();
        expect(formatTimestamp(now)).toBe('Just now');
    });
    it('returns Xm ago for timestamps within an hour', () => {
        const t = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        expect(formatTimestamp(t)).toBe('5m ago');
    });
    it('returns Xh ago for timestamps within 24h', () => {
        const t = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        expect(formatTimestamp(t)).toBe('2h ago');
    });
    it('returns locale string for timestamps older than 24h', () => {
        const t = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        const result = formatTimestamp(t);
        expect(typeof result).toBe('string');
        expect(result).not.toBe('--');
        expect(result).not.toMatch(/ago/);
    });
});

describe('loadConnection', () => {
    it('sets _connection on success and clears _loading', async () => {
        const host = { _loading: false, _connection: null };
        const conn = { connected: true };
        await loadConnection(host, async () => conn, 'test');
        expect(host._connection).toEqual(conn);
        expect(host._loading).toBe(false);
    });
    it('sets _connection to null on fetch failure', async () => {
        const host = { _loading: false, _connection: { old: true } };
        await loadConnection(host, async () => { throw new Error('fail'); }, 'test');
        expect(host._connection).toBeNull();
        expect(host._loading).toBe(false);
    });
    it('always clears _loading even on failure', async () => {
        const host = { _loading: false, _connection: null };
        await loadConnection(host, async () => { throw new Error('x'); }, 'tag');
        expect(host._loading).toBe(false);
    });
});

describe('catalogueErrorMessage', () => {
    it('relays the core reason when an external catalogue refused the request', () => {
        const err = Object.assign(new Error('nope'), {
            status: 503,
            detail: 'The radio catalogue is limiting how often this box may search — please try again in 30s.',
        });
        expect(catalogueErrorMessage(err, 'Search failed')).toContain('try again in 30s');
    });

    it('has its own wording when a 503 carries no reason', () => {
        const err = Object.assign(new Error('nope'), { status: 503 });
        expect(catalogueErrorMessage(err, 'Search failed')).toMatch(/unavailable/i);
    });

    it('keeps the caller fallback for anything that is not a 503', () => {
        // 504 included, and deliberately: the two call sites are the radio, whose
        // routes answer no 504 of their own — the only one reaching here is a
        // proxy timeout, which is not the catalogue's fault.
        for (const status of [400, 401, 500, 502, 504, undefined]) {
            const err = Object.assign(new Error('nope'), { status });
            expect(catalogueErrorMessage(err, 'Search failed')).toBe('Search failed');
        }
    });

    it('does not throw on a null error', () => {
        expect(catalogueErrorMessage(null, 'Search failed')).toBe('Search failed');
    });
});

describe('fmtIsoDate', () => {
    it('keeps the calendar day whatever the viewer timezone', () => {
        // The defect: `new Date('2026-12-31').toLocaleDateString()` renders 30/12/2026 in
        // New York and Honolulu. Parsing the parts in local time cannot shift the day.
        expect(fmtIsoDate('2026-12-31')).toBe(new Date(2026, 11, 31).toLocaleDateString());
    });

    it('formats the first of a month without slipping into the previous one', () => {
        expect(fmtIsoDate('2026-01-01')).toBe(new Date(2026, 0, 1).toLocaleDateString());
    });

    it('returns nothing for an absent date, so callers can fall back', () => {
        expect(fmtIsoDate(null)).toBe('');
        expect(fmtIsoDate(undefined)).toBe('');
        expect(fmtIsoDate('')).toBe('');
    });

    it('shows an unrecognised value as authored rather than inventing a day', () => {
        expect(fmtIsoDate('31/12/2026')).toBe('31/12/2026');
    });
});

describe('isPast', () => {
    afterEach(() => vi.useRealTimers());

    /** Freeze the clock at a UTC instant whose local day differs, to catch a local reading. */
    const freeze = (utcIso) => vi.setSystemTime(new Date(utcIso));

    it('is false on the expiry day itself — a licence is valid through it', () => {
        vi.useFakeTimers();
        freeze('2026-12-31T12:00:00Z');
        expect(isPast('2026-12-31')).toBe(false);
    });

    it('is true the day after', () => {
        vi.useFakeTimers();
        freeze('2027-01-01T00:30:00Z');
        expect(isPast('2026-12-31')).toBe(true);
    });

    it('compares in UTC, matching the core', () => {
        // 23:30 UTC on the 31st is already the 1st in UTC+13. Read locally, the licence
        // would look ended here while the core still considers it live.
        vi.useFakeTimers();
        freeze('2026-12-31T23:30:00Z');
        expect(isPast('2026-12-31')).toBe(false);
    });

    it('is false when there is no date at all', () => {
        expect(isPast(null)).toBe(false);
        expect(isPast('')).toBe(false);
    });
});

describe('planLabel', () => {
    it('names a perpetual licence', () => {
        expect(planLabel('lifetime', null, '1')).toBe('Perpetual · v1.x');
    });

    it('does not call a paid term a trial', () => {
        // The licence server stamps "trial" on every document carrying an end date,
        // including one sold for a year. Relayed raw, three separate screens told a paying
        // customer his plan was "Trial".
        expect(planLabel('term', '2026-12-31')).not.toContain('Trial');
        expect(planLabel('trial', '2026-12-31')).not.toContain('Trial');
    });

    it('carries the end date, formatted without shifting the day', () => {
        expect(planLabel('term', '2026-12-31')).toContain(fmtIsoDate('2026-12-31'));
    });

    it('handles a term with no date rather than printing undefined', () => {
        expect(planLabel('term', null)).toBe('Time-limited');
    });

    it('shows an unknown plan as given instead of inventing one', () => {
        expect(planLabel('enterprise', null)).toBe('enterprise');
        expect(planLabel(null, null)).toBe('—');
    });
});
