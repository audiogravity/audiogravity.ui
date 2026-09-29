/**
 * Guard: what acts as a button is a <button>.
 *
 * A real button is reached with Tab, pressed with Enter or Space and announced by
 * the browser itself, with no code of ours. The badges, icons and dots that were
 * spans or divs announced with role="button" became buttons on 2026-09-29, drawn as
 * before by .plain-btn (css/components/button.css). Two elements keep the role
 * because they cannot become buttons, and stay out of the keyboard's reach — a
 * departure from WCAG 2.1.1, accepted because the app is used by touch:
 * - the radio card holds three buttons, and the swipe that removes a station does
 *   not start on a button;
 * - the mini player's cover holds the album-details bubble.
 *
 * Covers:
 * 1. role="button" is written on those two elements and nowhere else
 * 2. an exception is recognised by the whole name of its class, not part of it
 *
 * BACKLOG: a span or div that only has a click listener, with no role, is not checked
 * — see "Des éléments cliquables ne sont pas de vrais boutons" in
 * audiogravity.ops/BACKLOG.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSources, openingTags } from './test-utils.js';

/** role="button", written as is or chosen by an expression. */
const BUTTON_ROLE = /\brole=("button"|'button'|\$\{[^}]*'button')/;

/** The elements that cannot be buttons: their file, and a class their tag carries. */
const CANNOT_BE_BUTTONS = [
    ['js/components/molecules/ag-radio-card.js', 'lib-radio-card'],
    ['js/components/organisms/ag-now-playing.js', 'np-cover-wrap'],
];

/** The class names of a tag's plain class attribute. */
const classesOf = (tag) => (tag.match(/\bclass="([^"]*)"/)?.[1] ?? '').split(/\s+/);

/** The exception a tag of this file is, if it is one. */
const exceptionOf = (file, tag) =>
    CANNOT_BE_BUTTONS.find(([f, cls]) => f === file && classesOf(tag).includes(cls));

describe('what acts as a button is a <button>', () => {
    it('role="button" sits on the two elements that cannot be buttons, and nowhere else', () => {
        const found = appSources().flatMap((file) => openingTags(readFileSync(file, 'utf8'))
            .filter((tag) => BUTTON_ROLE.test(tag))
            .map((tag) => {
                const known = exceptionOf(file, tag);
                return known ? known.join(': ') : `${file}: ${tag.split('\n')[0]}`;
            }));
        expect(found.sort()).toEqual(CANNOT_BE_BUTTONS.map((entry) => entry.join(': ')).sort());
    });
});

describe('the check', () => {
    it('recognises an exception by the whole name of its class', () => {
        const file = 'js/components/molecules/ag-radio-card.js';
        expect(exceptionOf(file, '<div class="x lib-radio-card" role="button">')).toBeDefined();
        expect(exceptionOf(file, '<div class="lib-radio-card-menu" role="button">')).toBeUndefined();
        expect(exceptionOf('js/other.js', '<div class="lib-radio-card" role="button">')).toBeUndefined();
    });
});
