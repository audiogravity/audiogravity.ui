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
import * as acorn from 'acorn';

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

/* The sign-in screen's own styling, in the files that actually hold it.
 *
 * This used to read css/login.css alone, and that was the whole scope of every check
 * below. When the app icon's rules were lifted out into components/app-icon.css — shared
 * with the footer — they left this suite's sight without a word: a colour literal or a
 * `var(--x, fallback)` added there would have failed yesterday and passed today, on the
 * very screen these tests were written to protect. A file that styles the sign-in card
 * belongs here whatever directory it lives in. */
const LOGIN_CSS = ['login.css', 'components/app-icon.css', 'components/wordmark.css']
    .map(f => stripComments(fs.readFileSync(path.join(CSS_ROOT, f), 'utf8')))
    .join('\n');

/* components/theme-toggle.css is deliberately NOT in that list, and the omission was
   measured rather than assumed: adding it fails the --text-tertiary case below. That
   token is refused here because 3.54:1 is under the 4.5:1 text owes a reader — but the
   toggle paints a GLYPH with it, and a non-text graphic owes 3:1, which it clears. The
   guard reads declarations, not what they colour, so including that file would report a
   contrast fault where there is none. Named here so the next reader does not "fix" the
   gap by adding the file, nor the button by moving it off a token that suits it. */

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
    //
    // Read with a real parser. A hand-written bracket counter came first, and it could be
    // disarmed by a stray `)` in a string or a comment: the slice truncated, the guard saw
    // neither the `once` nor the re-enable, and passed on nothing at all.
    const LOGIN_JS = fs.readFileSync(path.join(ROOT, 'js', 'login.js'), 'utf8');
    const AST = acorn.parse(LOGIN_JS, { ecmaVersion: 'latest', sourceType: 'module' });

    /**
     * Every node in the tree, depth first.
     * @param {object} node - An ESTree node.
     * @param {(n: object) => void} visit - Called once per node.
     */
    function walk(node, visit) {
        if (!node || typeof node.type !== 'string') return;
        visit(node);
        for (const key of Object.keys(node)) {
            const child = node[key];
            if (Array.isArray(child)) child.forEach(c => walk(c, visit));
            else if (child && typeof child.type === 'string') walk(child, visit);
        }
    }

    /**
     * The `<element>.addEventListener(...)` call expression, as source text.
     * @param {string} element - Dotted receiver, e.g. `elements.autoPasskeyTrigger`.
     * @returns {string} The whole call, options object included.
     */
    function listenerCall(element) {
        const [obj, prop] = element.split('.');
        const found = [];
        walk(AST, n => {
            if (n.type !== 'CallExpression') return;
            const c = n.callee;
            if (c.type !== 'MemberExpression' || c.property.name !== 'addEventListener') return;
            const recv = c.object;
            if (recv.type === 'MemberExpression' && recv.object.name === obj && recv.property.name === prop) {
                found.push(LOGIN_JS.slice(n.start, n.end));
            }
        });
        expect(found, `${element}.addEventListener not found`).toHaveLength(1);
        return found[0];
    }

    it('hands the auto-passkey trigger back to the user after a failure', () => {
        // The premise the next test rests on, asserted on its own so that a lookup gone wrong
        // fails here — loudly — instead of letting the guard below pass over an empty string.
        expect(listenerCall('elements.autoPasskeyTrigger'))
            .toMatch(/elements\.autoPasskeyTrigger\.disabled\s*=\s*false/);
    });

    it('does not arm that trigger with { once: true }', () => {
        expect(
            /once:\s*true/.test(listenerCall('elements.autoPasskeyTrigger')),
            'the handler re-enables its own button after { once: true } has already removed the '
            + 'listener: the next click does nothing until the page is reloaded'
        ).toBe(false);
    });

    it('still guards against a double submit while the attempt runs', () => {
        // Dropping `once` is only safe because this line is there. If it goes, `once` was doing
        // work after all and this suite must be revisited rather than deleted.
        expect(listenerCall('elements.autoPasskeyTrigger'))
            .toMatch(/elements\.autoPasskeyTrigger\.disabled\s*=\s*true/);
    });
});
