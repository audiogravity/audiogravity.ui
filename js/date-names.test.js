/**
 * Guard: the day and month names the interface writes are English — British English, the
 * day before the month (user's choice, 2026-10-27) — whatever the browser's language.
 *
 * Asked of the browser, they came in the phone's language: on a phone set to French the
 * Stats view wrote "lun." … "dim.", "28 sept." and "lun. 10:00" beside its English words,
 * and so did a configuration card's date and both performance tests' histories (measured
 * in Chromium, 2026-10-27); formatTimestamp wrote American English. One function names
 * days and months now, utils-lit's fmtDateNames; every other date is written in digits, in
 * the browser's conventions, and so is every time — in fmtDateNames too.
 *
 * Covers:
 * 1. DATE_NAMES_LOCALE is British English, read by utils-lit.js alone
 * 2. every other date or number formatter call of the app's sources names no day, no month
 *    and no locale: no options, or a literal of digit fields only (code review, 2026-10-27:
 *    the first guard looked for two spellings and missed `dateStyle`, `month: style`, options
 *    held in a constant)
 * 3. fmtDateNames writes British names, and a time beside them is the browser's own
 * 4. fmtDateTime adds the year when it is not this one's, and writes `--` for no date
 * 5. a day is a calendar day: a file saved at 23:50 is yesterday's at 00:10 (it read "today")
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appSources, withoutComments } from './test-utils.js';
import { DATE_NAMES_LOCALE } from './core/config.js';
import { calendarDaysAgo, fmtDateNames, fmtDateTime, fmtModified, fmtTime, formatTimestamp } from './components/utils-lit.js';

/** The one module that names days and months. */
const OWNER = path.join('js', 'components', 'utils-lit.js');

/** Where a date or number formatter is called: the call's name ends at its "(". */
const START = /(?:\.(toLocaleDateString|toLocaleString|toLocaleTimeString)|\bIntl\.(DateTimeFormat))\s*\(/g;

/** The fields a digits-only format may hold, and the values each may take. */
const DIGITS = {
    year: /^'(?:numeric|2-digit)'$/, month: /^'(?:numeric|2-digit)'$/, day: /^'(?:numeric|2-digit)'$/,
    hour: /^'(?:numeric|2-digit)'$/, minute: /^'(?:numeric|2-digit)'$/, second: /^'(?:numeric|2-digit)'$/,
    hour12: /^(?:true|false)$/, hourCycle: /^'h(?:11|12|23|24)'$/, fractionalSecondDigits: /^[123]$/,
    minimumFractionDigits: /^\d+$/, maximumFractionDigits: /^\d+$/, minimumIntegerDigits: /^\d+$/,
    useGrouping: /^(?:true|false)$/,
};

/** `text` cut at its top-level commas: brackets, braces and parentheses kept whole. */
function topLevel(text) {
    const parts = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < text.length; i++) {
        if ('([{'.includes(text[i])) depth++;
        else if (')]}'.includes(text[i])) depth--;
        else if (text[i] === ',' && depth === 0) { parts.push(text.slice(from, i)); from = i + 1; }
    }
    parts.push(text.slice(from));
    return parts.map((p) => p.trim()).filter(Boolean);
}

/** Every formatter call of `code`, its arguments read to the matching parenthesis. */
function formatterCalls(code) {
    return [...code.matchAll(START)].map((m) => {
        let depth = 1;
        let i = m.index + m[0].length;
        const from = i;
        for (; i < code.length && depth; i++) {
            if (code[i] === '(') depth++;
            else if (code[i] === ')') depth--;
        }
        return { name: m[1] ?? m[2], args: topLevel(code.slice(from, i - 1)) };
    });
}

/** Why a call may name something, or '' when it writes digits alone in the browser's way. */
function namesSomething({ args: [locale, options, ...rest] }) {
    if (rest.length) return 'more arguments than a locale and options';
    if (locale !== undefined && !/^(?:undefined|\[\])$/.test(locale)) return `a locale of its own: ${locale}`;
    if (options === undefined) return '';
    if (!/^\{[\s\S]*\}$/.test(options)) return `options not written out: ${options}`;
    for (const entry of topLevel(options.slice(1, -1))) {
        const [, key, value] = entry.match(/^(\w+)\s*:\s*([\s\S]+)$/) ?? [];
        if (!key || !DIGITS[key]?.test(value.trim())) return `a field that is no digit: ${entry}`;
    }
    return '';
}

describe('day and month names', () => {
    it('are British English, asked of the browser nowhere but utils-lit.js', () => {
        expect(DATE_NAMES_LOCALE).toBe('en-GB');
        const readers = appSources().filter((file) => file !== path.join('js', 'core', 'config.js')
            && /\bDATE_NAMES_LOCALE\b/.test(withoutComments(readFileSync(path.join(process.cwd(), file), 'utf8'))));
        expect(readers).toEqual([OWNER]);
    });

    it('are written nowhere else: every other date or number is digits, in the browser\'s way', () => {
        const offenders = [];
        let calls = 0;
        for (const file of appSources().filter((f) => f !== OWNER)) {
            const code = withoutComments(readFileSync(path.join(process.cwd(), file), 'utf8'));
            for (const call of formatterCalls(code)) {
                calls++;
                const why = namesSomething(call);
                if (why) offenders.push(`${file}: .${call.name}(${call.args.join(', ')}) — ${why}`);
            }
        }
        expect(offenders).toEqual([]);
        // The calls the guard reads today: a scanner that read none would pass too.
        expect(calls).toBeGreaterThanOrEqual(12);
    });

    it('reads what it should refuse', () => {
        const refused = [
            ".toLocaleDateString(undefined, { dateStyle: 'medium' })",
            ".toLocaleDateString([], { month: style })",
            '.toLocaleDateString(undefined, OPTIONS)',
            ".toLocaleString('en-US', { hour: '2-digit' })",
            "Intl.DateTimeFormat(undefined, { weekday: 'short' })",
            ".toLocaleDateString(undefined, { month: 'short', day: fmt(x, (y)) })",
        ];
        for (const text of refused) {
            const [call] = formatterCalls(text);
            expect(namesSomething(call), text).not.toBe('');
        }
        const [digits] = formatterCalls(".toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })");
        expect(namesSomething(digits)).toBe('');
    });

    it('are written in British English, a time beside them in the browser\'s own way', () => {
        const at = new Date(2026, 9, 12, 17, 45);
        expect(fmtDateNames(at, { weekday: 'short', day: 'numeric', month: 'short' })).toBe('Mon 12 Oct');
        expect(fmtDateNames(at, { month: 'long', year: 'numeric' })).toBe('October 2026');
        // en-GB alone writes 17:45 everywhere, and `pm` where an American browser writes `PM`.
        const browserTime = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        expect(fmtTime(at)).toBe(browserTime);
        expect(fmtDateTime(at, new Date(2026, 9, 27))).toBe(`12 Oct, ${browserTime}`);
    });
});

describe('a moment', () => {
    const now = new Date(2026, 9, 27, 18, 0);

    it('carries its year when it is not this one\'s', () => {
        expect(fmtDateTime(new Date(2026, 9, 27, 17, 45), now)).not.toMatch(/2026/);
        expect(fmtDateTime(new Date(2025, 9, 27, 17, 45), now)).toMatch(/^27 Oct 2025, /);
        expect(fmtDateTime(new Date(2025, 9, 27, 17, 45).toISOString(), now)).toMatch(/^27 Oct 2025, /);
    });

    it.each([[null], [undefined], [''], ['nonsense']])('reads -- for %j', (value) => {
        expect(fmtDateTime(value, now)).toBe('--');
        expect(fmtModified(value, now)).toBe('--');
    });

    it('is the one formatTimestamp writes once a day old', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
        expect(formatTimestamp(twoDaysAgo.toISOString())).toBe(fmtDateTime(twoDaysAgo));
        expect(formatTimestamp('nonsense')).toBe('--');
    });
});

describe('a day', () => {
    it('is a calendar day', () => {
        const justAfterMidnight = new Date(2026, 9, 27, 0, 10);
        expect(calendarDaysAgo(new Date(2026, 9, 26, 23, 50), justAfterMidnight)).toBe(1);
        expect(calendarDaysAgo(new Date(2026, 9, 27, 0, 1), justAfterMidnight)).toBe(0);
        expect(calendarDaysAgo(new Date(2026, 9, 18, 12, 0), justAfterMidnight)).toBe(9);
    });

    it('dates a configuration file in calendar days: yesterday at 23:50 is yesterday at 00:10', () => {
        const now = new Date(2026, 9, 27, 0, 10);
        expect(fmtModified(new Date(2026, 9, 26, 23, 50).toISOString(), now)).toBe('yesterday');
        expect(fmtModified(new Date(2026, 9, 27, 0, 5).toISOString(), now)).toMatch(/^today at /);
        expect(fmtModified(new Date(2026, 9, 18, 12, 0).toISOString(), now)).toBe('9d ago');
        expect(fmtModified(new Date(2026, 7, 23, 12, 0).toISOString(), now)).toBe('23 Aug 2026');
    });
});
