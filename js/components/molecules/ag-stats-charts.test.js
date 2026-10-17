/**
 * Tests for the listening history's charts and lists: ag-stats-bars, ag-stats-hours,
 * ag-stats-shares, ag-stats-quality, ag-stats-headline, ag-stats-top, ag-stats-recent.
 *
 * Rendered for real. Pinned: every value is readable without the colours — written out,
 * or in a bar's label; a bar is a button a finger and a keyboard reach; what names nothing
 * is said and greyed; the quality classes keep their order whatever their share.
 */
import { describe, it, expect, afterEach } from 'vitest';

import './ag-stats-bars.js';
import './ag-stats-hours.js';
import './ag-stats-shares.js';
import './ag-stats-quality.js';
import './ag-stats-headline.js';
import './ag-stats-top.js';
import './ag-stats-recent.js';
import { topLines, fmtPlays } from './ag-stats-top.js';
import { recentLines } from './ag-stats-recent.js';

async function mount(tag, props) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
});

const WEEK = [0, 1800, 3600, 5400, 0, 600, 7200]
    .map((seconds, i) => ({ start: `2026-10-${String(10 + i).padStart(2, '0')}`, seconds }));

describe('ag-stats-bars', () => {
    it('draws a bar per day, as tall as its time against a round top', async () => {
        const el = await mount('ag-stats-bars', { buckets: WEEK, unit: 'day' });
        const bars = [...el.querySelectorAll('.lib-stats-bar')];
        expect(bars).toHaveLength(7);
        // The largest is 2 h: the scale tops at 2 h, so 1 h is half of it.
        expect(bars[2].style.height).toBe('50%');
        expect(bars[6].style.height).toBe('100%');
        expect(bars[0].style.height).toBe('0%');
        expect(el.querySelector('.lib-stats-bars-tick--top').textContent).toBe('2 h 00');
    });

    it('each bar is a button saying its day and its time', async () => {
        const el = await mount('ag-stats-bars', { buckets: WEEK, unit: 'day' });
        const hits = [...el.querySelectorAll('button.lib-stats-bar-hit')];
        expect(hits).toHaveLength(7);
        expect(hits[3].getAttribute('type')).toBe('button');
        expect(hits[3].getAttribute('aria-label')).toMatch(/1 h 30$/);
    });

    it('a tap puts the bar in the readout and fades the others', async () => {
        const el = await mount('ag-stats-bars', { buckets: WEEK, unit: 'day' });
        expect(el.querySelector('.lib-stats-bars-readout').textContent).toContain('Tap a bar');
        el.querySelectorAll('button.lib-stats-bar-hit')[3].click();
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-bars-readout strong').textContent).toBe('1 h 30');
        expect(el.querySelectorAll('.lib-stats-bar--dim')).toHaveLength(6);
        expect(el.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    });

    it('the keyboard reads a bar as a tap does', async () => {
        const el = await mount('ag-stats-bars', { buckets: WEEK, unit: 'day' });
        el.querySelectorAll('button.lib-stats-bar-hit')[6].dispatchEvent(new FocusEvent('focus'));
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-bars-readout strong').textContent).toBe('2 h 00');
    });

    it('another period picks nothing', async () => {
        const el = await mount('ag-stats-bars', { buckets: WEEK, unit: 'day' });
        el.querySelectorAll('button.lib-stats-bar-hit')[3].click();
        await el.updateComplete;
        el.buckets = WEEK.slice(0, 3);
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-bars-readout strong')).toBeNull();
        expect(el.querySelectorAll('.lib-stats-bar--dim')).toHaveLength(0);
    });

    it('draws nothing without bars', async () => {
        const el = await mount('ag-stats-bars', { buckets: [], unit: 'day' });
        expect(el.querySelector('.lib-stats-bars')).toBeNull();
    });
});

describe('ag-stats-shares', () => {
    it('writes each row\'s time and share, its bar against the largest', async () => {
        const el = await mount('ag-stats-shares', {
            rows: [{ label: 'Qobuz', seconds: 3000 }, { label: 'Local Library', seconds: 1500 },
                   { label: null, seconds: 500 }],
            total: 5000,
        });
        const rows = [...el.querySelectorAll('.lib-stats-share')];
        expect(rows.map(r => r.querySelector('.lib-stats-share-label').textContent))
            .toEqual(['Qobuz', 'Local Library', 'Unknown']);
        expect(rows[0].querySelector('.lib-stats-share-value').textContent.replace(/\s+/g, ' ').trim())
            .toBe('50 min · 60 %');
        expect(rows[1].querySelector('.lib-stats-share-bar').style.width).toBe('50%');
        expect(rows[2].classList).toContain('lib-stats-share--muted');
        expect(rows[0].classList).not.toContain('lib-stats-share--muted');
    });

    it('greys a row said to name nothing', async () => {
        const el = await mount('ag-stats-shares', { rows: [{ label: 'Other', seconds: 10, muted: true }], total: 10 });
        expect(el.querySelector('.lib-stats-share').classList).toContain('lib-stats-share--muted');
    });
});

describe('ag-stats-quality', () => {
    const CLASSES = [{ key: 'dsd', seconds: 0 }, { key: 'hires', seconds: 3000 },
                     { key: 'cd', seconds: 1000 }, { key: 'lossy', seconds: 1000 },
                     { key: 'unknown', seconds: 0 }];

    it('cuts the bar in the classes heard, best first, and names them all in the legend', async () => {
        const el = await mount('ag-stats-quality', { classes: CLASSES });
        const segments = [...el.querySelectorAll('.lib-stats-quality-seg')];
        expect(segments.map(s => s.className.match(/lib-stats-q--(\w+)/)[1])).toEqual(['hires', 'cd', 'lossy']);
        expect(segments[0].style.flexGrow).toBe('3000');
        const names = [...el.querySelectorAll('.lib-stats-quality-label')].map(n => n.textContent);
        expect(names).toEqual(['DSD', 'Hi-Res', 'CD quality', 'Lossy', 'Unknown']);
        expect(el.querySelector('.lib-stats-quality-bar').getAttribute('aria-label'))
            .toBe('Hi-Res 60 %, CD quality 20 %, Lossy 20 %');
    });

    it('draws nothing when nothing was heard', async () => {
        const el = await mount('ag-stats-quality', { classes: CLASSES.map(c => ({ ...c, seconds: 0 })) });
        expect(el.querySelector('.lib-stats-quality')).toBeNull();
    });
});

describe('ag-stats-headline', () => {
    it('leads with the time, then the listens, albums and days with music', async () => {
        const el = await mount('ag-stats-headline', {
            summary: { total_seconds: 5400, listens: 1, albums: 12, active_days: 20, days: 30 },
            caption: 'in the last 30 days',
        });
        expect(el.querySelector('.lib-stats-hero-value').textContent).toBe('1 h 30');
        expect(el.querySelector('.lib-stats-hero-caption').textContent).toBe('listened in the last 30 days');
        const tiles = [...el.querySelectorAll('.lib-stats-tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
        expect(tiles).toEqual(['1 listen', '12 albums', '20 / 30 days with music']);
    });
});

describe('ag-stats-top', () => {
    const TOP = {
        artists: [{ artist: 'Miles Davis', seconds: 3600, plays: 9 }],
        albums: [{ album: 'Kind of Blue', artist: 'Miles Davis', seconds: 3000, plays: 6 }],
        tracks: [{ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', seconds: 1200, plays: 1 }],
    };

    it('ranks the artists first, and switches to albums and tracks', async () => {
        const el = await mount('ag-stats-top', TOP);
        expect(el.querySelector('.lib-stats-list-title').textContent).toBe('Miles Davis');
        el._kind = 'tracks';
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-list-title').textContent).toBe('So What');
        expect(el.querySelector('.lib-stats-list-sub').textContent).toBe('Miles Davis — Kind of Blue');
        expect(el.querySelector('.lib-stats-list-count').textContent).toBe('1 play');
    });

    it('the selector is the system\'s filter bar', async () => {
        const el = await mount('ag-stats-top', TOP);
        el.querySelector('ag-filter-bar').dispatchEvent(new CustomEvent('filter-change', { detail: { value: 'albums' } }));
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-list-title').textContent).toBe('Kind of Blue');
    });

    it('says when there is nothing to rank', async () => {
        const el = await mount('ag-stats-top', { artists: [], albums: [], tracks: [] });
        expect(el.querySelector('.lib-stats-list')).toBeNull();
        expect(el.textContent).toContain('Nothing to rank yet.');
    });

    it('reads each kind\'s lines', () => {
        expect(topLines('artists', TOP.artists[0])).toEqual({ title: 'Miles Davis', sub: 'Artist' });
        expect(topLines('albums', { album: 'X', artist: null })).toEqual({ title: 'X', sub: '' });
        expect(fmtPlays(2)).toBe('2 plays');
    });
});

describe('ag-stats-recent', () => {
    it('a station is its name, live; a track its title, artist and album', () => {
        expect(recentLines({ live: true, station: 'Radio Choco' })).toEqual({ title: 'Radio Choco', sub: 'Live radio' });
        expect(recentLines({ live: false, title: 'Lazarus', artist: 'David Bowie', album: 'Blackstar' }))
            .toEqual({ title: 'Lazarus', sub: 'David Bowie — Blackstar' });
        expect(recentLines({ live: false }).title).toBe('Unknown track');
    });

    it('lists the listens with where they came from and came out', async () => {
        const el = await mount('ag-stats-recent', {
            listens: [{ started_at: new Date().toISOString(), seconds: 540, title: 'So What',
                        artist: 'Miles Davis', album: 'Kind of Blue', live: false,
                        source: 'Qobuz', output: 'Heed Abacus' }],
        });
        expect(el.querySelector('.lib-stats-where').textContent).toBe('Qobuz · Heed Abacus');
        expect(el.querySelector('.lib-stats-list-count').textContent).toBe('9 min');
    });

    it('says when nothing played', async () => {
        const el = await mount('ag-stats-recent', { listens: [] });
        expect(el.textContent).toContain('Nothing played yet.');
    });
});

/** A week of nothing but Saturday from 21:00 (30 min) and Monday at 07:00 (5 min). */
function week() {
    return Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) =>
        (day === 5 && hour === 21 ? 1800 : day === 0 && hour === 7 ? 300 : 0)));
}

describe('ag-stats-hours', () => {
    it('draws seven rows of 24 squares, each a button saying its day, hour and time', async () => {
        const el = await mount('ag-stats-hours', { week: week() });
        const rows = [...el.querySelectorAll('.lib-stats-hours-row')];
        expect(rows).toHaveLength(7);
        expect(rows.every(r => r.querySelectorAll('button.lib-stats-hour').length === 24)).toBe(true);
        const saturday = rows[5].querySelectorAll('button.lib-stats-hour')[21];
        expect(saturday.getAttribute('type')).toBe('button');
        expect(saturday.getAttribute('aria-label')).toMatch(/21:00: 30 min on average$/);
        expect(rows[3].querySelectorAll('button')[3].getAttribute('aria-label')).toMatch(/nothing on average$/);
    });

    it('the busiest hour is the strongest step, any time at all at least the first, nothing the pale tint', async () => {
        const el = await mount('ag-stats-hours', { week: week() });
        const cell = (day, hour) => el.querySelectorAll('.lib-stats-hours-row')[day]
            .querySelectorAll('button.lib-stats-hour')[hour];
        expect(cell(5, 21).classList.contains('lib-stats-heat--4')).toBe(true);
        expect(cell(0, 7).classList.contains('lib-stats-heat--1')).toBe(true);
        expect(cell(2, 12).classList.contains('lib-stats-heat--0')).toBe(true);
    });

    it('a tap puts the square in the readout, a new week clears it', async () => {
        const el = await mount('ag-stats-hours', { week: week() });
        expect(el.querySelector('.lib-stats-bars-readout').textContent).toContain('Tap a square');
        const saturday = el.querySelectorAll('.lib-stats-hours-row')[5].querySelectorAll('button')[21];
        saturday.click();
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-bars-readout strong').textContent).toBe('30 min');
        expect(el.querySelector('.lib-stats-bars-readout').textContent).toContain('21:00');
        expect(saturday.getAttribute('aria-pressed')).toBe('true');
        el.querySelectorAll('.lib-stats-hours-row')[3].querySelectorAll('button')[3].click();
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-bars-readout strong').textContent).toBe('Nothing');

        el.week = week();
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-bars-readout').textContent).toContain('Tap a square');
    });

    it('the keyboard reaches a square as a tap does', async () => {
        const el = await mount('ag-stats-hours', { week: week() });
        el.querySelectorAll('.lib-stats-hours-row')[0].querySelectorAll('button')[7].focus();
        await el.updateComplete;
        expect(el.querySelector('.lib-stats-bars-readout strong').textContent).toBe('5 min');
    });

    it('a week of nothing, or none at all, draws nothing', async () => {
        const empty = await mount('ag-stats-hours', { week: Array.from({ length: 7 }, () => Array(24).fill(0)) });
        expect(empty.querySelector('.lib-stats-hours')).toBeNull();
        const none = await mount('ag-stats-hours', { week: undefined });
        expect(none.querySelector('.lib-stats-hours')).toBeNull();
    });

    it('a short or damaged week reads its missing hours as nothing', async () => {
        const el = await mount('ag-stats-hours', { week: [[600, 'x', null]] });
        const buttons = el.querySelectorAll('button.lib-stats-hour');
        expect(buttons).toHaveLength(168);
        expect(buttons[0].classList.contains('lib-stats-heat--4')).toBe(true);
        expect(buttons[1].classList.contains('lib-stats-heat--0')).toBe(true);
    });

    it('its legend runs from nothing to the strongest step', async () => {
        const el = await mount('ag-stats-hours', { week: week() });
        const swatches = [...el.querySelectorAll('.lib-stats-hours-swatch')];
        expect(swatches.map(s => [...s.classList].find(c => c.startsWith('lib-stats-heat--'))))
            .toEqual(['lib-stats-heat--0', 'lib-stats-heat--1', 'lib-stats-heat--2',
                      'lib-stats-heat--3', 'lib-stats-heat--4']);
        expect(el.querySelector('.lib-stats-hours-legend').textContent).toContain('average per week');
    });
});
