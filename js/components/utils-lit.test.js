/**
 * Unit tests for utils-lit.js — pure formatting and utility functions.
 */
import { describe, it, expect } from 'vitest';
import {
    safeToFixed, formatMemory, formatUptime, formatRate,
    fmtDuration, getActivityLevel, getActivityLevelForCPU,
    getActivityLevelForMemory, getActivityLevelForRate,
    coverUrl, pickPrimaryCoverToken,
    formatTimestamp, loadConnection, svgIcon,
} from './utils-lit.js';

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
