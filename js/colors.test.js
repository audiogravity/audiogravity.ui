/**
 * Guards the colour half of the UI guidelines — rules 6 and 8.
 *
 * Both fail silently. A token that resolves nowhere falls back to a literal
 * written beside it, or drops its declaration; a colour under the contrast
 * floor still renders, and looks fine on the screen of whoever chose it. So
 * both are computed here rather than trusted.
 *
 * The floor is checked against every ground a theme paints, not just one: the
 * value that broke was --text-secondary in Slate, which cleared 4.5:1 on white
 * and failed on --bg-tertiary. A token has to hold on all of them.
 *
 * Rule 8 applies to text. A semantic colour serves three jobs at once — a
 * border (owes 3:1), a tinted fill (owes nothing) and the text on top (owes
 * 4.5:1) — and one value cannot satisfy all three, so the themes declare
 * --color-*-text variants and only those may appear in a `color:` declaration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appSources, filesUnder } from './test-utils.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_ROOT = path.join(ROOT, 'css');
const THEMES = ['minimal', 'slate', 'gravity'];

/** Semantic roles that exist in both a base and a text-safe form. */
const SEMANTIC = ['success', 'error', 'warning', 'info'];

/**
 * The syntax colours are text as much as a paragraph is — the configuration editor, the
 * JSON viewer and the manual's code blocks all write with them. They were outside this list,
 * and nothing noticed that every one of the six theme modes had some between 2.2:1 and 4.4:1
 * (raised 2026-09-26; the old values fail this check in all six).
 * `--syntax-selection` is a background and stays out.
 */
const SYNTAX_TOKENS = ['--syntax-key', '--syntax-string', '--syntax-number', '--syntax-boolean', '--syntax-null'];

/** Every token a `color:` declaration is allowed to resolve to. */
const TEXT_TOKENS = [
    '--text-primary', '--text-secondary', '--text-tertiary',
    ...SEMANTIC.map(n => `--color-${n}-text`),
    ...SYNTAX_TOKENS,
];

/**
 * Everything outside the theme layer that may name a colour: the component
 * stylesheets, and the JavaScript that carries stylesheets of its own. Roughly a
 * fifth of this interface's colour declarations live in template literals inside
 * .js — a sweep of css/ alone reports a clean bill on a file it never opened.
 */
const COMPONENTS = [
    ...filesUnder('css', /\.css$/).filter(f => !f.startsWith(path.join('css', 'themes'))),
    ...appSources().filter(f => f.endsWith('.js')),
].map(f => path.join(ROOT, f));

/**
 * Strip comments so prose naming a forbidden pattern does not read as one.
 * @param {string} css
 * @returns {string}
 */
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Relative luminance of an sRGB hex colour, per WCAG 2.
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
    const h = hex.trim().replace('#', '');
    const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * Contrast ratio between two hex colours.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * CSS specificity of a simple selector, as [ids, classes, types].
 * @param {string} selector
 * @returns {number[]}
 */
function specificity(selector) {
    const ids = (selector.match(/#[\w-]+/g) || []).length;
    const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
    const types = (selector.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return [ids, classes, types];
}

/**
 * Lexicographic comparison of [ids, classes, types, sourceOrder]: specificity
 * first, source order only as the tie-break, exactly as the cascade does it.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {boolean} true when a wins
 */
function outranks(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return true;
}

/**
 * Hex tokens a theme resolves in one mode, on <body> — the element every
 * component reads them from.
 *
 * Order alone is not the answer, and getting this wrong is easy: reading
 * themes.css then the theme file lets the theme's LIGHT block overwrite the
 * shared body.dark-mode defaults, and the check then measures Slate's amber as
 * #F59E0B when the page paints #FBBF24. Specificity decides first — a theme's
 * `[data-theme="X"].dark-mode` is (0,2,0) against the shared block's (0,1,1) —
 * and source order only breaks ties.
 *
 * @param {string} theme
 * @param {"light"|"dark"} mode
 * @param {string} [values] - Pattern of the values kept: hex colours by default; the
 *   tints are written `rgb(r g b / alpha)`.
 * @returns {Record<string,string>}
 */
function resolve(theme, mode, values = '#[0-9a-fA-F]{6}') {
    const declaration = new RegExp(`(--[\\w-]+)\\s*:\\s*(${values})\\s*;`, 'g');
    const best = {};
    let order = 0;
    for (const file of ['themes.css', path.join('themes', `${theme}.css`)]) {
        let css = strip(fs.readFileSync(path.join(CSS_ROOT, file), 'utf8'));
        css = css.replace(/@media[^{]*\{[^{}]*\}/g, '');   // nested at-rules aside
        for (const [, selectorList, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            order += 1;
            for (const selector of selectorList.split(',').map(x => x.trim())) {
                const isDark = selector.includes('dark-mode');
                if (isDark && mode === 'light') continue;
                const scoped = selector.includes(':root') || isDark
                    || selector.includes(`[data-theme="${theme}"]`);
                if (!scoped) continue;
                // A rule naming another theme never applies here.
                const named = [...selector.matchAll(/\[data-theme="(\w+)"\]/g)].map(x => x[1]);
                if (named.length && !named.includes(theme)) continue;

                const weight = [...specificity(selector), order];
                for (const [, k, v] of body.matchAll(declaration)) {
                    const prev = best[k];
                    if (!prev || outranks(weight, prev.weight)) best[k] = { weight, value: v };
                }
            }
        }
    }
    return Object.fromEntries(Object.entries(best).map(([k, x]) => [k, x.value]));
}

describe('colours — every text token clears the floor (règle 8)', () => {
    for (const theme of THEMES) {
        for (const mode of ['light', 'dark']) {
            it(`${theme} ${mode}`, () => {
                const tokens = resolve(theme, mode);
                const grounds = ['--bg-primary', '--bg-secondary', '--bg-tertiary']
                    .map(k => tokens[k]).filter(Boolean);
                expect(grounds.length, 'aucun fond résolu').toBeGreaterThan(0);

                const failing = [];
                for (const token of TEXT_TOKENS) {
                    const value = tokens[token];
                    if (!value) continue;
                    const worst = Math.min(...grounds.map(g => contrast(value, g)));
                    if (worst < 4.5) failing.push(`${token}=${value} ${worst.toFixed(2)}:1`);
                }
                expect(failing, `sous 4,5:1 : ${failing.join(' · ')}`).toEqual([]);
            });
        }
    }

    it('gives every semantic role a text-safe variant in every theme', () => {
        for (const theme of THEMES) {
            for (const mode of ['light', 'dark']) {
                const tokens = resolve(theme, mode);
                for (const n of SEMANTIC) {
                    expect(tokens[`--color-${n}-text`],
                        `${theme} ${mode} : --color-${n}-text manquant`).toBeDefined();
                }
            }
        }
    });
});

/**
 * A tint laid over an opaque ground, as the browser composites it.
 * @param {string} tint - `rgb(r g b / alpha)`, as the --color-*-bg tokens write it.
 * @param {string} ground - Hex colour.
 * @returns {string} The hex colour seen.
 */
function over(tint, ground) {
    // Read strictly: a shape this does not know (no alpha, a percentage, a hex tint)
    // would come out NaN, and NaN < 4.5 is false — the check would pass on anything.
    const m = tint.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*[/,]\s*([\d.]+)(%?)\s*\)$/);
    if (!m || !/^#[0-9a-fA-F]{6}$/.test(ground)) {
        throw new Error(`cannot lay ${tint} over ${ground}`);
    }
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    const alpha = Number(m[4]) / (m[5] ? 100 : 1);
    const under = [0, 2, 4].map(i => parseInt(ground.slice(1 + i, 3 + i), 16));
    return '#' + [r, g, b].map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha))
        .toString(16).padStart(2, '0')).join('');
}

describe('colours — text on its own tint, as a tag sits on a card (règle 8)', () => {
    // A tag is a semantic colour's tint with its text on top: CRITICAL, FAILED, RUNNING.
    // The -text tokens cleared 4.5:1 on the page's grounds, some by a hair, and the tint
    // under them took the red of FAILED to 4.1:1 in Slate and 4.3:1 in Minimal
    // (measured in Chromium, 2026-10-05). The cards are drawn on --bg-secondary.
    for (const theme of THEMES) {
        for (const mode of ['light', 'dark']) {
            it(`${theme} ${mode}`, () => {
                const tokens = resolve(theme, mode, '#[0-9a-fA-F]{6}|rgba?\\([^)]*\\)');
                const card = tokens['--bg-secondary'];
                const failing = [];
                for (const n of SEMANTIC) {
                    const text = tokens[`--color-${n}-text`];
                    const tint = tokens[`--color-${n}-bg`];
                    expect(tint, `${theme} ${mode} : --color-${n}-bg manquant`).toBeDefined();
                    const ratio = contrast(text, over(tint, card));
                    if (ratio < 4.5) failing.push(`--color-${n}-text=${text} ${ratio.toFixed(2)}:1`);
                }
                expect(failing, `sous 4,5:1 sur la teinte : ${failing.join(' · ')}`).toEqual([]);
            });
        }
    }
});

describe('colours — a grey tag shows its box and reads, on every ground (règle 8)', () => {
    // A tag without a colour of its own took --bg-tertiary, opaque: on the cards drawn in
    // that same grey — the guided configuration's — it had no box at all (review,
    // 2026-10-05). Its tint is translucent now, like the semantic ones, and has to show,
    // and carry --text-secondary, on each of the three grounds.
    for (const theme of THEMES) {
        for (const mode of ['light', 'dark']) {
            it(`${theme} ${mode}`, () => {
                const tokens = resolve(theme, mode, '#[0-9a-fA-F]{6}|rgba?\\([^)]*\\)');
                const tint = tokens['--color-neutral-bg'];
                expect(tint, `${theme} ${mode}: --color-neutral-bg missing`).toBeDefined();
                const failing = [];
                for (const ground of ['--bg-primary', '--bg-secondary', '--bg-tertiary']) {
                    const box = over(tint, tokens[ground]);
                    const shows = contrast(box, tokens[ground]);
                    const reads = contrast(tokens['--text-secondary'], box);
                    if (shows < 1.1) failing.push(`${ground}: box ${shows.toFixed(2)}`);
                    if (reads < 4.5) failing.push(`${ground}: text ${reads.toFixed(2)}:1`);
                }
                expect(failing, failing.join(' · ')).toEqual([]);
            });
        }
    }
});

/** Fills that carry text, and the token that writes on each. */
const ON_FILL = [
    ['--color-error', '--text-on-error'],
    ['--color-warning', '--text-on-warning'],
    ['--accent-primary', '--text-on-accent'],
];

describe('colours — text on a fill, not on the page', () => {
    for (const theme of THEMES) {
        for (const mode of ['light', 'dark']) {
            it(`${theme} ${mode}`, () => {
                const tokens = resolve(theme, mode);
                const failing = [];
                for (const [fill, ink] of ON_FILL) {
                    expect(tokens[ink], `${theme} ${mode} : ${ink} manquant`).toBeDefined();
                    const ratio = contrast(tokens[ink], tokens[fill]);
                    // 4.4 rather than 4.5: on the indigo two themes use as their
                    // accent, white reaches 4.47 and nothing reads better. Raising
                    // it means changing the accent, which is a design decision and
                    // not this test's to force.
                    if (ratio < 4.4) failing.push(`${ink} on ${fill} ${ratio.toFixed(2)}:1`);
                }
                expect(failing, `sous le seuil : ${failing.join(' · ')}`).toEqual([]);
            });
        }
    }
});

describe("colours — the browser's own controls take the theme's", () => {
    // Left unset, every native check box and radio button the app does not draw
    // itself took the browser's blue — a colour found nowhere else in AG (the
    // network test's choice of tool, the install dialogs). One declaration on body,
    // inherited by all of them.

    it('gives the controls the text colour, from body', () => {
        const base = strip(fs.readFileSync(path.join(CSS_ROOT, 'base.css'), 'utf8'));
        const body = base.match(/(?:^|\n)body\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(body).toMatch(/accent-color:\s*var\(--text-primary\)/);
    });

    it('draws them in the palette in force — light, and dark under .dark-mode', () => {
        // Without color-scheme the browser drew them light in the dark palette: an
        // unchecked box was a white square, a checked one white with a dark tick.
        const base = strip(fs.readFileSync(path.join(CSS_ROOT, 'base.css'), 'utf8'));
        const html = base.match(/(?:^|\n)html\s*\{([^}]*)\}/)?.[1] ?? '';
        const dark = base.match(/(?:^|\n)html\.dark-mode\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(html).toMatch(/color-scheme:\s*light/);
        expect(dark).toMatch(/color-scheme:\s*dark/);
        // theme-boot.js stamps the class on that element before the first paint.
        const boot = fs.readFileSync(path.join(ROOT, 'public', 'theme-boot.js'), 'utf8');
        expect(boot).toMatch(/document\.documentElement[\s\S]*classList\.toggle\('dark-mode'/);
    });

    it('lets no component set a colour of its own on them', () => {
        // A second accent-color is a control that disagrees with the rest — the
        // one that existed (a restart check box) is now covered by body's.
        const offenders = COMPONENTS
            .filter((f) => path.basename(f) !== 'base.css')
            .filter((f) => /accent-color\s*:/.test(strip(fs.readFileSync(f, 'utf8'))))
            .map((f) => path.relative(ROOT, f));
        expect(offenders).toEqual([]);
    });
});

describe('colours — components read roles, never values (règle 6)', () => {
    it('declares no colour literal as a var() fallback', () => {
        // `var(--x, #hex)` renders the literal when --x resolves nowhere, so a
        // token that never existed looks like one that works. Two were found
        // that way: --error-color and --surface-secondary, the second painting
        // a light square into every dark theme.
        //
        // Only colour literals are forbidden. A fallback on a property a script
        // sets per element — var(--delay-index, 0) — is the correct idiom, and a
        // fallback to another token marks a token a theme may opt out of.
        const LITERAL = /^\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/;
        const offenders = [];
        for (const file of COMPONENTS) {
            const css = strip(fs.readFileSync(file, 'utf8'));
            for (const [, token, fallback] of css.matchAll(/var\(\s*(--[\w-]+)\s*,\s*([^)]+)\)/g)) {
                if (!LITERAL.test(fallback)) continue;
                offenders.push(`${path.relative(ROOT, file)} — var(${token}, ${fallback.trim()})`);
            }
        }
        expect(offenders, `couleurs en repli :\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('keeps the base semantic tokens out of JavaScript, whatever route they take', () => {
        // The `color:` sweep only sees what is written in the declaration. Two
        // usages hid behind a local — `let bufferColor = 'var(--color-error)'`,
        // then `color: ${bufferColor}` — and read as clean.
        //
        // So in JavaScript the base tokens are refused outright, and a graphics
        // use has to say so on the same line: a stroke, a fill, a background or a
        // border. That is the discipline the CSS files already keep by writing
        // the property name next to the value.
        // A curve, a plate, an outline: the graphic uses of a semantic colour.
        // `metric`/`chart` cover the sparkline components, whose `color`
        // attribute names the line — see the backlog note on ag-metric-detail,
        // which also paints its value label with it.
        const GRAPHICS = /stroke|fill|background|border|shadow|outline|chart|metric|sparkline/i;
        const DECLARES = /\b(?:const|let|var)\s+\w+\s*=/;
        const offenders = [];
        for (const file of COMPONENTS) {
            if (!file.endsWith('.js')) continue;
            const lines = strip(fs.readFileSync(file, 'utf8'))
                .replace(/^\s*\/\/.*$/gm, '').split('\n');
            for (const [i, line] of lines.entries()) {
                for (const n of SEMANTIC) {
                    if (!line.includes(`var(--color-${n})`)) continue;
                    if (GRAPHICS.test(line)) continue;
                    // The intent may sit on the statement that opens the block —
                    // `const connectorStrokes = {` above a table of entries. Walk
                    // up to the nearest declaration rather than guessing a window
                    // size: a table can be any length.
                    let owner = '';
                    for (let k = i; k >= 0 && i - k < 40; k--) {
                        if (DECLARES.test(lines[k])) { owner = lines[k]; break; }
                    }
                    if (GRAPHICS.test(owner)) continue;
                    offenders.push(`${path.relative(ROOT, file)} — ${line.trim().slice(0, 64)}`);
                }
            }
        }
        expect(offenders, `jeton de base en JavaScript :\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('explains every text colour still written as a value', () => {
        // Eleven remain, and all eleven are legitimate: white on the black scrim
        // laid over album art, the splash screen that paints before a theme
        // exists, the reboot overlay, and print. What they have in common is a
        // ground no palette describes — an arbitrary image, or paper.
        //
        // The guidelines allow that, on one condition: say why, in a comment. So
        // the rule enforced here is not "no literals" but "no unexplained
        // literal" — a new one appears the day someone writes it without a
        // reason, which is exactly the day it should be questioned.
        const offenders = [];
        for (const file of COMPONENTS) {
            if (!file.endsWith('.css')) continue;
            const raw = fs.readFileSync(file, 'utf8');
            for (const m of raw.matchAll(/(?<![-\w])color\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) {
                // A comment anywhere in the 600 characters above it counts as the
                // explanation: the rule block's own header, or the group's.
                // The marker has to be explicit. Requiring merely "a comment
                // nearby" passes on almost every rule in the codebase — verified
                // by putting a literal back and watching the guard shrug.
                const before = raw.slice(Math.max(0, m.index - 600), m.index);
                if (/rule 6 exception/.test(before)) continue;
                const line = raw.slice(0, m.index).split('\n').length;
                offenders.push(`${path.relative(ROOT, file)}:${line} — ${m[1]}`);
            }
        }
        expect(offenders, `valeurs sans explication :\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('fades nothing that is read at rest', () => {
        // Three fades took text under the 4.5:1 floor, measured on the pixels
        // (2026-10-04): a stopped service's card at 70 % (2.8–3.5:1) — a service at
        // rest, not a disabled one —, the date under a config file (2.87:1) and the
        // PERSIST label of a user card (3.44:1). Dimming is for what cannot be used.
        // Two more once tags became tints (computed from the tokens, 2026-10-05): the
        // number of backups at 70 % (3.1–4.4:1 in every mode) and the card of a package
        // that is not installed at 90 % — one INSTALL away — whose badge saying why it
        // cannot be installed fell to 4.3:1.
        const tile = fs.readFileSync(path.join(CSS_ROOT, 'components', 'tile.css'), 'utf8');
        expect(tile).not.toMatch(/\.service-tile\.stopped\s*\{[^}]*opacity/);
        const config = fs.readFileSync(path.join(CSS_ROOT, 'config.css'), 'utf8');
        expect(config.match(/\.config-file-mtime\s*\{([^}]*)\}/)[1]).not.toMatch(/opacity/);
        expect(strip(config)).not.toMatch(/\.config-backup-badge\s*\{[^}]*opacity/);
        const software = fs.readFileSync(path.join(CSS_ROOT, 'audio-software.css'), 'utf8');
        expect(software.match(/\.software-card\.not-installed\s*\{([^}]*)\}/)[1]).not.toMatch(/opacity/);
        const card = fs.readFileSync(path.join(ROOT, 'js', 'components', 'molecules', 'ag-user-card.js'), 'utf8');
        const persist = card.match(/<span[^>]*>PERSIST<\/span>/)[0];
        expect(persist).not.toMatch(/opacity/);
    });

    it('paints text with a text-safe token, never a base semantic one', () => {
        // The base colours are chosen for borders and fills; as text they sit
        // between 1.7:1 and 3.8:1 depending on the theme.
        const offenders = [];
        for (const file of COMPONENTS) {
            const css = strip(fs.readFileSync(file, 'utf8'));
            // The window runs to the next `;` rather than stopping at a brace:
            // half of these declarations are inside template literals, where the
            // value is an interpolation — `color: ${x ? 'var(--color-error)' : …}`
            // — and a pattern that stops at `{` cannot see past the `${`.
            for (const [, role] of css.matchAll(
                /(?<![-\w])color\s*:[^;]{0,200}?var\(--color-(success|error|warning|info)\)/g,
            )) {
                offenders.push(`${path.relative(ROOT, file)} — color: var(--color-${role})`);
            }
        }
        expect(offenders, `texte sur un jeton de base :\n  ${offenders.join('\n  ')}`).toEqual([]);
    });
});
