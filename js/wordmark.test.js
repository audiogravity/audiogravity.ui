/**
 * The Audiogravity wordmark, wherever the interface shows it.
 *
 * It was an <img> pointing at an SVG, and that file was never a drawn logo: two Inkscape
 * <text> nodes asking for Helvetica, never converted to paths.
 * On a box without Helvetica — every Linux and every Android the interface runs on — the
 * mark was drawn in whatever fontconfig substituted, so it differed from device to
 * device while looking deliberate on the machine it was authored on. Nothing in a test
 * suite, a lint pass or a screenshot taken on a Mac could report that.
 *
 * It is now text, set the way the landing page sets it. Three things have to hold
 * together for that to keep working, and none of them fails loudly on its own:
 *   - the markup is `Audiogravi<sup>ty</sup>`, which is the brand rule;
 *   - the mark stays an inline-block, or a flex parent turns the <sup> into a flex item
 *     and `gap` splits the brand in two;
 *   - css/fonts.css declares Inter up to 900, or the weight silently renders at 700
 *     (asserted in js/fonts.test.js, which owns the faces).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const WORDMARK_CSS = read('css', 'components', 'wordmark.css');
const MAIN_CSS = read('css', 'main.css');

/** Where the mark stands as a logo, and the classes sizing it there. */
const CALL_SITES = [
    // Two on the app shell: the splash screen painted before anything else, then the
    // title bar of the interface itself.
    { file: 'index.html', sizes: ['splash-wordmark', 'app-logo'] },
    { file: 'login.html', sizes: ['login-logo'] },
    { file: path.join('js', 'components', 'molecules', 'ag-tabs.js'), sizes: ['tabs-logo'] },
];

/** Where it appears inside a line of text — a footer credit, in both shells. */
const IN_TEXT = [
    path.join('js', 'login.js'),
    path.join('js', 'components', 'organisms', 'ag-footer.js'),
];

/**
 * Drop CSS comments — the prose here quotes the declarations it forbids.
 * @param {string} css
 * @returns {string}
 */
const stripCssComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The body of a CSS rule, by exact selector.
 * @param {string} css Stylesheet source, comments included.
 * @param {string} selector Exact selector text.
 * @returns {string|null}
 */
function rule(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = stripCssComments(css).match(new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
    return m ? m[1] : null;
}

describe('the wordmark is text, at every call-site', () => {
    it('is imported by the stylesheet manifest, so login and the app both get it', () => {
        expect(MAIN_CSS).toMatch(/@import\s+'components\/wordmark\.css';/);
    });

    for (const { file, sizes } of CALL_SITES) {
        it(`${file} writes the brand as markup, in the shared class`, () => {
            const src = read(...file.split(path.sep));
            const marks = [...src.matchAll(/class="ag-wordmark ([\w-]+)">Audiogravi<sup>ty<\/sup><\/span>/g)]
                .map(m => m[1]);
            expect(marks.length, 'aucune marque rendue en texte').toBeGreaterThan(0);
            expect([...new Set(marks)].sort()).toEqual([...sizes].sort());
        });
    }

    for (const file of IN_TEXT) {
        it(`${file} sets the footer credit in the same treatment`, () => {
            // The footers already wrote `Audiogravi<sup>ty</sup>`; what they lacked was
            // the class, so the brand was rendered at the weight of the link around it
            // (600) with the browser's default superscript — 0.83em against the mark's
            // 0.38em, which is why the `ty` read as nearly full size there.
            const src = read(...file.split(path.sep));
            const marks = [...src.matchAll(
                /class="ag-wordmark ag-wordmark--in-text">Audiogravi<sup>ty<\/sup><\/span>/g)];
            expect(marks.length, 'le crédit du pied ne porte pas la marque').toBeGreaterThan(0);
        });
    }

    it('leaves the drawn logo behind everywhere, precache included', () => {
        // The file has moved to audiogravity.design, where retired sources live: an
        // interface repository ships what it serves.
        expect(fs.existsSync(path.join(ROOT, 'public', 'pics', 'audiogravity.svg')),
            "l'ancien SVG est de retour dans public/pics/").toBe(false);
        const offenders = [];
        for (const file of ['index.html', 'login.html', 'sw.js',
            path.join('js', 'components', 'molecules', 'ag-tabs.js')]) {
            if (read(...file.split(path.sep)).includes('pics/audiogravity.svg')) offenders.push(file);
        }
        expect(offenders, `l'ancien SVG est encore référencé : ${offenders.join(', ')}`).toEqual([]);
    });
});

describe('the mark is styled in one place', () => {
    it('sets the landing page treatment on the shared class', () => {
        const body = rule(WORDMARK_CSS, '.ag-wordmark');
        expect(body, 'la classe partagée a disparu').not.toBeNull();
        expect(body).toMatch(/font-weight:\s*900/);
        expect(body).toMatch(/letter-spacing:\s*-0?\.05em/);
        expect(body).toMatch(/font-family:\s*var\(--font-family\)/);
    });

    it('inherits its colour rather than declaring one', () => {
        // As a logo it inherits --text-primary from the body, which is what replaced the
        // dark-mode `filter` the <img> needed. Inside a footer link it has to keep the
        // colour of the line — a declared colour would repaint those credits and freeze
        // them on hover.
        const body = rule(WORDMARK_CSS, '.ag-wordmark');
        expect(body, 'la marque impose une couleur').not.toMatch(/(^|[;{])\s*color\s*:/);
    });

    it('goes inline in running text, so a link underline reaches it', () => {
        // text-decoration stops at an atomic inline box: as an inline-block the brand sat
        // un-underlined in the middle of an underlined footer line.
        const body = rule(WORDMARK_CSS, '.ag-wordmark--in-text');
        expect(body, 'la variante en ligne a disparu').not.toBeNull();
        expect(body).toMatch(/display:\s*inline\s*;/);
    });

    it('keeps the mark an inline-block, so a flex parent cannot reach the <sup>', () => {
        // .auto-passkey-panel on the login page is a flex container with a gap. As a
        // flex item the superscript would take that gap as blank space on both sides
        // and split the brand in two — the landing page hit exactly that in its
        // announce bar. An inline-block keeps the whole mark in one inline context.
        const body = rule(WORDMARK_CSS, '.ag-wordmark');
        expect(body).toMatch(/display:\s*inline-block/);
        expect(body, 'la marque est devenue un conteneur flex').not.toMatch(/display:\s*(inline-)?flex/);
    });

    it('sizes the superscript against the mark, not against the type scale', () => {
        const sup = rule(WORDMARK_CSS, '.ag-wordmark sup');
        expect(sup, 'la règle du sup a disparu').not.toBeNull();
        expect(sup).toMatch(/font-size:\s*0?\.38em/);
        expect(sup).toMatch(/vertical-align:\s*super/);
    });

    it('leaves the call-sites nothing to declare but their size', () => {
        // Second occurrence triggers extraction, per the repo's DRY rule: three
        // surfaces show the same mark, and the treatment has to come from one file or
        // they drift apart the first time one of them is touched.
        const offenders = [];
        for (const file of [path.join('css', 'layout.css'), path.join('css', 'login.css')]) {
            const css = stripCssComments(read(...file.split(path.sep)));
            for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                if (!/\.(app|login|tabs)-logo\b/.test(selector)) continue;
                for (const prop of ['font-weight', 'letter-spacing', 'font-family']) {
                    if (new RegExp(`${prop}\\s*:`).test(body)) {
                        offenders.push(`${file} — ${selector.trim().split('\n').pop()} : ${prop}`);
                    }
                }
            }
        }
        expect(offenders, `traitement redéclaré hors de wordmark.css :\n  ${offenders.join('\n  ')}`)
            .toEqual([]);
    });
});
