/**
 * Unit tests for ag-playback-controls — what the full-screen player offers.
 *
 * On a station played alone all five buttons were live: Next stopped playback,
 * Previous only reconnected the stream, and Repeat / Shuffle set a mode that did
 * nothing there and stayed on for the next queue. A button that cannot act is now
 * greyed — never removed, so nothing slides under the finger.
 *
 * Covers:
 * 1. a track: the five buttons, Previous / Next greyed when unavailable
 * 2. a live broadcast played alone: the five buttons, all greyed but Play / Pause
 * 3. a live broadcast with entries behind it: the modes act on them, stay lit
 * 4. the row never changes, whatever plays
 * 5. the buttons still emit their action
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readStylesheet, cssRuleBody, mediaBlock } from '../../test-utils.js';
import './ag-playback-controls.js';

/**
 * Mount the controls.
 * @param {object} props - Properties to set on them.
 * @returns {Promise<HTMLElement>}
 */
async function controls(props) {
    const el = document.createElement('ag-playback-controls');
    Object.assign(el, { playing: true, ...props });
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/**
 * The buttons shown, by their label, with whether each is greyed.
 * @param {HTMLElement} el - The controls.
 * @returns {Array<[string, boolean]>}
 */
const shown = (el) => [...el.querySelectorAll('button')]
    .map((b) => [b.getAttribute('aria-label'), b.disabled]);

const FIVE = ['Repeat', 'Previous', 'Pause', 'Next', 'Shuffle'];

beforeEach(() => { document.body.innerHTML = ''; });

describe('a track', () => {
    it('offers the five buttons', async () => {
        const el = await controls({ canPrev: true, canNext: true });
        expect(shown(el)).toEqual([
            ['Repeat', false], ['Previous', false], ['Pause', false],
            ['Next', false], ['Shuffle', false],
        ]);
    });

    it('greys Previous and Next when unavailable, and only them', async () => {
        const el = await controls({ canPrev: false, canNext: false });
        expect(shown(el)).toEqual([
            ['Repeat', false], ['Previous', true], ['Pause', false],
            ['Next', true], ['Shuffle', false],
        ]);
    });
});

describe('a live broadcast', () => {
    it('played alone, greys everything but Play / Pause', async () => {
        const el = await controls({ live: true, canPrev: false, canNext: false });
        expect(shown(el)).toEqual([
            ['Repeat', true], ['Previous', true], ['Pause', false],
            ['Next', true], ['Shuffle', true],
        ]);
    });

    it('played alone, keeps a mode left on live, so it can be turned off', async () => {
        // Greyed, a Repeat set on an album could not be switched off from a station,
        // and went on to the next queue — what greying is there to prevent.
        const el = await controls({ live: true, repeat: true, shuffle: true });
        const sent = [];
        el.addEventListener('playback-control', (e) => sent.push(e.detail));
        for (const label of ['Repeat', 'Shuffle']) {
            const button = el.querySelector(`[aria-label="${label}"]`);
            expect(button.disabled).toBe(false);
            expect(button.classList.contains('active')).toBe(true);
            button.click();
        }
        expect(sent).toEqual([
            { action: 'set_repeat', value: 0 }, { action: 'set_shuffle', value: 0 },
        ]);
    });

    it('played alone, greys a mode once it is off', async () => {
        const el = await controls({ live: true, repeat: true, shuffle: false });
        expect(shown(el)).toEqual([
            ['Repeat', false], ['Previous', true], ['Pause', false],
            ['Next', true], ['Shuffle', true],
        ]);
        el.repeat = false;
        await el.updateComplete;
        expect(el.querySelector('[aria-label="Repeat"]').disabled).toBe(true);
    });

    it('with entries behind it, lights the modes that act on them', async () => {
        // Tracks queued behind a station (the queue of 2026-10-10: Radio Choco, then 18
        // Qobuz tracks): Repeat and Shuffle decide what follows.
        const el = await controls({ live: true, canPrev: false, canNext: true });
        expect(shown(el)).toEqual([
            ['Repeat', false], ['Previous', true], ['Pause', false],
            ['Next', false], ['Shuffle', false],
        ]);
    });

    it('last in the queue, lights the modes too: Repeat would go round', async () => {
        const el = await controls({ live: true, canPrev: true, canNext: false });
        expect(shown(el)).toEqual([
            ['Repeat', false], ['Previous', false], ['Pause', false],
            ['Next', true], ['Shuffle', false],
        ]);
    });
});

describe('the row never changes, whatever plays', () => {
    it.each([
        ['a track', { canPrev: true, canNext: true }],
        ['the last track', { canPrev: true, canNext: false }],
        ['a station alone', { live: true }],
        ['a station with tracks behind', { live: true, canNext: true }],
    ])('%s: the same five buttons, in the same order', async (_name, props) => {
        const el = await controls(props);
        expect(shown(el).map(([label]) => label)).toEqual(FIVE);
    });

    it('draws a greyed button as inert, its hover included', () => {
        const sheet = readStylesheet('css', 'components', 'playback-controls.css');
        expect(cssRuleBody(sheet, '.ag-pc-ctrl:disabled')).toMatch(/opacity:\s*\.3/);
        const hover = mediaBlock(sheet, /@media\s*\(hover:\s*hover\)/);
        expect(hover).toMatch(/\.ag-pc-ctrl:hover:not\(:disabled\)/);
    });
});

describe('what the buttons send', () => {
    it('emits the action of the button pressed', async () => {
        const el = await controls({ live: true, canPrev: true, canNext: true });
        const sent = [];
        el.addEventListener('playback-control', (e) => sent.push(e.detail));
        for (const label of ['Previous', 'Pause', 'Next']) {
            el.querySelector(`[aria-label="${label}"]`).click();
        }
        expect(sent).toEqual([{ action: 'prev' }, { action: 'toggle' }, { action: 'next' }]);
    });

    it('sends the mode to set from Repeat and Shuffle', async () => {
        const el = await controls({ repeat: true, shuffle: false });
        const sent = [];
        el.addEventListener('playback-control', (e) => sent.push(e.detail));
        el.querySelector('[aria-label="Repeat"]').click();
        el.querySelector('[aria-label="Shuffle"]').click();
        expect(sent).toEqual([
            { action: 'set_repeat', value: 0 }, { action: 'set_shuffle', value: 1 },
        ]);
    });

    it('sends nothing from a greyed button', async () => {
        const el = await controls({ live: true });
        const sent = [];
        el.addEventListener('playback-control', (e) => sent.push(e.detail));
        for (const label of ['Repeat', 'Previous', 'Next', 'Shuffle']) {
            el.querySelector(`[aria-label="${label}"]`).click();
        }
        expect(sent).toEqual([]);
    });
});
