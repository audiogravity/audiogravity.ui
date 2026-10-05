/**
 * Unit tests for ag-radio-card — a tap on a card that holds buttons, and the
 * actions it folds behind "more".
 *
 * A tap on the card plays the station. The card holds buttons of its own — add to
 * My Live Radio, favourite, more — and a tap on one of those does what that button
 * does and plays nothing: each stops its click before it reaches the card, which
 * would otherwise play the station as well.
 *
 * Edit and "remove from My Live Radio" are behind "more": the row used to carry a
 * pencil and a check mark, and in the My Live Radio list that check was on every
 * row, telling nothing, while a touch on it removed the station.
 *
 * Covers:
 * 1. a tap on the card plays the station
 * 2. a tap on a button inside it does what that button does, and plays nothing
 * 3. which actions a row shows, for each place a station can be listed
 * 4. the unfolded actions: what each does, folding back, and a reused row
 */
import { describe, it, expect, beforeEach } from 'vitest';
import './ag-radio-card.js';

const STATION = { uuid: 'u1', name: 'FIP', codec: 'AAC' };

/**
 * Mount a card and record what it fires, with the detail each event carried.
 * @param {object} props - Properties to set on the card.
 */
async function card(props = {}) {
    const el = document.createElement('ag-radio-card');
    Object.assign(el, { station: STATION, ...props });
    document.body.appendChild(el);
    await el.updateComplete;
    const fired = [];
    for (const name of ['radio-play', 'radio-edit', 'radio-library-toggle', 'radio-favorite-toggle']) {
        el.addEventListener(name, (e) => fired.push([name, e.detail]));
    }
    return { el, fired, names: () => fired.map(([n]) => n) };
}

/** The "more" button of a card, or null. */
const moreBtn = (el) => el.querySelector('.lib-radio-more');

/** The worded buttons of the unfolded actions, by their text. */
const actions = (el) => [...el.querySelectorAll('.lib-radio-more-actions button')].map((b) => b.textContent.trim());

/** Unfold the actions of a card. */
async function unfold(el) {
    moreBtn(el).click();
    await el.updateComplete;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a tap on a radio card', () => {
    it('plays the station', async () => {
        const { el, names } = await card({ editable: true, inLibrary: true });
        el.querySelector('.lib-radio-card').click();
        expect(names()).toEqual(['radio-play']);
    });

    it('on the star toggles the favourite, and plays nothing', async () => {
        const { el, fired } = await card();
        el.querySelector('.lib-radio-star').click();
        expect(fired).toEqual([['radio-favorite-toggle', { station: STATION, favorite: true }]]);
    });

    it('on the plus adds the station to My Live Radio, and plays nothing', async () => {
        const { el, fired } = await card();
        el.querySelector('.lib-radio-lib').click();
        expect(fired).toEqual([['radio-library-toggle', { station: STATION, in_library: true }]]);
    });

    it('on "more" unfolds the actions, and plays nothing', async () => {
        const { el, names } = await card({ editable: true, inLibrary: true });
        await unfold(el);
        expect(names()).toEqual([]);
        expect(el.querySelector('.lib-radio-more-actions')).not.toBeNull();
    });
});

describe('the actions a row shows', () => {
    it('in My Live Radio: star and more, no plus and no check mark', async () => {
        const { el } = await card({ editable: true, inLibrary: true });
        expect(el.querySelector('.lib-radio-lib')).toBeNull();
        expect(el.querySelector('.lib-radio-star')).not.toBeNull();
        expect(moreBtn(el)).not.toBeNull();
    });

    it('a search result not saved yet: plus and star, nothing to fold', async () => {
        const { el } = await card({ editable: false, inLibrary: false });
        expect(el.querySelector('.lib-radio-lib')).not.toBeNull();
        expect(moreBtn(el)).toBeNull();
    });

    it('a search result already in My Live Radio: more offers only the removal', async () => {
        const { el } = await card({ editable: false, inLibrary: true });
        await unfold(el);
        expect(actions(el)).toEqual(['Remove from My Live Radio']);
    });

    it('a favourite outside My Live Radio: plus, and more offers only Edit', async () => {
        const { el } = await card({ editable: true, inLibrary: false, favorite: true });
        expect(el.querySelector('.lib-radio-lib')).not.toBeNull();
        await unfold(el);
        expect(actions(el)).toEqual(['Edit station']);
    });
});

describe('the unfolded actions', () => {
    it('say whether they are open, and point at them only while they exist', async () => {
        const { el } = await card({ editable: true, inLibrary: true });
        expect(moreBtn(el).getAttribute('aria-expanded')).toBe('false');
        expect(moreBtn(el).hasAttribute('aria-controls')).toBe(false);
        await unfold(el);
        expect(moreBtn(el).getAttribute('aria-expanded')).toBe('true');
        expect(moreBtn(el).getAttribute('aria-controls')).toBe('radio-more-u1');
        expect(el.querySelector('#radio-more-u1')).not.toBeNull();
    });

    it('can be shown open from the first render', async () => {
        // A story mounts the card unfolded: there is no station before the first one
        // to have moved away from, so nothing folds it.
        const { el } = await card({ editable: true, inLibrary: true, _moreOpen: true });
        expect(el.querySelector('.lib-radio-more-actions')).not.toBeNull();
    });

    it('fold when "more" has nothing left to offer, and do not unfold on their own', async () => {
        // A search result in My Live Radio offers only the removal. Taken out of My
        // Live Radio some other way, the row loses "more": the actions must fold, or
        // they would unfold by themselves when the station is added back.
        const { el } = await card({ editable: false, inLibrary: true });
        await unfold(el);
        el.inLibrary = false;
        await el.updateComplete;
        expect(moreBtn(el)).toBeNull();
        el.inLibrary = true;
        await el.updateComplete;
        expect(el.querySelector('.lib-radio-more-actions')).toBeNull();
    });

    it('fold back on a second tap on "more"', async () => {
        const { el } = await card({ editable: true, inLibrary: true });
        await unfold(el);
        await unfold(el);
        expect(el.querySelector('.lib-radio-more-actions')).toBeNull();
    });

    it('Edit asks to edit the station, folds the actions, and plays nothing', async () => {
        const { el, fired } = await card({ editable: true, inLibrary: true });
        await unfold(el);
        el.querySelector('.lib-radio-more-actions .action-btn.secondary').click();
        await el.updateComplete;
        expect(fired).toEqual([['radio-edit', { station: STATION }]]);
        expect(el.querySelector('.lib-radio-more-actions')).toBeNull();
    });

    it('Remove takes the station out of My Live Radio, folds the actions, and plays nothing', async () => {
        const { el, fired } = await card({ editable: true, inLibrary: true });
        await unfold(el);
        el.querySelector('.lib-radio-more-actions .action-btn.error').click();
        await el.updateComplete;
        expect(fired).toEqual([['radio-library-toggle', { station: STATION, in_library: false }]]);
        expect(el.querySelector('.lib-radio-more-actions')).toBeNull();
    });

    it('fold when the row starts showing another station', async () => {
        // The list re-renders by position: after a removal, the next station takes
        // this element, and must not arrive with "remove" already unfolded.
        const { el } = await card({ editable: true, inLibrary: true });
        await unfold(el);
        el.station = { uuid: 'u2', name: 'France Inter', codec: 'AAC' };
        await el.updateComplete;
        expect(el.querySelector('.lib-radio-more-actions')).toBeNull();
    });

    it('stay open when the same station is handed again', async () => {
        const { el } = await card({ editable: true, inLibrary: true });
        await unfold(el);
        el.station = { ...STATION };
        await el.updateComplete;
        expect(el.querySelector('.lib-radio-more-actions')).not.toBeNull();
    });
});
