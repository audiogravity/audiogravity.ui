/**
 * Unit tests for ag-radio-card — the keyboard on a card that holds buttons.
 *
 * The card answers Enter and Space as a button does (it plays the station), and
 * holds buttons of its own: edit, My Live Radio, favourite. A key pressed on one of
 * those bubbled up to the card, whose listener cancelled the button's click and
 * played the station instead (review, 2026-09-28).
 *
 * Covers:
 * 1. Enter on the card plays the station
 * 2. Enter on a button inside it does what that button does, and plays nothing
 */
import { describe, it, expect, beforeEach } from 'vitest';
import './ag-radio-card.js';

const STATION = { id: 's1', name: 'FIP', codec: 'AAC' };

/** Mount an editable card and record what it fires. */
async function card() {
    const el = document.createElement('ag-radio-card');
    el.station = STATION;
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    const fired = [];
    for (const name of ['radio-play', 'radio-edit', 'radio-library-toggle', 'radio-favorite-toggle']) {
        el.addEventListener(name, () => fired.push(name));
    }
    return { el, fired };
}

/** Press a key on an element the way a browser does: keydown, then the click it triggers. */
function press(target, key) {
    const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(down);
    // A native <button> turns Enter into a click unless its keydown was cancelled.
    if (target.tagName === 'BUTTON' && key === 'Enter' && !down.defaultPrevented) target.click();
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the keyboard on a radio card', () => {
    it('Enter on the card plays the station', async () => {
        const { el, fired } = await card();
        press(el.querySelector('.lib-radio-card'), 'Enter');
        expect(fired).toEqual(['radio-play']);
    });

    it.each([
        ['.lib-radio-edit', 'radio-edit'],
        ['.lib-radio-lib', 'radio-library-toggle'],
        ['.lib-radio-star', 'radio-favorite-toggle'],
    ])('Enter on %s does what that button does', async (selector, event) => {
        const { el, fired } = await card();
        press(el.querySelector(selector), 'Enter');
        expect(fired).toEqual([event]);
    });
});
