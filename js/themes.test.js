/**
 * The theme layer's structural contract.
 *
 * A theme must be a theme and nothing else. slate.css used to be two things at
 * once: a palette a user can pick, and the defaults every other theme silently
 * inherited — its light block opened on `:root, [data-theme="slate"]` and its
 * dark block on a bare `body.dark-mode`, neither of which is scoped to slate.
 * Gravity ended up depending on forty-two of its tokens and declaring none of
 * them, so editing slate changed screens under Gravity, and a contributor
 * working on "their" theme had no way to know.
 *
 * Nothing about that is visible: every value resolved, and resolved correctly.
 * It only surfaces when someone edits one theme and another one moves. Hence a
 * test rather than a convention.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_ROOT = path.join(ROOT, 'css');

/** Every selectable theme, as js/core/config.js registers them. */
const THEMES = ['minimal', 'slate', 'gravity'];

/**
 * Read a stylesheet with its comments removed.
 * @param {...string} p path segments below the repo root
 * @returns {string}
 */
function read(...p) {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Custom properties a stylesheet declares.
 * @param {string} css
 * @returns {Set<string>}
 */
function declared(css) {
    return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
}

/**
 * Selectors a stylesheet opens its rules with, one entry per comma-separated part.
 * @param {string} css
 * @returns {string[]}
 */
function selectors(css) {
    return [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
        .flatMap(m => m[2].split(',').map(s => s.trim()))
        .filter(Boolean);
}

const THEME_CSS = Object.fromEntries(THEMES.map(t => [t, read('css', 'themes', `${t}.css`)]));
const DEFAULTS = declared(read('css', 'themes.css'));

describe('theme layer — every theme is scoped to itself', () => {
    for (const theme of THEMES) {
        it(`${theme}.css writes only under its own selector`, () => {
            const stray = selectors(THEME_CSS[theme]).filter(
                sel => !sel.includes(`[data-theme="${theme}"]`),
            );
            expect(stray, `sélecteurs non cadrés : ${stray.join(' | ')}`).toEqual([]);
        });
    }
});

describe('theme layer — a palette applies before any script runs', () => {
    // No :root rule declares a colour: every palette belongs to its theme, which
    // is the point of the scoping above. The cost is that an <html> matching no
    // theme has no palette at all — html{background:var(--bg-primary)} and
    // body{color:var(--text-primary)} are invalid at computed-value time, so the
    // page renders unstyled until the main bundle evaluates and stamps the
    // attribute. On a dark-theme install that is a white flash on every cold
    // load, and a permanent one if the bundle fails.
    for (const page of ['index.html', 'login.html']) {
        it(`${page} stamps data-theme in the markup`, () => {
            const html = fs.readFileSync(path.join(ROOT, page), 'utf8')
                .replace(/<!--[\s\S]*?-->/g, '');
            const tag = html.match(/<html\b[^>]*>/);
            expect(tag, 'aucune balise <html>').not.toBeNull();
            const theme = tag[0].match(/data-theme="(\w+)"/);
            expect(theme, `<html> sans data-theme : ${tag[0]}`).not.toBeNull();
            expect(THEMES).toContain(theme[1]);
        });
    }

    it('leaves no colour on :root for a page to fall back to', () => {
        // Stated as a fact the guard above depends on: if a default palette ever
        // returns to :root, the markup requirement can be relaxed — but then this
        // test is the place that says so.
        const root = read('css', 'themes.css').match(/:root\s*\{([\s\S]*?)\n\}/);
        expect(root).not.toBeNull();
        for (const token of ['--bg-primary', '--text-primary', '--border-color']) {
            expect(root[1], `${token} est revenu sur :root`).not.toContain(`${token}:`);
        }
    });
});

describe('theme layer — no theme depends on another', () => {
    for (const theme of THEMES) {
        it(`${theme} resolves every token without help from a sibling theme`, () => {
            // A token a sibling declares, this theme does not, and no default
            // covers, is a token this theme silently borrows — or loses the day
            // the sibling stops declaring it.
            const siblings = THEMES.filter(t => t !== theme)
                .reduce((acc, t) => new Set([...acc, ...declared(THEME_CSS[t])]), new Set());
            const own = declared(THEME_CSS[theme]);
            const borrowed = [...siblings].filter(t => !own.has(t) && !DEFAULTS.has(t));

            // A token read only as `var(--x, fallback)` is an opt-in a theme may
            // legitimately leave undeclared — --topbar-blur works that way.
            const optional = borrowed.filter(t => {
                const uses = [];
                const walk = dir => {
                    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                        const f = path.join(dir, e.name);
                        if (e.isDirectory()) walk(f);
                        else if (f.endsWith('.css')) uses.push(fs.readFileSync(f, 'utf8'));
                    }
                };
                walk(CSS_ROOT);
                const all = uses.join('\n');
                const withFallback = new RegExp(`var\\(\\s*${t}\\s*,`, 'g');
                const bare = new RegExp(`var\\(\\s*${t}\\s*\\)`, 'g');
                return !bare.test(all) && withFallback.test(all);
            });

            const hard = borrowed.filter(t => !optional.includes(t));
            expect(hard, `emprunts à un autre thème : ${hard.join(', ')}`).toEqual([]);
        });
    }
});
