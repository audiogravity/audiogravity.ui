/**
 * Guards rule 6 against a token that nothing declares.
 *
 * `var(--x)` without a fallback, where nothing declares --x, drops its declaration when
 * the style is computed: the property takes what it inherits, or its initial value, and
 * nothing says so. Four such tokens were found on 2026-10-30: `--text-muted` in five
 * places — the passkey chips and the Systemd editor's preset hint took the colour of the
 * text around them, never the grey they asked for —, `--border-radius` and
 * `--border-radius-sm` — the sound cards of the System page had square corners, measured
 * 0 px in Chromium beside the network panels' 2 —, and `--primary` — the network test
 * type chosen took its label's colour, never the accent.
 *
 * With a fallback, `var(--x, fallback)` renders the fallback for good when nothing
 * declares --x. That is how a component leaves a way in for whoever sets it —
 * themes.test.js reads it the same way —, and how a stale name hides: the profile names'
 * hover read `--color-accent`, which no theme declares, since the interface's first
 * commit; the install banner read `--np-height` where ag-now-playing publishes
 * `--now-playing-height`, and sat over the mini-player on a desktop. Each way in is
 * listed, checked; any other such token is a stale name.
 *
 * "Declared" means declared anywhere: a token set on one element passes for every
 * reader, wherever it reads it. Telling which element a declaration reaches would take
 * the cascade; this guard finds the names nothing sets at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appSources, filesUnder, withoutComments } from './test-utils.js';

/**
 * Every stylesheet, and every source that carries styles of its own, comments blanked —
 * a token named in prose is neither read nor declared. Read once for every test.
 */
const TEXTS = new Map([...filesUnder('css', /\.css$/), ...appSources()]
    .map((file) => [file, withoutComments(readFileSync(path.join(process.cwd(), file), 'utf8'))]));

/**
 * Read with a fallback and set by nothing, on purpose. Checked on 2026-10-30: the
 * `.grid-fit` utility (css/components/grid.css) takes its column width from
 * `--grid-min-width`, which `.grid-fit-120`, `-140`, `-150` and a style attribute set,
 * and its gap from `--grid-gap`, which nothing sets yet. A new entry names who reads it
 * and who may set it.
 */
const WAYS_IN = new Map([
    ['--grid-gap', 'css/components/grid.css: the .grid-fit gap, --spacing-md unless set'],
]);

/**
 * Every custom property something declares: in a rule, a style attribute, a styleMap key
 * or a setProperty() call.
 * @returns {Set<string>}
 */
function declaredTokens() {
    const found = new Set();
    for (const text of TEXTS.values()) {
        for (const [, name] of text.matchAll(/(?<![\w-])['"`]?(--[a-zA-Z][\w-]*)['"`]?\s*:/g)) found.add(name);
        for (const [, name] of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) found.add(name);
    }
    return found;
}

/**
 * Every place a pattern reads a token that nothing declares and `allowed` does not hold.
 * @param {Set<string>} declared - The tokens something declares.
 * @param {RegExp} pattern - A global pattern whose first group is the token read.
 * @param {Map<string, string>} [allowed] - Tokens left out on purpose.
 * @returns {string[]} One `file:line — token` per place.
 */
function undeclaredReads(declared, pattern, allowed = new Map()) {
    const found = [];
    for (const [file, text] of TEXTS) {
        for (const m of text.matchAll(pattern)) {
            if (declared.has(m[1]) || allowed.has(m[1])) continue;
            found.push(`${file}:${text.slice(0, m.index).split('\n').length} — ${m[1]}`);
        }
    }
    return found;
}

describe('tokens — a var() names a token something declares (règle 6)', () => {
    const declared = declaredTokens();

    it('reads none without a fallback that nothing declares', () => {
        const offenders = undeclaredReads(declared, /var\(\s*(--[\w-]+)\s*\)/g);
        expect(offenders, `token declared nowhere:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('reads none with a fallback that nothing declares, but the ways in', () => {
        const offenders = undeclaredReads(declared, /var\(\s*(--[\w-]+)\s*,/g, WAYS_IN);
        expect(offenders, `stale name, read with a fallback:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('keeps its ways in true: each still read with a fallback, and still set by nothing', () => {
        const all = [...TEXTS.values()].join('\n');
        for (const token of WAYS_IN.keys()) {
            expect(declared.has(token), `${token} is set now: take it off WAYS_IN`).toBe(false);
            expect(all, `${token} is no longer read: take it off WAYS_IN`).toMatch(new RegExp(`var\\(\\s*${token}\\s*,`));
        }
    });
});
