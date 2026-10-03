/**
 * ESLint — one rule, `no-undef`, and nothing else.
 *
 * This repository has stylelint for its CSS and had no linter at all for its JavaScript.
 * The gap was not theoretical: a rename pass left `dotColor` declared next to `${dotFill}`
 * interpolated, and `statusFill` declared next to `statusColor` read, both inside
 * `ag-audio-pipeline.js` render(). Each threw a ReferenceError out of render(), and the
 * component then stopped drawing until a reload — because the state that triggered the
 * branch stays set, so every following render throws again. Committed and pushed before
 * anyone saw it. `no-undef` finds that class of defect in about a second.
 *
 * Deliberately no style rules. A "standard" preset on a tree that has never been linted
 * reports thousands of formatting opinions, all of which have to be triaged or suppressed
 * before the one rule that catches crashes can run at all — and formatting is already
 * covered where it matters, in the CSS. If a second rule is ever added it should be
 * because a defect got through, the way this one was added.
 *
 * The `globals` blocks below are not decoration: `no-undef` knows nothing about the
 * platform, so an undeclared environment turns every `document` and `fetch` into a false
 * positive, and a wall of false positives is how a lint gate stops being read.
 */
import { includeIgnoreFile } from '@eslint/compat';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Names the compatibility layer publishes on `window` and that pre-module scripts still
 * read bare.
 *
 * They are assigned in `js/common.js`, `js/api.js`, `js/core/event-bus.js`,
 * `js/history.js` and `js/ui-helpers.js`, and read without an import by the older
 * non-module code. `readonly` on purpose: the call sites consume them, and the modules
 * that publish them do so through `window.x =`, which is a property write rather than a
 * global assignment, so nothing here needs to be writable.
 */
const AG_COMPAT_GLOBALS = {
    AppState: 'readonly',
    EventEmitter: 'readonly',
    MemoryCache: 'readonly',
    addToHistory: 'readonly',
    apiCall: 'readonly',
    apiCallWithRetry: 'readonly',
    apiGet: 'readonly',
    apiPost: 'readonly',
    apiUpload: 'readonly',
    applyTheme: 'readonly',
    escapeHtml: 'readonly',
    getUserFriendlyError: 'readonly',
    handleError: 'readonly',
    showConfirm: 'readonly',
    showToast: 'readonly',
};

/**
 * Runs under Node, never in a browser: build config, Storybook's own config, tooling.
 *
 * `.storybook/main.js` only — NOT the whole directory. `.storybook/preview.js` is loaded
 * inside the preview iframe and its first statement is `window.IS_STORYBOOK = true`; filed
 * under Node it produced fourteen reports for code that is exactly right.
 *
 * `scripts/sync-manual.js`, run by `npm run dev` and `npm run build`, is the JavaScript
 * that glob exists for.
 */
const NODE_FILES = ['vite.config.js', '.storybook/main.js', 'scripts/**/*.js'];

/**
 * Node scripts that also contain browser code, because they drive a browser.
 *
 * `tools/manual-shots/` drives Playwright: its files run in Node, but the bodies of
 * `page.evaluate(...)` are serialised and executed in the page, where `document`,
 * `OffscreenCanvas` and `createImageBitmap` all exist. ESLint sees one file with one set
 * of globals and cannot follow that hop, so both sides are declared. The cost is real and
 * worth naming: inside these files a browser name is not checked against Node, nor the
 * reverse. It buys back whole files that would otherwise have to be excluded outright.
 */
const BROWSER_DRIVER_FILES = ['tools/**/*.js'];

/** Runs in a worker: `self`, `caches`, `clients`, and no DOM whatsoever. */
const WORKER_FILES = ['sw.js', 'public/js/sse-worker.js'];

export default [
    // What must not be linted is what git already refuses to track: dependencies, build
    // output, the coverage and HTML reports, the generated copy of the service worker.
    //
    // Read from .gitignore rather than restated here, and that is the point. Flat config
    // does NOT consult .gitignore on its own — verified: an istanbul report under
    // `coverage/` is ignored by git and linted by ESLint, and its bundled prettify.js
    // alone raises 27 `'PR' is not defined`, turning the gate red on a tree nobody
    // touched. A hand-kept list would have fixed that one directory and left the next
    // generated one to repeat it; this repository has already paid for a shipped
    // allow-list that had to be updated by hand and was not (see audiogravity.lic/sw.js).
    // The consequence to accept: adding a build output to .gitignore now also excuses it
    // from linting, which is the behaviour wanted in every case here.
    includeIgnoreFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')),
    {
        // Rules and parsing apply to every file. Globals do not — they are split below,
        // one platform per file, and that split is the point rather than tidiness.
        //
        // Flat config MERGES `globals` across every block whose `files` match, it does not
        // replace them. So a browser block matching `**/*.js` would hand `document` and
        // `localStorage` to the service worker too, and `no-undef` would then approve a
        // `document.querySelector` in sw.js — code that throws on the first line it runs,
        // in the one file nobody reloads to test. Hence the mutually exclusive `ignores`.
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        linterOptions: { reportUnusedDisableDirectives: true },
        rules: { 'no-undef': 'error' },
    },
    {
        // The application itself, plus its stories and tests: a browser, and the names the
        // compatibility layer publishes there. No library arrives as a global any more:
        // Chart.js, CodeMirror and xterm.js are imported, so a bare `Chart` or `CodeMirror`
        // left behind is undeclared, and an error.
        files: ['**/*.js'],
        ignores: [...NODE_FILES, ...WORKER_FILES],
        languageOptions: {
            globals: { ...globals.browser, ...AG_COMPAT_GLOBALS },
        },
    },
    {
        files: BROWSER_DRIVER_FILES,
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },
    {
        files: WORKER_FILES,
        languageOptions: { globals: { ...globals.serviceworker, ...globals.worker } },
    },
    {
        files: NODE_FILES,
        languageOptions: { globals: { ...globals.node } },
    },
    {
        files: ['**/*.cjs'],
        languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    },
    {
        // The unit project only: `include: ['js/**/*.test.js']`, `environment: 'jsdom'`, so
        // a Node process with a DOM bolted on, and both sides are legitimate.
        //
        // NOT `.storybook/vitest.setup.js`. It reads like a test helper and is one, but
        // vite.config.js makes it the `setupFiles` entry of the *storybook* project, which
        // runs in a real headless Chromium through Playwright. Granted Node globals it
        // would accept a `process.cwd()` that passes the linter, passes this guard, and
        // then throws during setup — failing every interaction test at once. It is covered
        // by the browser block above, like the stories it sets up, and needs nothing more:
        // it imports what it uses and touches no global at all.
        files: ['js/**/*.test.js'],
        languageOptions: { globals: { ...globals.node, ...globals.vitest } },
    },
];
