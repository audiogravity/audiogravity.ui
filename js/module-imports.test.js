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
 * The remaining CDN tags in index.html (Chart.js, CodeMirror) and the terminal's dynamic
 * xterm load are deliberately NOT covered here: they degrade rather than break, and moving
 * them is its own piece of work with its own trap — bundling them naively would put 128 KB
 * on every start for two screens most people never open. See BACKLOG.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

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
