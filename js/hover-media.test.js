/**
 * Guard: every :hover rule is under @media (hover: hover).
 *
 * A touch screen has no pointer to hover with, so the browser applies :hover to the
 * element last tapped and keeps it there until something else is tapped: a button
 * stays in its hover colour after it was pressed, as if still held or selected. On
 * 2026-10-10, 98 of the interface's hover rules did that (23 were already guarded);
 * all now sit in a `@media (hover: hover)` block, which a touch screen does not match.
 *
 * None of them made something appear that a touch screen could not reach otherwise:
 * their opacity changes only brighten what is already shown, and the one rule that
 * does reveal — the cover's actions in the library — has its own `@media (hover:
 * none)` that shows them on a touch screen.
 *
 * A rule that mixes hover with another state (`.tab-btn.active .tab-icon,
 * .tab-btn:hover .tab-icon`) is split: the other state stays outside, for touch too.
 *
 * Covers the stylesheets, the CSS written in components (css``, <style>, the
 * *_STYLES strings) and the pages' own <style> elements.
 *
 * A touch screen gets the press instead: a button fades while the finger is on it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { filesUnder, selectorList } from './test-utils.js';

/** Fewer guarded rules than this in the stylesheets means the walker lost them (104 on 2026-10-10). */
const GUARDED_FLOOR = 90;

/**
 * Whether a block head is a media query a touch screen does not match: one query (a
 * comma means "or"), not negated, with `(hover: hover)` among the conditions joined by
 * `and`. `(any-hover: hover)` does not qualify: a tablet with a trackpad matches it.
 *
 * @param {string} head - The text before a block's `{`.
 * @returns {boolean}
 */
export function guardsHover(head) {
    const query = /^@media\b([^{]*)$/.exec(head)?.[1].trim();
    if (!query || query.includes(',') || /^not\b/.test(query)) return false;
    return query.split(/\s+and\s+/).some((part) => /^\(\s*hover\s*:\s*hover\s*\)$/.test(part.trim()));
}

/**
 * Every style rule, with the at-rules that enclose it and its declarations.
 *
 * A brace walker, enough for this interface's CSS: comments and quoted strings are
 * skipped, at-rules nest, and the text since the last `{`, `}` or `;` is the head of
 * the block an opening brace starts.
 *
 * @param {string} css - Stylesheet text.
 * @returns {{selector: string, line: number, media: string[], body: string}[]}
 */
export function styleRules(css) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const found = [];
    const stack = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === '\'') {
            i++;
            while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
        } else if (c === '{') {
            const head = text.slice(start, i).trim();
            let rule = null;
            if (!head.startsWith('@')) {
                rule = {
                    selector: head.replace(/\s+/g, ' '),
                    line: text.slice(0, i).split('\n').length,
                    media: stack.map((b) => b.head).filter((h) => h.startsWith('@')),
                    body: '',
                };
                found.push(rule);
            }
            stack.push({ head, rule, from: i + 1 });
            start = i + 1;
        } else if (c === '}') {
            const block = stack.pop();
            if (block?.rule) block.rule.body = text.slice(block.from, i).trim();
            start = i + 1;
        } else if (c === ';') {
            start = i + 1;
        }
    }
    return found;
}

/**
 * Every rule that holds :hover, and whether a @media (hover: hover) encloses it.
 *
 * @param {string} css - Stylesheet text.
 * @returns {{selector: string, line: number, guarded: boolean}[]}
 */
export function hoverRules(css) {
    return styleRules(css)
        .filter((r) => r.selector.includes(':hover'))
        .map(({ selector, line, media }) => ({ selector, line, guarded: media.some(guardsHover) }));
}

/**
 * Selectors of the rules that hold :hover outside any @media (hover: hover).
 *
 * @param {string} css - Stylesheet text.
 * @returns {{selector: string, line: number}[]}
 */
export function unguardedHoverRules(css) {
    return hoverRules(css).filter((r) => !r.guarded).map(({ selector, line }) => ({ selector, line }));
}

/**
 * The CSS a component or a page writes in its source: css`` blocks, <style> elements
 * and *_STYLES strings, with their `${…}` interpolations blanked.
 *
 * @param {string} source - A component's or an HTML page's source.
 * @returns {string[]}
 */
export function componentCss(source) {
    const blocks = [
        ...source.matchAll(/\bcss`([\s\S]*?)`/g),
        ...source.matchAll(/<style>([\s\S]*?)<\/style>/g),
        ...source.matchAll(/_STYLES\s*=\s*`([\s\S]*?)`/g),
    ];
    return blocks.map((m) => m[1].replace(/\$\{[^}]*\}/g, ' '));
}

describe('every hover rule waits for a pointer that can hover', () => {
    it('in the stylesheets', () => {
        const found = filesUnder('css', /\.css$/).flatMap((file) => unguardedHoverRules(readFileSync(file, 'utf8'))
            .map((r) => `${file}:${r.line}: ${r.selector}`));
        expect(found).toEqual([]);
    });

    it('in the CSS written by components', () => {
        const found = filesUnder('js', /\.js$/)
            .filter((f) => !/\.(test|stories)\.js$/.test(f))
            .flatMap((file) => componentCss(readFileSync(file, 'utf8'))
                .flatMap((css) => unguardedHoverRules(css).map((r) => `${file}: ${r.selector}`)));
        expect(found).toEqual([]);
    });

    it('in the pages', () => {
        // The offline page is served when the box cannot be reached: its own <style> is
        // all the CSS it has.
        const found = ['index.html', 'login.html', ...filesUnder('public', /\.html$/)]
            .flatMap((file) => componentCss(readFileSync(file, 'utf8'))
                .flatMap((css) => unguardedHoverRules(css).map((r) => `${file}: ${r.selector}`)));
        expect(found).toEqual([]);
    });

    it('sees the hover rules it guards', () => {
        // A walker that recognised no rule would pass the tests above for nothing: count
        // the guarded rules it recognises, not the word in the text.
        const guarded = filesUnder('css', /\.css$/)
            .flatMap((f) => hoverRules(readFileSync(f, 'utf8')))
            .filter((r) => r.guarded);
        expect(guarded.length).toBeGreaterThan(GUARDED_FLOOR);
    });
});

describe('a touch screen shows the press instead', () => {
    // What hover showed under a mouse, a finger gets while it is on the button. The 4%
    // shrink alone could hardly be seen on an iPhone (user's test, 2026-10-10).
    const press = styleRules(readFileSync('css/base.css', 'utf8'))
        .filter((r) => r.media.some((m) => /\(\s*hover\s*:\s*none\s*\)/.test(m)) && r.selector.includes(':active'));

    // The stylesheets' reach: a shadow-DOM component (the audio pipeline diagram) is out
    // of it, and traced in audiogravity.ops/BACKLOG.md (👇).
    it('fades a button under the finger', () => {
        expect(press).toHaveLength(1);
        const selectors = selectorList(press[0].selector);
        expect(selectors.some((s) => s.startsWith('button:active'))).toBe(true);
        expect(selectors.some((s) => s.startsWith('[role="button"]:active'))).toBe(true);
        // Seen, and still there: the button is pressed, not gone.
        const fade = Number(/(?<![-\w])filter\s*:\s*opacity\(\s*([\d.]+)\s*\)/.exec(press[0]?.body)?.[1]);
        expect(fade).toBeLessThanOrEqual(0.7);
        expect(fade).toBeGreaterThanOrEqual(0.4);
    });

    it('multiplies a button\'s own opacity rather than replacing it', () => {
        // An inactive log filter sits at 0.35: `opacity: 0.6` would brighten it.
        expect(press[0]?.body).not.toMatch(/(?<![-\w(])opacity\s*:/);
    });

    it('leaves a busy button still', () => {
        for (const selector of selectorList(press[0]?.selector ?? '')) {
            expect(selector).toMatch(/:not\([^)]*\[aria-disabled="true"\]/);
        }
    });

    it('leaves a card still while a button inside it is pressed', () => {
        // Every ancestor of a pressed element is :active: a radio card faded with its
        // star, and the star twice over.
        const card = selectorList(press[0]?.selector ?? '').find((s) => s.startsWith('[role="button"]'));
        expect(card).toMatch(/:has\(:is\(button, \[role="button"\]\):active\)/);
    });

    it('leaves the Now Playing cover still while its details bubble is touched', () => {
        const [rule] = styleRules(readFileSync('css/components/now-playing.css', 'utf8'))
            .filter((r) => r.selector === '.np-cover-wrap:has(.np-detail-popover:active)');
        expect(rule?.body).toMatch(/(?<![-\w])filter\s*:\s*none/);
        expect(rule?.body).toMatch(/(?<![-\w])transform\s*:\s*none/);
    });
});

describe('the check', () => {
    it('refuses a hover rule on its own', () => {
        expect(unguardedHoverRules('.a:hover { color: red; }')).toEqual([{ selector: '.a:hover', line: 1 }]);
    });

    it('accepts it under @media (hover: hover), nested in another query too', () => {
        expect(unguardedHoverRules('@media (hover: hover) { .a:hover { color: red; } }')).toEqual([]);
        expect(unguardedHoverRules('@media (max-width: 600px) { @media (hover: hover) { .a:hover { x: y; } } }')).toEqual([]);
        expect(unguardedHoverRules('@media (min-width: 600px) and (hover: hover) { .a:hover { x: y; } }')).toEqual([]);
    });

    it('refuses it under another query alone', () => {
        expect(unguardedHoverRules('@media (max-width: 600px) { .a:hover { x: y; } }')).toHaveLength(1);
        expect(unguardedHoverRules('@media (hover: none) { .a:hover { x: y; } }')).toHaveLength(1);
    });

    it('refuses a query a touch screen can still match', () => {
        // A comma means "or": the second query matches a phone.
        expect(unguardedHoverRules('@media (hover: hover), (max-width: 600px) { .a:hover { x: y; } }')).toHaveLength(1);
        expect(unguardedHoverRules('@media (max-width: 600px), screen and (hover: hover) { .a:hover { x: y; } }')).toHaveLength(1);
        expect(unguardedHoverRules('@media not all and (hover: hover) { .a:hover { x: y; } }')).toHaveLength(1);
        // Any pointer, not the primary one: a tablet with a trackpad matches.
        expect(unguardedHoverRules('@media (any-hover: hover) { .a:hover { x: y; } }')).toHaveLength(1);
    });

    it('accepts the query in its other spellings', () => {
        expect(unguardedHoverRules('@media screen and (hover:hover) { .a:hover { x: y; } }')).toEqual([]);
        expect(unguardedHoverRules('@media(hover: hover){.a:hover{x:y}}')).toEqual([]);
    });

    it('refuses a mixed rule, which must be split', () => {
        expect(unguardedHoverRules('.a.active, .a:hover { x: y; }')).toHaveLength(1);
    });

    it('is not fooled by comments, strings or imports', () => {
        const css = "@import 'x.css';\n/* .a:hover { } */\n.b::before { content: '{ .c:hover {'; }\n.d:hover { x: y; }";
        expect(unguardedHoverRules(css)).toEqual([{ selector: '.d:hover', line: 4 }]);
    });

    it('reads the CSS of a component', () => {
        const source = "static styles = css`\n  .z:hover { color: ${'red'}; }\n`;\nrender() { return html`<style>.y:hover{}</style>`; }";
        expect(componentCss(source).flatMap(unguardedHoverRules).map((r) => r.selector)).toEqual(['.z:hover', '.y:hover']);
    });

    it('splits a selector list on its own commas, not on those nested inside it', () => {
        expect(selectorList('a:where(:not(b, :has(c, d))), e')).toEqual(['a:where(:not(b, :has(c, d)))', 'e']);
        // A quoted value is text: its brackets and commas count for nothing.
        expect(selectorList('[title="("], .b')).toEqual(['[title="("]', '.b']);
        expect(selectorList("[data-x='a,b'], .c")).toEqual(["[data-x='a,b']", '.c']);
    });

    it('reads a rule\'s queries and declarations', () => {
        const css = '@media (hover: none) { @supports (x: y) { a:active, b { filter: none; } } }\n.c { }';
        expect(styleRules(css)).toEqual([
            { selector: 'a:active, b', line: 1, media: ['@media (hover: none)', '@supports (x: y)'], body: 'filter: none;' },
            { selector: '.c', line: 2, media: [], body: '' },
        ]);
    });

    it('tells guarded rules from the others', () => {
        const css = '.a:hover { x: y; }\n@media (hover: hover) { .b:hover { x: y; } }';
        expect(hoverRules(css).map((r) => [r.selector, r.guarded])).toEqual([['.a:hover', false], ['.b:hover', true]]);
    });
});
