/**
 * Guards the order of showToast's arguments: (type, title, message).
 *
 * A wrong order still runs — a string is a string — and showToast can only fall back to an
 * info toast when it happens. The favourites' call passed (message, 'error') from July to
 * October 2026: when a favourite could not be saved, a blue toast headed "error" said
 * nothing else, and its test only checked that a toast was shown. This reads every call,
 * and every update of an "in progress" toast (`const saving = showToast(…)`, then
 * `saving.update(…)`), which takes the same three.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSources, withoutComments } from './test-utils.js';

/** The four types, as a call writes them. */
const TYPES = ["'success'", "'error'", "'warning'", "'info'"];

/** The calls whose type is a variable, each known to hold one of the four. */
const VARIABLE_TYPES = {
    // showToast's own definition, its report of a wrong call, and its handle's update.
    'js/ui-helpers.js': ['type'],
    // describeAdd() returns the toast to show, its type among them.
    'js/components/molecules/ag-playlist-picker.js': ['toast.type'],
    // A play's outcome, passed on whole by tell() — whose own calls are read, below.
    'js/library-api.js': ['...toast'],
};

/** Functions that pass their three arguments on to showToast or a toast's update, by file. */
const RELAYS = {
    // The outcome of a play: the notice's update when it is on screen, else a toast.
    'js/library-api.js': ['tell'],
};

/**
 * Every call of the application's scripts that names a toast's type: showToast, the update
 * of a toast it returned, and the relays of a file.
 * @returns {{file: string, line: number, first: string, callee: string}[]}
 */
function toastCalls() {
    const found = [];
    for (const file of appSources().filter((f) => f.endsWith('.js'))) {
        const text = withoutComments(readFileSync(file, 'utf8'));
        const handles = [...text.matchAll(/\b(\w+)\s*=\s*showToast\(/g)].map((m) => `${m[1]}\\.update`);
        const callees = ['showToast', ...handles, ...(RELAYS[file] ?? [])];
        for (const m of text.matchAll(new RegExp(`(?<![\\w.])(?:window\\.)?(?:${callees.join('|')})\\(\\s*`, 'g'))) {
            const rest = text.slice(m.index + m[0].length);
            const first = rest.match(/^('[^']*'|"[^"]*"|`[^`]*`|[^,)]+)/)?.[1].trim() ?? '';
            const callee = m[0].replace(/^window\./, '').replace(/\(\s*$/, '');
            found.push({ file, line: text.slice(0, m.index).split('\n').length, first, callee });
        }
    }
    return found;
}

describe('showToast calls — the type comes first', () => {
    const calls = toastCalls();

    it('reads the calls of the whole app', () => {
        // 141 when this guard was written; far fewer would mean the scan stopped seeing them.
        expect(calls.length).toBeGreaterThan(100);
    });

    it('reads the updates of the "in progress" toasts and the relays too', () => {
        const update = calls.find((c) => c.file === 'js/components/organisms/ag-pipeline-page.js' && c.first === "'success'"
            && !/showToast/.test(c.callee));
        expect(update, 'saving.update(…) of the topology save').toBeTruthy();
        expect(calls.some((c) => c.file === 'js/library-api.js' && c.callee === 'tell')).toBe(true);
    });

    it('open each call with one of the four types, or a variable known to hold one', () => {
        const wrong = calls.filter(({ file, first }) =>
            !TYPES.includes(first) && !(VARIABLE_TYPES[file] ?? []).includes(first));
        expect(wrong.map(({ file, line, first }) => `${file}:${line} ${first}`)).toEqual([]);
    });

    it('list no variable that is no longer there', () => {
        for (const [file, names] of Object.entries(VARIABLE_TYPES)) {
            for (const name of names) {
                expect(calls.some((c) => c.file === file && c.first === name), `${file}: ${name}`).toBe(true);
            }
        }
    });
});
