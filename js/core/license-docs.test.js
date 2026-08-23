/**
 * @file Guards for the in-app copy of the EULA.
 *
 * The modal renders a hand-maintained duplicate of `audiogravity.site/EULA.md`: the two
 * live in different repositories, so nothing mechanical keeps them aligned. Inserting a
 * clause means renumbering the ones below it by hand, and a skipped or repeated number is
 * invisible in a scrolling modal. These tests fail on that slip.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LICENSE_TERMS_HTML, LICENSE_TERMS_TITLE } from './license-docs.js';

/**
 * The authoritative EULA, when the sibling repository is checked out next to this one.
 *
 * Reading across repositories is not free of caveats — a checkout without
 * `audiogravity.site` has nothing to compare against — so the parity test skips itself
 * rather than failing there. It still runs on every developer machine and every box
 * that holds both, which is where the two copies actually drift apart.
 *
 * @returns {string|null} The file contents, or null when it is not reachable.
 */
function eulaSource() {
    try {
        // Resolved from the working directory, not from `import.meta.url`: under this
        // test runner that is an http:// URL, so `new URL('../…', import.meta.url)`
        // yields an http path and every read fails — which made this guard skip itself
        // silently, the one outcome a guard must never have.
        return readFileSync(resolve(process.cwd(), '../audiogravity.site/EULA.md'), 'utf8');
    } catch {
        return null;
    }
}

/** Section headings of the EULA block, as `[number, title]` pairs in document order. */
function eulaSections() {
    return [...LICENSE_TERMS_HTML.matchAll(/<h4[^>]*>(\d+)\.\s*([^<]+)<\/h4>/g)]
        .map(([, num, title]) => [Number(num), title.trim()]);
}

describe('license-docs', () => {
    it('exposes a title', () => {
        expect(LICENSE_TERMS_TITLE).toBeTruthy();
    });

    it('numbers the EULA sections 1..n without a gap or a repeat', () => {
        const numbers = eulaSections().map(([num]) => num);
        expect(numbers.length).toBeGreaterThan(0);
        expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    });

    it('tells the owner what the box sends to the licence server', () => {
        const [, title] = eulaSections().find(([, t]) => /Validation Data/i.test(t)) || [];
        expect(title).toBe('License Validation Data');
        // The claims that matter: what is sent, and that it is not optional.
        expect(LICENSE_TERMS_HTML).toMatch(/every 24 hours/);
        expect(LICENSE_TERMS_HTML).toMatch(/cannot be disabled/);
        expect(LICENSE_TERMS_HTML).toMatch(/No personal content, music library data/);
    });

    it('keeps Governing Law and General last, in that order', () => {
        const titles = eulaSections().map(([, t]) => t);
        expect(titles.slice(-2)).toEqual(['Governing Law', 'General']);
    });
});

describe('parity with audiogravity.site/EULA.md', () => {
    // The header of this file says nothing mechanical keeps the two copies aligned.
    // That was true, and it was the actual risk: a clause added on one side and not the
    // other means the agreement shown in the app is not the agreement published.
    const source = eulaSource();
    const runIf = source ? it : it.skip;

    /** Section headings of the Markdown EULA, as `[number, title]` pairs. */
    const markdownSections = () =>
        [...source.matchAll(/^##\s+(\d+)\.\s*(.+)$/gm)].map(([, num, title]) => [
            Number(num),
            title.trim(),
        ]);

    /** Section headings of the in-app copy, with HTML entities decoded.
     *  `Disclaimer &amp; Liability` is correct markup and the same clause as the
     *  Markdown's `Disclaimer & Liability` — comparing them raw reports a drift that
     *  does not exist, and a guard that cries wolf gets switched off. */
    const htmlSections = () =>
        [...LICENSE_TERMS_HTML.matchAll(/<h4[^>]*>(\d+)\.\s*([^<]+)<\/h4>/g)].map(([, num, title]) => [
            Number(num),
            title.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
        ]);

    runIf('shows the same clauses, in the same order, under the same numbers', () => {
        expect(htmlSections()).toEqual(markdownSections());
    });

    runIf('carries the licence-validation clause on both sides', () => {
        // The clause this file was extended for: what the box sends to the licence
        // server. If it is dropped from either copy, that is the one users read.
        expect(source).toMatch(/every 24 hours/);
        expect(source).toMatch(/cannot be disabled/);
        expect(LICENSE_TERMS_HTML).toMatch(/every 24 hours/);
        expect(LICENSE_TERMS_HTML).toMatch(/cannot be disabled/);
    });
});
