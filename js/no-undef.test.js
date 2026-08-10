/**
 * The tree contains no undeclared identifier, and each file is checked against its own
 * platform.
 *
 * Why a test and not just the pre-commit hook: the hook sees only what is staged, and
 * `--no-verify` walks past it. This runs over every file, every time the suite runs, which
 * is what makes the gate survive.
 *
 * What it is guarding against, concretely. On 2026-08-09 a rename pass left `dotColor`
 * declared next to `${dotFill}` interpolated, and `statusFill` declared next to
 * `statusColor` read, both inside ag-audio-pipeline.js render(). Each threw a
 * ReferenceError out of render(); the state that opened the branch stays set, so every
 * subsequent render threw too and the component stopped drawing until a reload. Both were
 * committed and pushed before anyone saw them, because this repository had stylelint for
 * its CSS and nothing at all for its JavaScript.
 *
 * The second describe block is the less obvious half. A whole-tree run that comes back
 * green proves nothing about whether the environments are actually separate: ESLint's flat
 * config MERGES globals across every block whose `files` match, so a browser block whose
 * glob covers the whole tree quietly hands `document` to the service worker, and the gate
 * then approves code that throws on its first line in the one file nobody reloads to test.
 * That widening is invisible from the outside — it makes MORE code pass — so it is pinned
 * directly.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One shared instance: config resolution is the slow part, and it is identical per call. */
const eslint = new ESLint({ cwd: REPO });

describe('no undeclared identifier anywhere in the tree', () => {
    let results;
    beforeAll(async () => { results = await eslint.lintFiles(['.']); }, 120_000);

    it('reports no error', () => {
        const problems = results
            .flatMap(r => r.messages.map(m => ({ ...m, file: path.relative(REPO, r.filePath) })))
            .filter(m => m.severity === 2);
        // The message carries the finding, so a failure here is readable without rerunning
        // the linter by hand.
        const detail = problems.map(p => `${p.file}:${p.line}:${p.column} ${p.message}`).join('\n');
        expect(detail, 'no-undef errors').toBe('');
    });

    it('reports no stale eslint-disable directive', () => {
        // A directive for a rule this config does not enable is a comment that reads like a
        // guarantee and is not one. There was exactly one when the gate went in.
        const stale = results
            .flatMap(r => r.messages.map(m => ({ ...m, file: path.relative(REPO, r.filePath) })))
            .filter(m => m.severity === 1 && /unused eslint-disable/i.test(m.message));
        expect(stale.map(s => `${s.file}:${s.line}`)).toEqual([]);
    });

    it('actually looked at the application, rather than at nothing', () => {
        // An `ignores` typo, a bad cwd or a glob that matches no file all produce the same
        // triumphant green as a clean tree. `js/` holds well over three hundred files, so
        // this bar is deliberately far below the real count: it is here to catch a gate
        // that lints nothing, not to notice a deleted component and fail for it.
        const linted = results.map(r => path.relative(REPO, r.filePath));
        expect(linted.filter(f => f.startsWith('js/')).length).toBeGreaterThan(200);
        expect(linted).toContain('sw.js');
        expect(linted).toContain('vite.config.js');
    });

    it('does not lint generated output that git already refuses to track', async () => {
        // Flat config does not read .gitignore by itself, and the gate went in with a
        // hand-written ignore list that omitted `coverage/`. One `npm run test:report
        // --coverage` then turns the tree red without a line of source changing: istanbul
        // copies its own prettify.js into the report, worth 27 `'PR' is not defined`.
        // Whoever met that would have reached for --no-verify, which is how a gate dies.
        const eslintIgnores = async (relative) =>
            eslint.isPathIgnored(path.join(REPO, relative));
        expect(await eslintIgnores('coverage/assets/vendor/prettify.js')).toBe(true);
        expect(await eslintIgnores('html/assets/whatever.js')).toBe(true);
        expect(await eslintIgnores('node_modules/lit/index.js')).toBe(true);
        expect(await eslintIgnores('public/sw.js')).toBe(true);   // the copy; sw.js is the source
        // And the inverse, so a .gitignore rule that grew too broad cannot silently
        // exclude the application itself.
        expect(await eslintIgnores('js/api.js')).toBe(false);
        expect(await eslintIgnores('sw.js')).toBe(false);
    });
});

describe('each file is checked against its own platform, not against every platform', () => {
    /**
     * Lint one line as if it were at the end of the given file, and return the undeclared
     * names reported. `filePath` is what selects the config blocks, so this measures the
     * real resolution rather than a reconstruction of it.
     *
     * @param {string} filePath - repo-relative path whose configuration is being probed
     * @param {string} code - a single statement to type-check for undeclared names
     * @returns {Promise<string[]>} the identifiers reported as undefined
     */
    const undeclaredIn = async (filePath, code) => {
        const [result] = await eslint.lintText(code, { filePath: path.join(REPO, filePath) });
        return result.messages.filter(m => m.ruleId === 'no-undef')
            .map(m => m.message.match(/'(.+)' is not defined/)?.[1]);
    };

    it('gives the service worker its own globals and not the browser DOM', async () => {
        expect(await undeclaredIn('sw.js', 'self.skipWaiting(); caches.open("x");')).toEqual([]);
        expect(await undeclaredIn('sw.js', 'document.body;')).toEqual(['document']);
    });

    it('gives the build config Node and not the DOM', async () => {
        expect(await undeclaredIn('vite.config.js', 'process.cwd();')).toEqual([]);
        expect(await undeclaredIn('vite.config.js', 'window.alert(1);')).toEqual(['window']);
    });

    it('gives the application the DOM and not Node', async () => {
        expect(await undeclaredIn('js/api.js', 'localStorage.getItem("k");')).toEqual([]);
        expect(await undeclaredIn('js/api.js', 'process.env.HOME;')).toEqual(['process']);
    });

    it('knows the Storybook preview runs in a browser, unlike Storybook\'s own config', async () => {
        // preview.js opens with `window.IS_STORYBOOK = true`. Filed under Node with the rest
        // of .storybook/, it produced fourteen reports for code that is exactly right — and
        // fourteen false reports is how a gate stops being read.
        expect(await undeclaredIn('.storybook/preview.js', 'window.sessionStorage;')).toEqual([]);
        expect(await undeclaredIn('.storybook/main.js', 'window.sessionStorage;')).toEqual(['window']);
    });

    it('knows the Storybook setup file runs in Chromium, despite looking like a test helper', async () => {
        // vite.config.js names it in `setupFiles` of the storybook project, which runs in a
        // real headless browser through Playwright — not in the jsdom-on-Node unit project
        // its name and location suggest. Grouped with `**/*.test.js` it was handed Node's
        // globals, so a `process.cwd()` there would have passed the linter AND this guard,
        // then thrown at setup and failed every interaction test at once. Precisely the
        // platform leak the block above exists to prevent, committed inside the same file.
        expect(await undeclaredIn('.storybook/vitest.setup.js', 'document.body;')).toEqual([]);
        expect(await undeclaredIn('.storybook/vitest.setup.js', 'process.cwd();')).toEqual(['process']);
        // A real unit test keeps both sides: jsdom inside a Node process.
        expect(await undeclaredIn('js/api.test.js', 'process.cwd(); document.body;')).toEqual([]);
    });

    it('accepts the names the compatibility layer publishes, and still catches a typo', async () => {
        // js/common.js, js/api.js, js/core/event-bus.js and js/history.js assign these to
        // window for pre-module code that reads them bare.
        expect(await undeclaredIn('js/api.js', 'showToast("a"); handleError(1); escapeHtml("b");')).toEqual([]);
        expect(await undeclaredIn('js/api.js', 'sohwToast("a");')).toEqual(['sohwToast']);
    });

    it('accepts the libraries index.html loads from a script tag', async () => {
        // Real globals, published by <script> rather than by an import. Leaving them
        // undeclared would keep the gate permanently red.
        expect(await undeclaredIn('js/api.js', 'new Chart(null, {}); CodeMirror.fromTextArea();')).toEqual([]);
    });
});
