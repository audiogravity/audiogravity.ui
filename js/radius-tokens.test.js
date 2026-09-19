/**
 * Corner radii come from the theme, and the mini player's two badges are twins.
 *
 * Minimal moved from 0/0/0 to one 2px radius. Measured on every tab afterwards,
 * what did not follow was what never asked the theme: a fourth step (--radius-xs)
 * left at its :root default, and literals written into components — the top bar
 * chips, the player's artwork, the pipeline controls, the notifications. Those
 * now read an entry the theme can set, whose default is the literal it replaced,
 * so on them slate and gravity did not move.
 *
 * Not every conversion went that way, by decision: the offline banner's Retry
 * button and the help window's reference box read the theme's own steps
 * (--radius-sm, --radius-md) instead of an entry of their own. They follow each
 * theme's scale, so there slate (Retry 4 → 2px) and gravity (box 4 → 8px) did move.
 *
 * These cases read the stylesheets: a literal radius is visible in the source and
 * invisible to a unit test that mounts one component.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const THEMES = read('css', 'themes.css');
const MINIMAL = read('css', 'themes', 'minimal.css');

/** Value a stylesheet gives a custom property in its first declaration of it. */
function tokenValue(css, token) {
    const m = css.match(new RegExp(`${token}:\\s*([^;]+);`));
    return m && m[1].trim();
}

/**
 * Body of the first rule whose selector list has `selector` as one of its items —
 * the whole item, so `.toast` does not match `.toast-container`.
 */
function ruleBody(css, selector) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, sel, body] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (sel.split(',').map(s => s.trim()).includes(selector)) return body;
    }
    return null;
}

describe('the theme entries that replaced literal radii', () => {
    const ENTRIES = {
        '--radius-chip': '4px',
        '--radius-cover': '3px',
        '--radius-pipeline': '4px',
        '--radius-toast': '0px',
        '--radius-pull-tab': '6px',
        '--radius-queue-tip': '4px',
    };

    it('default to the literal each one replaced, so other themes keep their look', () => {
        for (const [token, literal] of Object.entries(ENTRIES)) {
            expect(tokenValue(THEMES, token), `${token} is not declared in themes.css`).toBe(literal);
        }
    });

    it('are the only radius the converted elements read', () => {
        const uses = [
            ['css/layout.css', '.topbar .metric-value.activity-high', '--radius-chip'],
            ['css/components/now-playing.css', '.np-cover--placeholder', '--radius-cover'],
            ['css/components/toast.css', '.toast', '--radius-toast'],
            ['css/components/library-queue.css', '.lib-queue-tip:focus-within::after', '--radius-queue-tip'],
        ];
        for (const [file, selector, token] of uses) {
            const body = ruleBody(read(file), selector);
            expect(body, `no rule for ${selector} in ${file}`).toBeTruthy();
            expect(body, `${selector} does not read ${token}`).toMatch(new RegExp(`border-radius:\\s*var\\(${token}\\)`));
        }
        const pipeline = read('js', 'components', 'organisms', 'ag-audio-pipeline.js');
        expect(pipeline.match(/border-radius:\s*var\(--radius-pipeline\)/g) ?? []).toHaveLength(3);
        expect(read('js', 'components', 'organisms', 'ag-pull-tab.js')).toMatch(/border-radius:var\(--radius-pull-tab\) var\(--radius-pull-tab\) 0 0/);
    });
});

describe('minimal: one 2px radius', () => {
    it('sets every step to 2px, the fourth included', () => {
        for (const token of ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg']) {
            expect(tokenValue(MINIMAL, token), `${token} in minimal.css`).toBe('2px');
        }
    });

    it('sets the converted elements and the badges to 2px', () => {
        for (const token of ['--radius-chip', '--radius-cover', '--radius-pipeline', '--radius-toast', '--radius-badge']) {
            expect(tokenValue(MINIMAL, token), `${token} in minimal.css`).toBe('2px');
        }
    });

    it('leaves the pull tab and the queue tip at their own radius', () => {
        expect(tokenValue(MINIMAL, '--radius-pull-tab')).toBeNull();
        expect(tokenValue(MINIMAL, '--radius-queue-tip')).toBeNull();
    });
});

describe("the mini player's origin badge is the output badge's twin", () => {
    const CONNECTOR = read('css', 'components', 'connector-badge.css');
    const NOW_PLAYING = read('css', 'components', 'now-playing.css');

    it('shares one rule with the output badge', () => {
        // Two copies of the same eight declarations drift; one selector list cannot.
        const body = ruleBody(CONNECTOR, '.np-source-row .ag-source-badge');
        expect(body, 'the origin badge is not in the connector badge rule').toBeTruthy();
        expect(CONNECTOR).toMatch(/ag-connector-badge,\s*\.np-source-row \.ag-source-badge\s*\{/);
        expect(body).toMatch(/border-radius:\s*var\(--radius-badge\)/);
    });

    it('gets no look of its own in the player stylesheet', () => {
        // now-playing.css loads after connector-badge.css: anything it sets on the
        // badge wins, which is how a transparent border once overrode the twin's.
        const body = ruleBody(NOW_PLAYING, '.np-source-row .ag-source-badge');
        for (const prop of ['border', 'background', 'color', 'font-size', 'font-weight', 'padding', 'line-height', 'border-radius']) {
            expect(body, `now-playing.css sets ${prop} on the origin badge`).not.toMatch(new RegExp(`(^|[\\s;])${prop}\\s*:`));
        }
    });

    it('shows no HIGHRESAUDIO logo, which stretched the badge beside the output one', () => {
        const body = ruleBody(NOW_PLAYING, '.np-source-row .ag-source-badge__icon:has(.lib-src-logo-hra)');
        expect(body).toMatch(/display:\s*none/);
    });

    it('defaults the badge radius to the output badge own small radius', () => {
        expect(tokenValue(THEMES, '--radius-badge')).toBe('var(--radius-sm)');
    });
});
