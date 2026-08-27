/**
 * Guards the login page against the four faults the UI guidelines exist to
 * prevent — rules 6, 8, 15 and 16 of audiogravity.design/UI_GUIDELINES.md,
 * which lives in the design repo, not this one. All four were present at once,
 * and none is visible by looking at the page on a good screen:
 *
 *   - three tokens the stylesheet asked for were defined nowhere. A CSS custom
 *     property that does not resolve does not warn; it either falls back to a
 *     hard-coded literal written beside it, or drops the declaration entirely.
 *     `--error-color` did the former (a red at 4.13:1), `--border-radius-md`
 *     the latter (a key box with square corners nobody asked for);
 *   - --text-tertiary is #888888 in the minimal theme this page runs under,
 *     which is 3.54:1 on white — under the floor, on eight declarations;
 *   - colours were written as literals inside the component;
 *   - a sentence sat on the 11px step reserved for uppercase labels.
 *
 * Contrast is computed here rather than trusted, so a token whose value drifts
 * fails the suite instead of quietly dimming the page.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_ROOT = path.join(ROOT, 'css');

/**
 * Drop CSS comments. Every check below reads declarations, and the comments in
 * these files quote the very anti-patterns being forbidden — a comment naming
 * `var(--error-color, …)` as the fault would otherwise fail the rule against it.
 * @param {string} css
 * @returns {string} the stylesheet with comment bodies removed
 */
function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const LOGIN_CSS = stripComments(fs.readFileSync(path.join(CSS_ROOT, 'login.css'), 'utf8'));

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

/** The selectable themes. A token is only safe if all of them define it. */
const THEME_FILES = ['minimal', 'slate', 'gravity']
    .map(name => path.join(CSS_ROOT, 'themes', `${name}.css`));

/**
 * Custom properties declared by a stylesheet.
 * @param {string} file absolute path
 * @returns {Set<string>}
 */
function declaredIn(file) {
    return new Set(
        [...fs.readFileSync(file, 'utf8').matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]),
    );
}

/**
 * Tokens declared outside the theme files — themes.css :root, component sheets.
 * These apply whatever theme is active.
 */
const GLOBAL_DEFINED = new Set(
    listCss(CSS_ROOT)
        .filter(f => !THEME_FILES.includes(f))
        .flatMap(f => [...declaredIn(f)]),
);

/** name → the set of tokens that theme declares. */
const THEME_DEFINED = new Map(
    THEME_FILES.map(f => [path.basename(f, '.css'), declaredIn(f)]),
);

/**
 * Themes under which a token would not resolve.
 *
 * Global presence is not enough: --status-error is declared by two themes out of
 * three, so a union across all stylesheets reports it as defined while Gravity
 * renders the rule without it.
 * @param {string} token
 * @returns {string[]} names of themes missing it, empty if safe everywhere
 */
function unresolvedUnder(token) {
    if (GLOBAL_DEFINED.has(token)) return [];
    return [...THEME_DEFINED.entries()]
        .filter(([, defined]) => !defined.has(token))
        .map(([name]) => name);
}

/**
 * Relative luminance of an sRGB hex colour, per WCAG 2.
 * @param {string} hex e.g. "#5C6675"
 * @returns {number}
 */
function luminance(hex) {
    const h = hex.replace('#', '');
    const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * Contrast ratio between two hex colours.
 * @param {string} a
 * @param {string} b
 * @returns {number} between 1 and 21
 */
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Read a token's hex value out of a specific rule block.
 * @param {string} css Stylesheet source.
 * @param {string} selector Rule the token is declared in.
 * @param {string} token Custom property name.
 * @returns {string|null} hex value, or null if not declared there
 */
function tokenIn(css, selector, token) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = css.match(new RegExp(`${escaped}[^{]*\\{([\\s\\S]*?)\\n\\}`));
    if (!block) return null;
    const decl = block[1].match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
    return decl ? decl[1] : null;
}

const MINIMAL_CSS = fs.readFileSync(path.join(CSS_ROOT, 'themes', 'minimal.css'), 'utf8');

/** The two grounds the login card and page paint, light mode and dark. */
const GROUNDS = [
    { mode: 'clair', selector: '[data-theme="minimal"]' },
    { mode: 'sombre', selector: '[data-theme="minimal"].dark-mode' },
];

describe('login page — no phantom tokens (règle 6)', () => {
    it('every custom property it reads resolves under every theme', () => {
        const used = new Set([...LOGIN_CSS.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
        const broken = [...used]
            .map(token => ({ token, missing: unresolvedUnder(token) }))
            .filter(({ missing }) => missing.length > 0)
            .map(({ token, missing }) => `${token} (absent de : ${missing.join(', ')})`);
        expect(broken, `jetons qui ne résolvent pas :\n  ${broken.join('\n  ')}`).toEqual([]);
    });

    it('writes no colour literal of its own', () => {
        // Alpha notation inside a token's own definition is fine; a literal in a
        // component is the thing that breaks a theme.
        const literals = [...LOGIN_CSS.matchAll(/:\s*[^;{]*?(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)]
            .map(m => m[1]);
        expect(literals, `couleurs en dur : ${literals.join(', ')}`).toEqual([]);
    });

    it('declares no fallback value inside var()', () => {
        // `var(--x, #hex)` hides a missing token behind a literal — exactly how
        // --error-color went unnoticed.
        const fallbacks = [...LOGIN_CSS.matchAll(/var\(--[\w-]+\s*,\s*([^)]+)\)/g)].map(m => m[1]);
        expect(fallbacks, `replis en dur : ${fallbacks.join(', ')}`).toEqual([]);
    });
});

describe('login page — contrast floor (règle 8)', () => {
    it('never paints text with --text-tertiary', () => {
        // #888888 on white is 3.54:1. The role, not the value, is the mistake:
        // tertiary is for decoration, and this page was reading it.
        expect(LOGIN_CSS).not.toMatch(/color:\s*var\(--text-tertiary\)/);
    });

    for (const { mode, selector } of GROUNDS) {
        it(`--text-secondary clears 4.5:1 in minimal ${mode}`, () => {
            const ink = tokenIn(MINIMAL_CSS, selector, '--text-secondary')
                ?? tokenIn(MINIMAL_CSS, '[data-theme="minimal"]', '--text-secondary');
            const ground = tokenIn(MINIMAL_CSS, selector, '--bg-secondary')
                ?? tokenIn(MINIMAL_CSS, '[data-theme="minimal"]', '--bg-secondary');
            expect(ink, 'token introuvable').not.toBeNull();
            expect(ground, 'fond introuvable').not.toBeNull();
            expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
        });
    }

    it('states the error in --text-primary, not in the red', () => {
        // The red stays on the border and the tinted ground, where it only owes
        // 3:1. Both error displays follow the same rule.
        const errorBlocks = [...LOGIN_CSS.matchAll(/\.(?:error-message|auto-passkey-error)\s*\{([\s\S]*?)\n\}/g)];
        expect(errorBlocks.length).toBe(2);
        for (const [, body] of errorBlocks) {
            expect(body).toMatch(/color:\s*var\(--text-primary\)/);
            expect(body).toMatch(/border:\s*1px solid var\(--color-error\)/);
            expect(body).toMatch(/background:\s*var\(--color-error-bg\)/);
        }
    });
});

describe('login page — scale discipline (règles 15 et 16)', () => {
    it('writes no arbitrary padding or margin', () => {
        const spacing = [...LOGIN_CSS.matchAll(/^\s*(?:padding|margin|gap)[^:]*:\s*([^;]+);/gm)]
            .map(m => m[1].trim())
            .filter(v => /\d+px/.test(v));
        expect(spacing, `espacements hors échelle : ${spacing.join(' | ')}`).toEqual([]);
    });

    it('keeps the 11px step for uppercase labels only', () => {
        // Rule 16 reserves --font-size-xs for short uppercase labels. Any block
        // that sets it must also transform its text to uppercase.
        const offenders = [];
        for (const [, selector, body] of LOGIN_CSS.matchAll(/([^{}]+)\{([^}]*font-size:\s*var\(--font-size-xs\)[^}]*)\}/g)) {
            if (!/text-transform:\s*uppercase/.test(body)) offenders.push(selector.trim().split('\n').pop());
        }
        expect(offenders, `11px sur du texte lu : ${offenders.join(', ')}`).toEqual([]);
    });
});

describe('login page — a button handed back must still work', () => {
    // The auto-passkey panel is what a passkey-registered phone sees first, and its retry button
    // was dead: the listener was registered with `{ once: true }` while the failure path set
    // `disabled = false`, so the page invited a second attempt it had already made impossible.
    // Nothing on screen said so — the button looked exactly as it had the first time — and only a
    // reload brought it back. Reading the source is the only way to catch this: the fault is the
    // *combination* of two lines forty apart, and neither is wrong on its own.
    const LOGIN_JS = fs.readFileSync(path.join(ROOT, 'js', 'login.js'), 'utf8');

    /**
     * Blank out string literals and comments, keeping every offset intact.
     *
     * The paren scanner below counts brackets, and a `)` inside a message — `'Try again :)'` — or
     * inside a comment would close the slice early. That failure is silent and it disarms the
     * guard: a truncated slice contains neither the `once` nor the re-enable, so the check passes
     * on nothing at all. Blanking rather than deleting keeps indices usable.
     *
     * @param {string} src - JavaScript source.
     * @returns {string} Same length, with literal and comment contents replaced by spaces.
     */
    function blankLiteralsAndComments(src) {
        let out = '';
        let i = 0;
        while (i < src.length) {
            const two = src.slice(i, i + 2);
            if (two === '//' || two === '/*') {
                const close = two === '//' ? src.indexOf('\n', i) : src.indexOf('*/', i + 2);
                const stop = close === -1 ? src.length : (two === '//' ? close : close + 2);
                out += ' '.repeat(stop - i);
                i = stop;
                continue;
            }
            const quote = src[i];
            if (quote === '"' || quote === "'" || quote === '`') {
                out += ' ';
                i++;
                while (i < src.length && src[i] !== quote) {
                    if (src[i] === '\\') { out += '  '; i += 2; continue; }
                    out += src[i] === '\n' ? '\n' : ' ';
                    i++;
                }
                out += ' ';
                i++;
                continue;
            }
            out += src[i];
            i++;
        }
        return out;
    }

    const SOURCE = blankLiteralsAndComments(LOGIN_JS);

    /**
     * The whole `addEventListener` call for one element, options object included.
     *
     * @param {string} element - Left-hand side, e.g. `elements.autoPasskeyTrigger`.
     * @returns {string} Source of the call, from the opening to the matching close.
     */
    function listenerCall(element) {
        const start = SOURCE.indexOf(`${element}.addEventListener(`);
        expect(start, `${element}.addEventListener introuvable`).toBeGreaterThan(-1);
        let depth = 0;
        for (let i = SOURCE.indexOf('(', start); i < SOURCE.length; i++) {
            if (SOURCE[i] === '(') depth++;
            else if (SOURCE[i] === ')' && --depth === 0) return SOURCE.slice(start, i + 1);
        }
        throw new Error(`parenthèse non fermée pour ${element}`);
    }

    it('hands the auto-passkey trigger back to the user after a failure', () => {
        // The premise the next test rests on, asserted on its own so that a slice gone wrong
        // fails here — loudly — instead of letting the guard below pass over an empty string.
        expect(listenerCall('elements.autoPasskeyTrigger'))
            .toMatch(/elements\.autoPasskeyTrigger\.disabled\s*=\s*false/);
    });

    it('does not arm that trigger with { once: true }', () => {
        expect(
            /once:\s*true/.test(listenerCall('elements.autoPasskeyTrigger')),
            "le gestionnaire réactive son propre bouton alors que { once: true } a déjà retiré "
            + "l'écouteur : le clic suivant ne fait rien jusqu'au rechargement"
        ).toBe(false);
    });

    it('still guards against a double submit while the attempt runs', () => {
        // Dropping `once` is only safe because this line is there. If it goes, `once` was doing
        // work after all and this suite must be revisited rather than deleted.
        expect(listenerCall('elements.autoPasskeyTrigger'))
            .toMatch(/elements\.autoPasskeyTrigger\.disabled\s*=\s*true/);
    });
});
