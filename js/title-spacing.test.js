/**
 * Guard: every card's title row stands 24px above what follows.
 *
 * On 2026-10-11 the space under a title ran from 12 to 30px depending on the page,
 * measured in Chromium on every tab: the title rows all kept 12px below them, and a
 * .tab-zone — a column flex, where margins add up instead of collapsing — gave the
 * next block 18px more whenever that block was a <div>. Services, Audio Software,
 * Profiles and the history panels sat at 30px; Systemd, System and the licence at 12.
 * The user chose 24px for all (--spacing-xl).
 *
 * The row carries the space, and neither what follows nor the title's own text adds to
 * it. Three kinds of row: .tab-title-container (a page's title), .history-header (the
 * history and events panels) and .test-header (Performance's tests). A row nested in
 * another, or alone in its own card (the phone pipeline's bar), keeps 0 below it.
 */
import { describe, it, expect } from 'vitest';
import { cssRules, filesUnder, readStylesheet } from './test-utils.js';

/** The title rows, by class. */
const ROWS = ['tab-title-container', 'history-header', 'test-header'];

/** Rows that keep no space below them: nested in a header, or alone in their card. */
const NO_SPACE = ['.test-header .tab-title-container', '.perf-header .tab-title-container', '.amp-mobile-bar .tab-title-container'];

/** Every rule of the stylesheets, nested ones included, with its file. */
const RULES = filesUnder('css', /\.css$/).flatMap((file) => cssRules(readStylesheet(file)).map((r) => ({ file, ...r })));

/** The selector names a title row itself, not something inside it. */
const namesRow = (selector) => ROWS.some((row) => new RegExp(`\\.${row}$`).test(selector));

/** The selector names a card's title: an h2 in a row, or straight under a page's zone. */
const namesTitle = (selector) => /\.(tab-title-container|history-header|test-header|[\w-]+-(zone|section))\s*>?\s*h2$/.test(selector);

/** The values a rule gives margin and margin-bottom. */
const bottomMargins = (body) => [...body.matchAll(/(?<![-\w])margin(?:-bottom)?\s*:\s*([^;]+)/g)].map((m) => m[1].trim());

describe('every title row stands 24px above what follows', () => {
    it('gives each kind of row 24px below it', () => {
        for (const row of ROWS) {
            const base = RULES.find((r) => r.selectors.includes(`.${row}`) && /margin-bottom/.test(r.body));
            expect(base?.body, `.${row}`).toMatch(/margin-bottom\s*:\s*var\(--spacing-xl\)/);
        }
    });

    it('lets no other rule change it, but for a nested row or one alone in its card', () => {
        const offenders = RULES.flatMap(({ file, selectors, body }) => selectors
            .filter((s) => namesRow(s) && bottomMargins(body).length)
            .filter((s) => !/(?<![-\w])margin-bottom\s*:\s*var\(--spacing-xl\)/.test(body)
                && !(NO_SPACE.includes(s) && bottomMargins(body).every((v) => v === '0')))
            .map((s) => `${file} — ${s}`));
        expect(offenders, `title rows spaced their own way:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('lets no title text add to it', () => {
        // A title's own margin makes its row taller: the history panels' titles kept the
        // base h2's 12px (36px in all), Config's its own 4px (28px).
        for (const row of ROWS) {
            const reset = RULES.find((r) => r.selectors.includes(`.${row} h2`));
            expect(reset && bottomMargins(reset.body), `.${row} h2`).toEqual(['0']);
        }
        const offenders = RULES.flatMap(({ file, selectors, body }) => selectors
            .filter((s) => namesTitle(s) && bottomMargins(body).some((v) => v !== '0'))
            .map((s) => `${file} — ${s}`));
        expect(offenders, `card titles with a margin of their own:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('adds nothing to it from what follows', () => {
        const zero = RULES.find((r) => r.selectors.some((s) => s.startsWith('.tab-zone > :is(') && s.endsWith('+ *')));
        expect(zero?.body).toMatch(/margin-top\s*:\s*0/);
        for (const row of ROWS) expect(zero.selectors[0]).toContain(`.${row}`);
    });
});
