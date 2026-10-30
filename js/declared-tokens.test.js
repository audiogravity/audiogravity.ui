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
 * type chosen took its label's colour, never the accent. A token read only as
 * `var(--x, fallback)` is an opt-in a page may leave unset — themes.test.js reads it the
 * same way — and stays out of this guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appSources, filesUnder, withoutComments } from './test-utils.js';

/** Every stylesheet, and every source that carries styles of its own. */
const SOURCES = [...filesUnder('css', /\.css$/), ...appSources()];

/** A source's text, comments blanked: a token named in prose is neither read nor declared. */
const read = (file) => withoutComments(readFileSync(path.join(process.cwd(), file), 'utf8'));

/**
 * Every custom property something declares: in a rule, a style attribute, a styleMap key
 * or a setProperty() call.
 * @returns {Set<string>}
 */
function declaredTokens() {
    const found = new Set();
    for (const file of SOURCES) {
        const text = read(file);
        for (const [, name] of text.matchAll(/(?<![\w-])['"`]?(--[a-zA-Z][\w-]*)['"`]?\s*:/g)) found.add(name);
        for (const [, name] of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) found.add(name);
    }
    return found;
}

describe('tokens — a var() without a fallback names a token something declares (règle 6)', () => {
    const declared = declaredTokens();

    it('reads none that nothing declares', () => {
        const offenders = [];
        for (const file of SOURCES) {
            const text = read(file);
            for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
                if (declared.has(m[1])) continue;
                offenders.push(`${file}:${text.slice(0, m.index).split('\n').length} — ${m[1]}`);
            }
        }
        expect(offenders, `jeton déclaré nulle part :\n  ${offenders.join('\n  ')}`).toEqual([]);
    });
});
