/**
 * No module may be imported from another host.
 *
 * The distinction this guards is not "third party or not" — it is how the failure lands.
 * A `<script src="…">` that never arrives leaves a global undefined, and the code that
 * needs it can check for that: the editor falls back to a plain textarea, the latency chart
 * does not draw, the page is still there. An `import` that never arrives stops the module
 * graph dead, and every page built on it renders nothing at all.
 *
 * @lit/context was imported that way from a CDN in eleven files, app-context.js among them,
 * so Configuration, Profiles, Performance, Systemd, Services, Audio software and the
 * dashboard all depended on a host on the internet being reachable — from a box that may
 * sit on a network with no route out. It was also already a declared dependency, and one
 * file imported it that way, so the interface shipped two copies of the same library at two
 * different versions.
 *
 * The CDN tags that outlived it went too: CodeMirror (eleven scripts, two stylesheets) and
 * Chart.js in index.html, xterm.js injected by the terminal. They were thought to degrade
 * rather than break, and the measure said otherwise (installed UI, Chromium, cold load):
 * a CDN three seconds late kept the screen blank 3.2 s and the app unstarted until 6.2 s,
 * for every screen, editor or not. They also ran in the admin's session without an
 * integrity hash. They are npm dependencies now, and the second half of this file keeps
 * it that way — no tag, element, precached URL or CSP source pointing elsewhere — and
 * holds the trap that move came with: bundled naively, the three would add some 200 KB
 * compressed to every start, for screens most sessions never open. The last case holds
 * the reverse: a module that must be on the start, and was not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** @param {string} dir @returns {string[]} every .js below dir, repo-relative */
function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
        return e.name.endsWith('.js') ? [relative(ROOT, full)] : [];
    });
}

const FILES = [...walk(join(ROOT, 'js')), ...walk(join(ROOT, '.storybook'))];
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

describe('every module comes from this server', () => {
    it('finds the sources', () => {
        // Otherwise the cases below iterate over nothing and pass.
        expect(FILES.length).toBeGreaterThan(100);
    });

    it('imports nothing over http', () => {
        const offenders = [];
        for (const file of FILES) {
            const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
            // Static `import … from '…'` and dynamic `import('…')` alike: both resolve the
            // module graph, and both take the page down with them when the host is absent.
            for (const m of src.matchAll(/\bimport\s*(?:[^'"]*?\bfrom\s*)?\(?\s*['"](https?:\/\/[^'"]+)['"]/g)) {
                offenders.push(`${file} — ${m[1]}`);
            }
        }
        expect(offenders, `module imported from another host:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('mocks the specifier the code actually imports', () => {
        // vi.mock takes a specifier, not a name: it matches by string. When the imports moved
        // to '@lit/context', a mock still naming the old CDN URL would have gone on being
        // registered against a module nobody imports — no error, no mock, and a test
        // exercising the real library while claiming to isolate it.
        const offenders = [];
        for (const file of FILES.filter(f => f.endsWith('.test.js'))) {
            for (const m of read(file).matchAll(/vi\.mock\(\s*['"](https?:\/\/[^'"]+)['"]/g)) {
                offenders.push(`${file} — ${m[1]}`);
            }
        }
        expect(offenders, `mock aimed at a URL:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('keeps one copy of @lit/context, at the declared version', () => {
        // One file already imported it bare while ten fetched 1.1.0 from a CDN, so both
        // copies shipped — the bundled one and the fetched one, at different versions,
        // exchanging context requests. Nothing reports that; the events happen to be
        // compatible, which is luck rather than design.
        const pkg = JSON.parse(read('package.json'));
        const declared = { ...pkg.dependencies, ...pkg.devDependencies }['@lit/context'];
        expect(declared, '@lit/context is not a declared dependency').toBeDefined();

        const importers = FILES.filter(f => /from\s*['"]@lit\/context['"]/.test(read(f)));
        expect(importers.length, 'nobody imports it — the case measures nothing')
            .toBeGreaterThan(5);
    });
});

/**
 * Every HTML page the build serves: its two entry points (rollupOptions.input in
 * vite.config.js) and the pages public/ copies verbatim. Not every .html at the root:
 * an analysis build leaves an untracked stats.html there.
 */
const PAGES = [
    'index.html',
    'login.html',
    ...readdirSync(join(ROOT, 'public')).filter(f => f.endsWith('.html')).map(f => join('public', f)),
];

/** Application code: what ships, without the tests and stories that only run here. */
const APP_FILES = FILES.filter(f => f.startsWith('js') && !/\.(test|stories)\.js$/.test(f) && f !== join('js', 'test-utils.js'));

/** A source, without its comments: prose may name a URL, code may not. */
const code = src => src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

/**
 * The sources a CSP directive allows, from a page's meta tag.
 * @param {string} page Page path, repo-relative.
 * @param {string} directive e.g. 'script-src'.
 * @returns {string[]|null} null when the page has no policy or the directive is absent.
 */
function cspSources(page, directive) {
    const meta = read(page).match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
    if (!meta) return null;
    const entry = meta[1].split(';').map(d => d.trim().split(/\s+/)).find(([name]) => name === directive);
    return entry ? entry.slice(1) : null;
}

describe('nothing else comes from another host either', () => {
    it('finds the pages', () => {
        expect(PAGES).toEqual(expect.arrayContaining(['index.html', 'login.html']));
    });

    it('no page loads a script or a stylesheet from another host', () => {
        // Preconnect and dns-prefetch included: a hint toward a host nothing uses is a
        // connection opened for nothing on every load.
        const offenders = [];
        for (const page of PAGES) {
            for (const [tag] of code(read(page)).matchAll(/<(?:script|link)\b[^>]*>/g)) {
                if (/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//.test(tag)) offenders.push(`${page} — ${tag}`);
            }
        }
        expect(offenders, `tag pointing at another host:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('the policy of each page allows no other host to run code or style it', () => {
        // The browser's own enforcement, and the guard that matters most: whatever the
        // code tries, a script or a stylesheet from a host the policy does not name is
        // refused. Allowing a CDN allows every package published on it.
        for (const page of ['index.html', 'login.html']) {
            for (const directive of ['default-src', 'script-src', 'style-src']) {
                const sources = cspSources(page, directive);
                expect(sources, `${page}: no ${directive} in its policy`).not.toBeNull();
                const hosts = sources.filter(s => !/^'[^']+'$/.test(s));
                expect(hosts, `${page} ${directive} names a host`).toEqual([]);
            }
        }
    });

    it('no code builds a script element', () => {
        // Code arrives by import, which the bundler resolves to files the box serves. A
        // script element built at runtime was how xterm.js came from jsDelivr.
        const offenders = APP_FILES.filter(f => /createElement\(\s*['"]script['"]\s*\)/.test(code(read(f))));
        expect(offenders, `script element built at runtime:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('the service worker precaches nothing from another host', () => {
        const block = read('sw.js').match(/const CACHE_URLS = \[([\s\S]*?)\];/);
        expect(block, 'CACHE_URLS not found in sw.js').not.toBeNull();
        const remote = [...code(block[1]).matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]).filter(u => /^(https?:)?\/\//.test(u));
        expect(remote).toEqual([]);
    });
});

/**
 * Where a static import resolves, when it names a file of this repository.
 * @param {string} from Importing file, repo-relative.
 * @param {string} specifier As written.
 * @returns {string|null} Repo-relative path, or null for a package.
 */
function localTarget(from, specifier) {
    if (!specifier.startsWith('.')) return null;
    const target = relative(ROOT, resolve(ROOT, dirname(from), specifier));
    return existsSync(join(ROOT, target)) ? target : null;
}

/**
 * Everything a page loads before it can run: the static import graph from its entry
 * module. Dynamic `import()` is not followed — that is the point of it.
 * @param {string} entry Repo-relative entry module.
 * @returns {{modules: Set<string>, packages: Map<string, string>}} The files reached, and
 *   each package imported, with the first file found importing it.
 */
function startupGraph(entry) {
    const modules = new Set();
    const packages = new Map();
    const pending = [entry];
    while (pending.length) {
        const file = pending.pop();
        if (modules.has(file)) continue;
        modules.add(file);
        const src = code(read(file));
        const specifiers = [
            ...src.matchAll(/(?:^|[;\n])\s*import\s+(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"]+)['"]/g),
            ...src.matchAll(/(?:^|[;\n])\s*export\s+[\w$*{}\s,]+?\s+from\s+['"]([^'"]+)['"]/g),
        ].map(m => m[1]);
        for (const specifier of specifiers) {
            const target = localTarget(file, specifier);
            if (target) pending.push(target);
            else if (!specifier.startsWith('.') && !packages.has(specifier)) packages.set(specifier, file);
        }
    }
    return { modules, packages };
}

describe('the libraries stay off the startup', () => {
    // Chart.js, CodeMirror and xterm.js are a few hundred kilobytes for three screens most
    // sessions never open. Each is loaded by the screen that needs it — a component the
    // Performance tab imports on demand, or an import() at the moment of use — and a single
    // static import from the startup graph would quietly put it on every start instead.
    const ON_DEMAND = /^(chart\.js|codemirror|@xterm\/)/;

    for (const entry of [join('js', 'main.js'), join('js', 'login.js')]) {
        it(`${entry} reaches none of them statically`, () => {
            const { modules, packages } = startupGraph(entry);
            // Otherwise the walk went nowhere and the assertions below hold vacuously.
            expect(modules.size, 'the import graph was not followed').toBeGreaterThan(entry.includes('main') ? 50 : 3);
            expect(packages.has('lit'), 'the import graph misses lit — the parsing is wrong').toBe(true);

            const eager = [...packages].filter(([name]) => ON_DEMAND.test(name)).map(([name, by]) => `${name} (by ${by})`);
            expect(eager, `on-demand library imported at startup:\n  ${eager.join('\n  ')}`).toEqual([]);
            expect(modules.has(join('js', 'core', 'codemirror.js')), 'js/core/codemirror.js is imported statically').toBe(false);
        });
    }

    it('the precache keeps them, with the screens that need them', () => {
        // The box keeps two versions' files: a device asleep through two updates finds
        // none of its own there, and a screen precached without its library stays empty.
        const config = read('vite.config.js');
        const ignored = config.match(/globIgnores:\s*\[([^\]]*)\]/);
        expect(ignored, 'globIgnores not found in vite.config.js').not.toBeNull();
        for (const name of ['chart', 'codemirror', 'xterm']) {
            expect(config, `manualChunks does not name the ${name} chunk`).toMatch(new RegExp(`return '${name}';`));
            expect(ignored[1], `the precache leaves ${name} out`).not.toMatch(new RegExp(`${name}|\\*\\.js|assets/\\*`));
        }
    });

    it('the screens that need them do import them', () => {
        // The other half: a dynamic import that names nothing would pass the case above.
        const sources = {
            [join('js', 'components', 'organisms', 'ag-latency-test.js')]: /from\s*['"]chart\.js\/auto['"]/,
            [join('js', 'components', 'organisms', 'ag-network-test.js')]: /from\s*['"]chart\.js\/auto['"]/,
            [join('js', 'components', 'organisms', 'ag-config-editor.js')]: /\bCodeMirrorController\b[^;]*from\s*['"]\.\.\/\.\.\/core\/CodeMirrorController\.js['"]/,
            [join('js', 'components', 'organisms', 'ag-json-config-modal.js')]: /\bCodeMirrorController\b[^;]*from\s*['"]\.\.\/\.\.\/core\/CodeMirrorController\.js['"]/,
            [join('js', 'core', 'CodeMirrorController.js')]: /\{\s*loadCodeMirror\s*\}\s*from\s*['"]\.\/load-codemirror\.js['"]/,
            [join('js', 'core', 'load-codemirror.js')]: /import\(\s*['"]\.\/codemirror\.js['"]\s*\)/,
            [join('js', 'components', 'molecules', 'ag-terminal.js')]: /import\(\s*['"]@xterm\/xterm['"]\s*\)/,
        };
        for (const [file, pattern] of Object.entries(sources)) {
            expect(code(read(file)), file).toMatch(pattern);
        }
    });
});

describe('the pipeline is held from the start', () => {
    // The core hands the last audio pipeline to a screen joining its stream, once. Its
    // holder was imported only by the Pipeline tab's components, which load on demand: the
    // pipeline went by unheard, and the tab opened on a reading of the core — a build of
    // the pipeline on the box (measured in Chromium, 2026-10-05).
    it('js/main.js reaches js/core/pipeline-state.js statically', () => {
        const { modules } = startupGraph(join('js', 'main.js'));
        expect(modules.size, 'the import graph was not followed').toBeGreaterThan(50);
        expect(modules.has(join('js', 'core', 'pipeline-state.js'))).toBe(true);
    });
});
