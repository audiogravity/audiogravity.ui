/**
 * Regression guards for the interface's typography contract, which has two
 * halves. Neither shows up in a screenshot taken on a machine that happens to
 * own a similar-looking system font, so both are asserted against the sources
 * directly, in the manner of anti-zoom.test.js.
 *
 * 1. The typeface comes from the box. Nothing reaches a font host: not a
 *    <link>, not the service worker, and the Content-Security-Policy of each
 *    page refuses one even if a <link> reappeared. The interface used to fetch
 *    Inter from a CDN on every load — and the default theme then substituted a
 *    system stack, so the file was downloaded and discarded.
 *
 * 2. The theme layer owns the family, and a theme's choice wins everywhere.
 *    --font-family lives on :root at (0,0,0) and in css/themes/*.css at
 *    (0,1,0); a contributor adding a theme declares it once and is obeyed
 *    across the whole interface. That only holds while no page or component
 *    stylesheet declares it too — css/login.css once pinned one at (0,1,1),
 *    which would have outranked every theme on exactly one screen. The guard
 *    below is what keeps that from coming back, on any screen, silently.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const CSS_ROOT = path.join(ROOT, 'css');

const FONTS_CSS = read('css', 'fonts.css');
const MAIN_CSS = read('css', 'main.css');
const THEMES_CSS = read('css', 'themes.css');
const MINIMAL_CSS = read('css', 'themes', 'minimal.css');
const LOGIN_JS = read('js', 'login.js');
const COMMON_JS = read('js', 'common.js');
const SW_JS = read('sw.js');

/**
 * List every .css file under a directory, recursively.
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function listCss(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listCss(full));
        else if (entry.name.endsWith('.css')) out.push(full);
    }
    return out;
}

/**
 * Drop CSS comments. The comments in these files quote the declaration being
 * forbidden in order to explain why it is absent, and a comment styles nothing.
 * @param {string} css
 * @returns {string}
 */
function stripCssComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * List every source .js file under a directory, tests and stories excluded.
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function listJs(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listJs(full));
        else if (/\.js$/.test(entry.name) && !/\.(test|stories)\.js$/.test(entry.name)) out.push(full);
    }
    return out;
}

/**
 * Drop JavaScript comments, so prose describing a forbidden declaration does not
 * read as one. Line comments are removed only when they occupy the whole line —
 * a trailing `//` rule would truncate any line holding a URL.
 * @param {string} js
 * @returns {string}
 */
function stripJsComments(js) {
    return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every HTML entry point Vite builds, plus the offline shell it serves. */
const HTML_PAGES = ['index.html', 'login.html', path.join('public', 'offline.html')];

/**
 * Drop HTML comments. A comment fetches nothing, and the ones in these pages
 * name the very hosts being forbidden in order to explain their own absence —
 * scanning them would fail the rule they document.
 * @param {string} html
 * @returns {string}
 */
function stripHtmlComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, '');
}

/** System font names that may follow the chosen face, but must never lead it. */
const SYSTEM_FONTS = [
    '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto',
    'helvetica', 'arial', 'system-ui',
];

/**
 * Extract the value of a custom property declared on a given selector.
 * @param {string} css Stylesheet source.
 * @param {string} selector Exact selector text of the rule.
 * @param {string} prop Custom property name, including the leading dashes.
 * @returns {string|null} The declared value, or null if absent.
 */
function customPropertyIn(css, selector, prop) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = css.match(new RegExp(`(?:^|[},/*\\s])${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    if (!block) return null;
    const decl = block[1].match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
    return decl ? decl[1].trim() : null;
}

/**
 * CSS specificity of a simple selector, as [ids, classes, types].
 * Enough for the selectors compared here; not a general implementation.
 * @param {string} selector
 * @returns {number[]} specificity triple, comparable lexicographically
 */
function specificity(selector) {
    const ids = (selector.match(/#[\w-]+/g) || []).length;
    const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(?!\()/g) || []).length;
    const types = (selector.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return [ids, classes, types];
}

/**
 * Compare two specificity triples.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} >0 if a wins, <0 if b wins, 0 on a tie
 */
function compareSpecificity(a, b) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

/** Every url() referenced by the @font-face rules, in declaration order. */
const FONT_URLS = [...FONTS_CSS.matchAll(/url\('([^']+)'\)/g)].map(m => m[1]);

/**
 * The @font-face rules, in declaration order, as {family, url} pairs.
 * @type {{family: string, url: string}[]}
 */
const FACES = [...FONTS_CSS.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map(([, body]) => ({
    family: body.match(/font-family:\s*([^;]+);/)[1].trim().replace(/['"]/g, ''),
    url: body.match(/url\('([^']+)'\)/)[1],
}));

/** Families declared by the stylesheet, in first-declared order. */
const FAMILIES = [...new Set(FACES.map(f => f.family))];

describe('fonts — served from disk, everywhere', () => {
    it('is pulled in by the stylesheet manifest, so every surface gets it', () => {
        // main.css is what index.html, login.html and Storybook's preview.js all
        // load. One import covers the three rather than a <link> per page.
        expect(MAIN_CSS).toMatch(/@import\s+'fonts\.css';/);
    });

    for (const page of HTML_PAGES) {
        it(`${page} reaches no font host`, () => {
            const html = stripHtmlComments(read(...page.split(path.sep)));
            expect(html, 'fonts.googleapis.com').not.toMatch(/fonts\.googleapis\.com/);
            expect(html, 'fonts.gstatic.com').not.toMatch(/fonts\.gstatic\.com/);
        });
    }

    for (const page of ['index.html', 'login.html']) {
        it(`${page} declares a CSP that forbids remote fonts`, () => {
            // The policy is the backstop: even a <link> added by mistake later
            // cannot fetch a face from a third party.
            const html = read(page);
            const fontSrc = html.match(/font-src\s+([^;]+);/);
            expect(fontSrc, 'aucune directive font-src').not.toBeNull();
            expect(fontSrc[1].trim()).toBe("'self' data:");
        });
    }

    it('leaves no font host in the service worker', () => {
        expect(SW_JS).not.toMatch(/fonts\.googleapis\.com/);
        expect(SW_JS).not.toMatch(/fonts\.gstatic\.com/);
    });

    it('declares every @font-face with a relative url, never a remote one', () => {
        expect(FONT_URLS.length).toBeGreaterThan(0);
        for (const url of FONT_URLS) {
            expect(url.startsWith('http')).toBe(false);
            expect(url.startsWith('//')).toBe(false);
        }
    });

    it('ships every referenced font file, as real WOFF2', () => {
        for (const url of FONT_URLS) {
            const file = path.join(ROOT, 'css', url);
            expect(fs.existsSync(file), `${url} is missing`).toBe(true);
            // WOFF2 files start with the signature 'wOF2'.
            expect(fs.readFileSync(file).subarray(0, 4).toString('ascii')).toBe('wOF2');
        }
    });

    it('covers the weights the UI actually uses (400-700)', () => {
        const weights = [...FONTS_CSS.matchAll(/font-weight:\s*([^;]+);/g)].map(m => m[1].trim());
        expect(weights.length).toBe(FONT_URLS.length);
        for (const w of weights) expect(w).toBe('400 700');
    });

    it('declares latin last in each family, so the shared marks do not pull latin-ext', () => {
        // U+0304/0308/0329 sit in both subsets; CSS font matching takes the face
        // declared last, so latin must come after latin-ext within a family or an
        // ASCII-only page drags the latin-ext file onto the wire.
        for (const family of FAMILIES) {
            const urls = FACES.filter(f => f.family === family).map(f => f.url);
            expect(urls.length, `${family} n'a pas ses deux sous-ensembles`).toBe(2);
            expect(urls[urls.length - 1], `${family} : latin doit être déclaré en dernier`)
                .toMatch(/-latin\.woff2$/);
        }
    });

    it('redistributes the OFL text inside the deployed artifact', () => {
        // The UI package ships _site/ only, and Vite copies publicDir verbatim —
        // so the license has to live there, not next to the woff2 files.
        // One notice per family: the license text is the same document, the
        // copyright line is not, and it is the copyright line OFL 1.1 §2 asks to
        // travel with the binaries.
        const notices = {
            'OFL-Inter.txt': 'The Inter Project Authors',
            'OFL-JetBrains-Mono.txt': 'The JetBrains Mono Project Authors',
        };
        expect(Object.keys(notices).length).toBe(FAMILIES.length);
        for (const [file, holder] of Object.entries(notices)) {
            const license = path.join(ROOT, 'public', 'fonts', file);
            expect(fs.existsSync(license), `public/fonts/${file} is missing`).toBe(true);
            const text = fs.readFileSync(license, 'utf8');
            expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
            expect(text, `${file} ne porte pas son détenteur`).toContain(holder);
            // Source-level pointer only, for whoever edits the stylesheet next:
            // this header does not ship, esbuild strips every comment from the
            // bundle. The notices that reach the box are the served files above.
            expect(FONTS_CSS).toContain(`/fonts/${file}`);
        }
    });
});

describe('typography — the theme layer owns the family, and always wins', () => {
    it('defaults to Inter on :root', () => {
        const value = customPropertyIn(THEMES_CSS, ':root', '--font-family');
        expect(value, 'aucun --font-family sur :root').not.toBeNull();
        expect(value.split(',')[0].trim().replace(/['"]/g, '')).toBe('Inter');
    });

    it('names, in both tokens, families the stylesheet actually declares', () => {
        // Rename a face and the token still resolves — to the generic fallback,
        // silently. Both ends have to agree by name.
        for (const token of ['--font-family', '--font-mono']) {
            const named = customPropertyIn(THEMES_CSS, ':root', token)
                .split(',')[0].trim().replace(/['"]/g, '');
            expect(FAMILIES, `${token} nomme « ${named} », non déclarée`).toContain(named);
        }
        expect(customPropertyIn(THEMES_CSS, ':root', '--font-mono')
            .split(',')[0].trim().replace(/['"]/g, '')).toBe('JetBrains Mono');
    });

    it('keeps the family out of the components, stylesheet or script', () => {
        // The CSS guard below reads css/ only, which is how two components kept
        // their own monospace face for so long: a Lit `static styles` block and
        // an xterm.js option object both live in .js, where no stylesheet check
        // ever looks. Anything naming a face has to go through the token, or
        // through monoFontFamily() when it draws to a canvas and cannot.
        const offenders = [];
        for (const file of listJs(path.join(ROOT, 'js'))) {
            const src = stripJsComments(fs.readFileSync(file, 'utf8'));
            for (const line of src.split('\n')) {
                if (!/font-family\s*:|fontFamily\s*:/.test(line)) continue;
                if (/var\(--font-(family|mono)/.test(line)) continue;
                if (/monoFontFamily\(\)/.test(line)) continue;
                offenders.push(`${path.relative(ROOT, file)} — ${line.trim().slice(0, 60)}`);
            }
        }
        expect(offenders, `polices écrites en dur :\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('never sets an uppercase label in the monospace face', () => {
        // The testable half of rule 3. Monospace is for values transcribed
        // character by character; a label in capitals is read as a shape, and
        // the interface face is what the repo's own CSS conventions ask for
        // there. Six rules had drifted — three status badges among them.
        //
        // The other half of rule 3 — "is this content actually read digit by
        // digit?" — is a judgement about meaning and cannot be asserted here.
        const offenders = [];
        for (const file of listCss(CSS_ROOT)) {
            const css = stripCssComments(fs.readFileSync(file, 'utf8'));
            for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                if (!/--font-mono/.test(body)) continue;
                if (!/text-transform:\s*uppercase/.test(body)) continue;
                offenders.push(`${path.relative(ROOT, file)} — ${selector.trim().split('\n').pop()}`);
            }
        }
        expect(offenders, `capitales en monospace :\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('never lets waiting for a face swallow what arrived meanwhile', () => {
        // Waiting for the monospace face before opening the terminal is right —
        // xterm measures its cell once and would otherwise size the grid against
        // the fallback. But the wait is a network round trip on a cold cache, and
        // it was placed after the socket was already open and before its message
        // handler existed: a WebSocket frame with no handler is dropped, not
        // queued, so the shell's banner and first prompt vanished.
        //
        // The handler must therefore be attached before the wait begins. Source
        // order is the whole guarantee, so source order is what is asserted.
        const term = read('js', 'components', 'molecules', 'ag-terminal.js');
        const firstHandler = term.indexOf('ws.onmessage');
        const fontWait = term.indexOf('document.fonts.load');
        expect(firstHandler, 'aucun gestionnaire de message').toBeGreaterThan(-1);
        expect(fontWait, "aucune attente de police — xterm mesurerait le repli").toBeGreaterThan(-1);
        expect(firstHandler, "l'attente de la police précède le gestionnaire").toBeLessThan(fontWait);
    });

    it('resolves the token in one place for the consumers that cannot read CSS', () => {
        // Second occurrence triggers extraction, per the repo's DRY rule: the dev
        // badge and the terminal both needed it.
        expect(COMMON_JS).toMatch(/function monoFontFamily\(\)/);
        expect(COMMON_JS).toMatch(/getPropertyValue\('--font-mono'\)/);
        const inlineReads = [...COMMON_JS.matchAll(/getPropertyValue\('--font-mono'\)/g)];
        expect(inlineReads.length, 'la lecture doit rester dans le seul helper').toBe(1);
    });

    it('keeps the family out of every stylesheet but the theme layer', () => {
        // This is what makes a contributor's theme win. A page or component rule
        // declaring --font-family sits at (0,1,1) or worse and outranks every
        // `[data-theme="…"]` at (0,1,0): the theme would then be obeyed
        // everywhere except that one screen. css/login.css did exactly that.
        const offenders = [];
        for (const file of listCss(CSS_ROOT)) {
            const rel = path.relative(ROOT, file);
            if (rel === path.join('css', 'themes.css') || rel.startsWith(path.join('css', 'themes') + path.sep)) continue;
            const body = stripCssComments(fs.readFileSync(file, 'utf8'));
            if (/--font-(family|mono)\s*:/.test(body)) offenders.push(rel);
        }
        expect(offenders, `déclarations hors du calque thème : ${offenders.join(', ')}`).toEqual([]);
    });

    it('loads the themes after the defaults, since specificity cannot separate them', () => {
        // `:root` is a pseudo-class and weighs (0,1,0) — the same as
        // `[data-theme="…"]`. Neither outranks the other, so source order is the
        // whole mechanism: the theme files must be imported after themes.css or
        // the defaults win and a contributor's theme is quietly ignored.
        expect(compareSpecificity(specificity('[data-theme="minimal"]'), specificity(':root')))
            .toBe(0);

        const order = [...MAIN_CSS.matchAll(/@import\s+'([^']+)';/g)].map(m => m[1]);
        const defaults = order.indexOf('themes.css');
        expect(defaults, 'main.css n\'importe pas themes.css').toBeGreaterThanOrEqual(0);
        for (const theme of ['slate', 'gravity', 'minimal']) {
            const at = order.indexOf(`themes/${theme}.css`);
            expect(at, `themes/${theme}.css n'est pas importé par main.css`).toBeGreaterThanOrEqual(0);
            expect(at, `themes/${theme}.css doit venir après themes.css`).toBeGreaterThan(defaults);
        }

        // themes.css must not import them itself: an @import precedes every rule
        // in its own file, so they would land before the defaults again.
        expect(stripCssComments(THEMES_CSS)).not.toMatch(/@import\s+'themes\//);
    });

    it('reaches every element a component may read the token from', () => {
        // data-theme is stamped on <html> and on <body>, so a component reading
        // var(--font-family) on either one sees the theme's value.
        expect(LOGIN_JS).toMatch(/document\.body\.setAttribute\(\s*'data-theme'/);
        expect(LOGIN_JS).toMatch(/document\.documentElement\.setAttribute\(\s*'data-theme'/);
        expect(COMMON_JS).toMatch(/document\.body\.setAttribute\(\s*'data-theme'/);
        expect(COMMON_JS).toMatch(/document\.documentElement\.setAttribute\(\s*'data-theme'/);
    });

    it('leaves the default theme on the reference typeface', () => {
        // Minimal is what almost every installation renders. It substituted a
        // system stack, so the interface downloaded a font it then discarded and
        // looked different on every OS. A theme *may* override; this one does not.
        expect(customPropertyIn(MINIMAL_CSS, '[data-theme="minimal"]', '--font-family')).toBeNull();
    });

    it('offers system names only as a fallback, never as the choice', () => {
        const value = customPropertyIn(THEMES_CSS, ':root', '--font-family').toLowerCase();
        const first = value.split(',')[0].trim();
        for (const font of SYSTEM_FONTS) {
            expect(first, `${font} must not lead the default stack`).not.toContain(font);
        }
    });
});
