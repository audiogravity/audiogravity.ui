/**
 * The modal's paragraph reset must never outrank a class.
 *
 * components/modal.css reset every paragraph of a modal with `.modal-body p`. Class +
 * element outranks a lone class, so each paragraph class used inside a modal lost its
 * margin, colour and line height, whatever its own stylesheet said. Nothing reported it:
 * a declaration that loses the cascade is not an error. Measured in the three package
 * dialogs: 0 px between a note and the block after it, where their stylesheet asked for
 * a margin. The reset is now written `:where(.modal-body) p`, which weighs no more than
 * the element alone.
 *
 * Read from the source on purpose: the defect is a specificity, which no rendered page
 * reports as such — the class rule is simply never seen to apply.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'css');

/**
 * Every stylesheet of the app, comments removed, keyed by its path under css/.
 * @returns {Map<string, string>}
 */
function stylesheets() {
    const out = new Map();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.css')) {
                const text = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
                out.set(path.relative(CSS, full), text);
            }
        }
    };
    walk(CSS);
    return out;
}

describe('modal paragraph reset', () => {
    it('no stylesheet targets modal paragraphs with the weight of a class', () => {
        const offenders = [];
        for (const [file, css] of stylesheets()) {
            // `.modal-body p` (or `.modal-body > p`) outside a :where(): the weight of
            // the class counts, and it beats a class set on the paragraph.
            if (/(^|[\s,{}])\.modal-body\s*>?\s*p\b/.test(css)) offenders.push(file);
        }
        expect(offenders).toEqual([]);
    });

    it('still resets plain paragraphs, so they do not take the browser margin', () => {
        const modal = stylesheets().get(path.join('components', 'modal.css'));
        const rule = modal.match(/:where\(\.modal-body\)\s*p\s*\{([^}]*)\}/);
        expect(rule).not.toBeNull();
        expect(rule[1]).toMatch(/margin:\s*0\s*;/);
    });
});
