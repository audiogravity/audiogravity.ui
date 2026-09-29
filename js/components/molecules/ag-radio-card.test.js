/**
 * Unit tests for ag-radio-card — a tap on a card that holds buttons.
 *
 * A tap on the card plays the station. The card holds buttons of its own — edit,
 * My Live Radio, favourite — and a tap on one of those does what that button does
 * and plays nothing: each stops its click before it reaches the card, which would
 * otherwise play the station as well.
 *
 * Covers:
 * 1. a tap on the card plays the station
 * 2. a tap on a button inside it does what that button does, and plays nothing
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

beforeEach(() => { document.body.innerHTML = ''; });

describe('a tap on a radio card', () => {
    it('plays the station', async () => {
        const { el, fired } = await card();
        el.querySelector('.lib-radio-card').click();
        expect(fired).toEqual(['radio-play']);
    });

    it.each([
        ['.lib-radio-edit', 'radio-edit'],
        ['.lib-radio-lib', 'radio-library-toggle'],
        ['.lib-radio-star', 'radio-favorite-toggle'],
    ])('on %s does what that button does, and plays nothing', async (selector, event) => {
        const { el, fired } = await card();
        el.querySelector(selector).click();
        expect(fired).toEqual([event]);
    });
});
