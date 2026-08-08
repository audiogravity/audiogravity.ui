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
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_ROOT = path.join(ROOT, 'css');
const THEMES = ['minimal', 'slate', 'gravity'];

/** Semantic roles that exist in both a base and a text-safe form. */
const SEMANTIC = ['success', 'error', 'warning', 'info'];

/** Every token a `color:` declaration is allowed to resolve to. */
const TEXT_TOKENS = [
    '--text-primary', '--text-secondary', '--text-tertiary',
    ...SEMANTIC.map(n => `--color-${n}-text`),
];

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
 * Everything outside the theme layer that may name a colour: the component
 * stylesheets, and the JavaScript that carries stylesheets of its own. Roughly a
 * fifth of this interface's colour declarations live in template literals inside
 * .js — a sweep of css/ alone reports a clean bill on a file it never opened.
 */
const COMPONENTS = [
    ...listCss(CSS_ROOT).filter(f => !path.relative(ROOT, f).startsWith(path.join('css', 'themes'))),
    ...listJs(path.join(ROOT, 'js')),
];

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
 * Hex tokens a theme resolves in one mode: the shared defaults first, then the
 * theme's light block, then its dark block — the order main.css imports them.
 * @param {string} theme
 * @param {"light"|"dark"} mode
 * @returns {Record<string,string>}
 */
function resolve(theme, mode) {
    const out = {};
    for (const file of ['themes.css', path.join('themes', `${theme}.css`)]) {
        let css = strip(fs.readFileSync(path.join(CSS_ROOT, file), 'utf8'));
        css = css.replace(/@media[^{]*\{[^{}]*\}/g, '');   // nested at-rules aside
        for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const isDark = selector.includes('dark-mode');
            if (isDark && mode === 'light') continue;
            const scoped = selector.includes(':root') || isDark
                || selector.includes(`[data-theme="${theme}"]`);
            if (!scoped) continue;
            for (const [, k, v] of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
                out[k] = v;
            }
        }
    }
    return out;
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
