/**
 * Guards the colour of what destroys — one colour, orange (user decision, 2026-10-05) —
 * and the tag that must not pass for a button.
 *
 * Deleting the licence was red, deleting a user, a package or an override orange; the
 * user chose orange for all of them. Both sides are read here: the screens' code, where
 * a button that deletes must not be written in the red variant (the passkey's Remove
 * was, and the stylesheet check alone did not see it), and the stylesheets, where no
 * rule paints a delete control red, the small controls that only take a colour under
 * the pointer take orange, and the orange variant stays readable.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { appSources, openingTags, readStylesheet, cssRuleBody } from './test-utils.js';

/** What a button that deletes says, in its label, its aria-label or its icon. */
const DELETES = /\b(delete|remove|uninstall|purge)\b|iconTrash/i;

/** A button written in the red variant: a class of its, or the type of an ag-button. */
const RED = (tag) => /(^|\s)(error|danger)(\s|$)|--error\b/.test(tag.match(/\bclass="([^"]*)"/)?.[1] ?? '')
    || /\btype="(error|danger)"/.test(tag);

/**
 * Every stylesheet under css/, comments removed: a comment may name a colour, and the
 * rule it describes is what counts.
 * @returns {Array<[string, string]>} Pairs of path under css/ and stylesheet text.
 */
function stylesheets() {
    return readdirSync(path.join(process.cwd(), 'css'), { recursive: true })
        .filter((name) => name.endsWith('.css'))
        .map((name) => [name, readStylesheet('css', name).replace(/\/\*[\s\S]*?\*\//g, '')]);
}

describe('the controls that delete', () => {
    it('are never written in the red variant, in any screen', () => {
        // Each button read with what it holds up to its closing tag: an icon-only one
        // says what it does through its aria-label or its trash icon.
        const offenders = [];
        for (const file of appSources()) {
            const text = readFileSync(file, 'utf8');
            let from = 0;
            for (const tag of openingTags(text)) {
                const at = text.indexOf(tag, from);
                from = at + tag.length;
                const name = tag.match(/^<(button|ag-button)\b/)?.[1];
                if (!name) continue;
                const end = text.indexOf(`</${name}>`, from);
                const button = tag + (end === -1 ? '' : text.slice(from, end));
                if (DELETES.test(button) && RED(tag)) {
                    offenders.push(`${file}: ${tag.replace(/\s+/g, ' ').slice(0, 100)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('are never painted red, in any stylesheet', () => {
        // Read from the selector, so a control added later is held to it too. The
        // configuration editor's diff is not a control: removed lines are red there the
        // way they are in every diff.
        const offenders = [];
        for (const [file, css] of stylesheets()) {
            for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                const sel = selector.trim().replace(/\s+/g, ' ');
                if (/\bdiff-/.test(sel)) continue;
                if (/delete|remove|trash|uninstall|purge|clear/i.test(sel) && /--color-error/.test(body)) {
                    offenders.push(`${file}: ${sel}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('turn orange under the pointer when that is all the colour they have', () => {
        const hover = [
            ['components/config-sidebar.css', '.passkey-chip-delete:hover'],
            ['audio-stack.css', '.ag-nmf-remove:hover'],
            ['performance.css', '.test-history-clear:hover'],
        ];
        for (const [file, selector] of hover) {
            expect(cssRuleBody(readStylesheet('css', file), selector), selector)
                .toMatch(/(^|[;\s])color:\s*var\(--color-warning-text\)/);
        }
    });

    it('carry the orange in their label, not in their border alone', () => {
        // The amber border reads at 2.1:1 on a light page, under the 3:1 a control's
        // edge owes; the label in --color-warning-text reads at 4.7:1.
        expect(cssRuleBody(readStylesheet('css', 'components', 'button.css'), '.action-btn.warning'))
            .toMatch(/(^|[;\s])color:\s*var\(--color-warning-text\)/);
    });

    it('keep their label readable on the orange a hover fills them with', () => {
        // The page background it used is white in the light themes: 2.2:1 on amber.
        const body = cssRuleBody(readStylesheet('css', 'components', 'button.css'),
            '.action-btn.warning:hover:where(:not(:disabled, [aria-disabled="true"]))');
        expect(body).toMatch(/background:\s*var\(--color-warning\)/);
        expect(body).toMatch(/(^|[;\s])color:\s*var\(--text-on-warning\)/);
    });

    it('do not fill with orange under the pointer while disabled', () => {
        // "Deleting…" filled orange as if it could still be pressed.
        expect(cssRuleBody(readStylesheet('css', 'components', 'button.css'), '.action-btn.warning:hover'))
            .toBeNull();
    });
});

describe('a tinted badge', () => {
    it('has no frame, so it does not pass for the buttons beside it', () => {
        // Transparent rather than none: the badge keeps its height, and its row stays put.
        expect(cssRuleBody(readStylesheet('css', 'components', 'badge.css'), '.badge.subtle'))
            .toMatch(/border-color:\s*transparent/);
    });
});
