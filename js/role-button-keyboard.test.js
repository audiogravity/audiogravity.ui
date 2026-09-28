/**
 * Guard: an element given role="button" must work like one from the keyboard.
 *
 * Announced as a button, it is reached with Tab and pressed with Enter or Space.
 * Several could only be clicked — the radio card, the player's cover and source
 * dots, the pull tab, every clickable badge — and so could the badges and icons named
 * when their tooltips went. `onActivateKey` (components/utils-lit.js) gives Enter and
 * Space the click's effect.
 *
 * Covers:
 * 1. every role="button" (written, or chosen by an expression) carries tabindex and a
 *    keydown listener
 * 2. the tag reader reads a tag written across lines, with Lit expressions (and their
 *    arrows) inside
 *
 * BACKLOG: an element clickable without role="button" is not checked yet — see "Des
 * éléments cliquables de l'interface ne répondent pas au clavier" in
 * audiogravity.ops/BACKLOG.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSources, openingTags } from './test-utils.js';

const BUTTON_ROLE = /\brole=("button"|\$\{[^}]*'button')/;

describe('role="button" answers the keyboard', () => {
    const buttons = appSources().flatMap((file) => openingTags(readFileSync(file, 'utf8'))
        .filter((tag) => BUTTON_ROLE.test(tag))
        .map((tag) => [file, tag]));

    it('finds the elements it checks', () => {
        expect(buttons.length).toBeGreaterThanOrEqual(12);
    });

    it.each(buttons)('%s', (_, tag) => {
        expect(tag).toMatch(/\btabindex=/);
        expect(tag).toMatch(/@keydown=/);
    });
});

describe('the tag reader', () => {
    it('reads across lines and through expressions', () => {
        const tags = openingTags('<div\n  role="button"\n  @click=${(e) => go(e)}\n  tabindex="0">x</div>');
        expect(tags[0]).toBe('<div\n  role="button"\n  @click=${(e) => go(e)}\n  tabindex="0">');
    });
});
