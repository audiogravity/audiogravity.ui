/**
 * The type scale of UI_GUIDELINES.md, over the AG interface.
 *
 * Nothing here fails in a browser. A size written as a value renders exactly as intended by
 * whoever wrote it, and looks considered on their screen; what it costs is that the next
 * person has no step to reach for and adds another value beside it. That is how this scale
 * came to hold **eight names for seven values**: xs..xl were declared in one place and
 * xxs/xxl/xxxl in another a hundred and ten lines below, and --font-size-xxl was given
 * 20px — exactly what --font-size-xl already was. Two steps rendered identically on every
 * desktop and only came apart under the 768px media query, so two components asked for a
 * step that was not one.
 *
 * The pipeline diagram is deliberately outside all of this. Its labels are SVG text sized
 * to fit inside a drawn node at a fixed viewBox: they answer to the geometry of the
 * drawing, not to the typography of the page, and putting them on the scale would make the
 * diagram's legibility depend on a decision taken for tables.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

/** @param {string} dir @param {RegExp} ext @returns {string[]} repo-relative paths */
function walk(dir, ext) {
    return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel, ext);
        return ext.test(e.name) && !/\.test\.js$/.test(e.name) ? [rel] : [];
    });
}

/** The two atoms that draw the pipeline, whose text lives inside an SVG viewBox. */
const SVG_ATOMS = /ag-pipeline-(node|link)\.js$/;

const SOURCES = [...walk('css', /\.css$/), ...walk('js', /\.js$/)].filter(f => !SVG_ATOMS.test(f));

const THEMES = read('css/themes.css');

/** The scale as declared, step → px. */
function scale() {
    const out = {};
    // Only the canonical block: the media query and compact mode redefine some steps on
    // purpose, and reading those as declarations would report the scale as inconsistent.
    const head = THEMES.slice(0, THEMES.indexOf('@media'));
    for (const m of head.matchAll(/--font-size-([a-z]+):\s*(\d+)px/g)) out[m[1]] = Number(m[2]);
    return out;
}

describe('the type scale is one closed scale', () => {
    it('declares seven steps, in one place', () => {
        expect(Object.keys(scale()).sort()).toEqual(['lg', 'md', 'sm', 'xl', 'xs', 'xxl', 'xxs']);
    });

    it('gives every step a different value', () => {
        // The defect this file was written for. Two names for one value is not a scale, and
        // it hides: both rendered at 20px, so nothing looked wrong anywhere.
        const s = scale();
        const byValue = new Map();
        for (const [k, v] of Object.entries(s)) byValue.set(v, [...(byValue.get(v) ?? []), k]);
        const collisions = [...byValue].filter(([, ks]) => ks.length > 1)
            .map(([v, ks]) => `${ks.join(' = ')} — both ${v}px`);
        expect(collisions, `steps sharing a value:\n  ${collisions.join('\n  ')}`).toEqual([]);
    });

    it('orders the steps by their names', () => {
        const s = scale();
        const order = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
        for (let i = 1; i < order.length; i++) {
            expect(s[order[i]], `${order[i - 1]} → ${order[i]} is not a step up`)
                .toBeGreaterThan(s[order[i - 1]]);
        }
    });

    it('names no step it does not declare', () => {
        // --font-size-xxxl was renamed to xxl. A reference left behind resolves to nothing,
        // and a font-size that resolves to nothing is inherited rather than reported.
        const declared = new Set(Object.keys(scale()));
        const offenders = new Set();
        for (const file of SOURCES) {
            for (const m of read(file).matchAll(/var\(\s*--font-size-([a-z]+)\s*[,)]/g)) {
                if (!declared.has(m[1])) offenders.add(`${file} — --font-size-${m[1]}`);
            }
        }
        expect([...offenders], `step referenced but never declared:\n  ${[...offenders].join('\n  ')}`)
            .toEqual([]);
    });
});

describe('sizes come from the scale', () => {
    it('finds the sources', () => {
        expect(SOURCES.length).toBeGreaterThan(50);
    });

    it('writes no size as a value, unless it says why', () => {
        // Bounded by the enclosing rule rather than by a character window: a window excuses
        // whatever happens to follow a marked declaration, which is how the same guard on
        // the licence server let an unrelated literal through.
        const offenders = [];
        for (const file of SOURCES) {
            const raw = read(file);
            const masked = raw
                .replace(/\/\*[\s\S]*?\*\//g, c => ' '.repeat(c.length))
                .replace(/<!--[\s\S]*?-->/g, c => ' '.repeat(c.length));
            // `font:` as well as `font-size:` — a shorthand carries a size too, and a guard
            // that only knows the longhand reports a file it cannot actually see.
            for (const m of masked.matchAll(/font(?:-size)?:\s*[^;"}]*?(?<![\w.-])([0-9.]+)(px|rem|em)/g)) {
                const scope = raw.slice(raw.lastIndexOf('}', m.index) + 1, m.index);
                if (/rule 12 exception/.test(scope)) continue;
                offenders.push(`${file}:${raw.slice(0, m.index).split('\n').length} — ${m[1]}${m[2]}`);
            }
        }
        expect(offenders, `size written as a value, unexplained:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('is documented with the values it actually has', () => {
        // docs/CSS_ARCHITECTURE.md lists the tokens for contributors. It still showed
        // --font-size-xxl at 20px and a --font-size-xxxl that no longer exists, so someone
        // copying from it would have written a property that resolves to nothing — and a
        // font-size that resolves to nothing is inherited, not reported.
        const doc = read('docs/CSS_ARCHITECTURE.md');
        const documented = Object.fromEntries(
            [...doc.matchAll(/--font-size-([a-z]+):\s*(\d+)px/g)].map(m => [m[1], Number(m[2])]),
        );
        expect(documented, 'the doc lists no font tokens at all').not.toEqual({});
        expect(documented).toEqual(scale());
    });

    it('leaves the pipeline diagram off the scale', () => {
        // Not an oversight — a boundary. Those numbers are chosen against a viewBox, and a
        // future sweep should find this case rather than "tidy" ninety-one of them.
        const svg = ['js/components/atoms/ag-pipeline-node.js', 'js/components/atoms/ag-pipeline-link.js'];
        const literals = svg.reduce((n, f) => n + [...read(f).matchAll(/font-size:\s*[0-9.]+(px|rem)/g)].length, 0);
        expect(literals, 'the diagram stopped sizing its own text').toBeGreaterThan(20);

        const onScale = svg.filter(f => /font-size:\s*var\(--font-size/.test(read(f)));
        expect(onScale, 'diagram text put on the page scale').toEqual([]);
    });

    it('keeps the touch-field size a literal', () => {
        // 16px on a focused field is what stops iOS zooming in and never back out. It is a
        // Safari constant, not a step; js/anti-zoom.test.js requires the literal and caught
        // a sweep that had written it as --font-size-lg — same pixels, but a step invites
        // someone to fold it into the scale later.
        const base = read('css/base.css');
        // The input block, not the first `pointer: coarse` in the file — base.css opens
        // another one earlier for :active transforms, and anchoring on the media feature
        // alone measured that one instead.
        const at = base.indexOf('@media (pointer: coarse)');
        expect(at, 'the touch block is gone').toBeGreaterThan(-1);
        let depth = 0, end = base.length;
        for (let i = base.indexOf('{', at); i < base.length; i++) {
            if (base[i] === '{') depth++;
            else if (base[i] === '}' && --depth === 0) { end = i; break; }
        }
        const block = base.slice(at, end);
        expect(block).toMatch(/font-size:\s*16px/);
        expect(block, 'the touch override reads a scale step').not.toMatch(/font-size:\s*var\(--font-size/);
    });

    it('reserves the smallest step for labels, not for read text', () => {
        // xxs is 10px and exists for things identified at a glance — a badge, a unit, a
        // format tag. Timestamps, errors, tooltips, descriptions and values read character
        // by character were sitting on it too; twenty-nine of them moved up a step. This
        // case names the ones that must not drift back.
        const READ_BACK = [
            ['css/config.css', '.config-file-mtime'],
            ['css/admin.css', '.passkey-date'],
            ['css/system.css', '.log-time'],
            ['css/components/library-sources.css', '.lib-tidal-err'],
            ['css/components/library-sources.css', '.lib-hra-err'],
            ['css/components/now-playing-fullscreen.css', '.npfs-out-error'],
            ['css/services.css', '.metric-tooltip'],
            ['css/system.css', '.network-ip.ipv6'],
        ];
        const offenders = [];
        for (const [file, sel] of READ_BACK) {
            const src = read(file);
            const at = src.indexOf(`${sel} {`);
            if (at === -1) continue;              // renamed; the literal guard still covers it
            const body = src.slice(at, src.indexOf('}', at));
            if (/var\(--font-size-xxs\)/.test(body)) offenders.push(`${file} — ${sel}`);
        }
        expect(offenders, `read text back on the label step:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });
});
