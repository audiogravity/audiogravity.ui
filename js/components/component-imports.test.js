/**
 * Guard: every <ag-*> custom element used in a component's template must be
 * reachable through that component's own static (or dynamic) import graph.
 *
 * The app happens to work without this because js/main.js registers every
 * component globally — but any partial entrypoint (Storybook, isolated tests,
 * a future code-split page) renders unimported children as empty elements,
 * silently. Two such bugs shipped before this guard existed (ag-switch in
 * ag-config-panel, ag-volume-popover in the fullscreen player).
 *
 * Static analysis, no DOM: tags are collected from each source file (comments
 * stripped), definitions from `customElements.define('ag-…')` across js/, and
 * reachability follows relative `import` specifiers (both static and dynamic).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Recursively list .js source files under a directory (skip tests/stories). */
function listSources(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...listSources(p));
        } else if (
            entry.name.endsWith('.js')
            && !entry.name.endsWith('.test.js')
            && !entry.name.endsWith('.stories.js')
        ) {
            out.push(p);
        }
    }
    return out;
}

/** Strip block comments and whole-line // comments (keeps string contents). */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Extract relative import specifiers (static and dynamic) from a source. */
function importSpecifiers(src) {
    const specs = [];
    const staticRe = /import\s+(?:[\w${},*\s]+\s+from\s+)?['"]([^'"]+)['"]/g;
    const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const re of [staticRe, dynamicRe]) {
        let m;
        while ((m = re.exec(src)) !== null) {
            if (m[1].startsWith('.')) specs.push(m[1]);
        }
    }
    return specs;
}

/** Resolve a relative specifier from a file to an absolute path (or null). */
function resolveSpec(fromFile, spec) {
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
}

const allSources = listSources(JS_ROOT);
const sourceText = new Map(allSources.map((f) => [f, stripComments(fs.readFileSync(f, 'utf8'))]));

/** tag → defining file, from customElements.define calls across js/. */
const definedIn = new Map();
for (const [file, src] of sourceText) {
    for (const m of src.matchAll(/customElements\.define\(\s*['"]([a-z0-9-]+)['"]/g)) {
        definedIn.set(m[1], file);
    }
}

/** Tags defined anywhere in a file's transitive import closure (memoised per root). */
function reachableTags(rootFile) {
    const seen = new Set();
    const tags = new Set();
    const queue = [rootFile];
    while (queue.length) {
        const file = queue.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        const src = sourceText.get(file) ?? stripComments(fs.readFileSync(file, 'utf8'));
        for (const m of src.matchAll(/customElements\.define\(\s*['"]([a-z0-9-]+)['"]/g)) {
            tags.add(m[1]);
        }
        for (const spec of importSpecifiers(src)) {
            const resolved = resolveSpec(file, spec);
            if (resolved) queue.push(resolved);
        }
    }
    return tags;
}

describe('component import graph', () => {
    it('every <ag-*> tag used in a component template is imported by that component', () => {
        const componentFiles = allSources.filter((f) =>
            f.includes(`${path.sep}components${path.sep}`) && definedIn.size > 0);
        const violations = {};
        for (const file of componentFiles) {
            const src = sourceText.get(file);
            const used = new Set(
                [...src.matchAll(/<(ag-[a-z0-9-]+)[\s>/]/g)].map((m) => m[1]),
            );
            if (!used.size) continue;
            const reachable = reachableTags(file);
            const missing = [...used].filter(
                (tag) => definedIn.has(tag) && definedIn.get(tag) !== file && !reachable.has(tag),
            );
            if (missing.length) violations[path.relative(JS_ROOT, file)] = missing.sort();
        }
        expect(violations).toEqual({});
    });
});
