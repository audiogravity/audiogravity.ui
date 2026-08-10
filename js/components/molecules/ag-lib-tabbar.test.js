/**
 * Unit tests for ag-lib-tabbar — tab selection and keeping the active tab in view.
 *
 * The scroll matters because the bar can be wider than its room: five labelled tabs
 * share the library top bar with a source badge and an action button, so it scrolls
 * sideways. The tab can change without anyone touching the bar — the global content
 * swipe (js/gestures.js) switches tabs, and so do links deeper in the page — and the
 * bar would otherwise keep showing wherever it was last dragged, with the selected
 * tab off-screen.
 *
 * jsdom implements no layout and therefore no scrollIntoView, so it is stubbed and
 * the ARGUMENTS are asserted: both options carry a reason and both have been got
 * wrong before elsewhere. `block: 'nearest'` in particular is what stops the browser
 * from scrolling the whole page to reveal the bar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './ag-lib-tabbar.js';

const PAGE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', 'organisms', 'ag-library-page.js',
);

/**
 * Mount a bar on a given tab.
 *
 * The stub lives on Element.prototype rather than on the buttons: the first render
 * already counts as a tab change, so a per-element stub installed after mounting
 * arrives too late and the component calls a method jsdom does not implement.
 * Calls made while mounting are cleared, so each test starts from zero.
 *
 * @param {string} tab - The tab to start on.
 * @returns {Promise<HTMLElement>} the mounted element
 */
async function mount(tab = 'browse') {
    const el = document.createElement('ag-lib-tabbar');
    el.tab = tab;
    document.body.appendChild(el);
    await el.updateComplete;
    Element.prototype.scrollIntoView.mockClear();
    return el;
}

describe('ag-lib-tabbar', () => {
    let el;

    beforeEach(() => {
        document.body.innerHTML = '';
        Element.prototype.scrollIntoView = vi.fn();
    });
    afterEach(() => { el?.remove(); });

    it('renders one labelled tab per destination, radio included', async () => {
        el = await mount();
        const labels = [...el.querySelectorAll('.lib-tab span')].map(s => s.textContent);
        expect(labels).toEqual(['Browse', 'Search', 'Queue', 'Library', 'Radio']);
    });

    it('marks only the active tab', async () => {
        el = await mount('radio');
        const on = el.querySelectorAll('.lib-tab.on');
        expect(on).toHaveLength(1);
        expect(on[0].textContent).toContain('Radio');
    });

    it('announces every tap, including one on the tab already highlighted', async () => {
        // Several views map onto a tab they are not — outputs shows Library selected,
        // and the artist / Roon / UPnP browsers all show Browse. Tapping the highlighted
        // tab is how you get back out of them, so the tap has to be announced even when
        // the key has not changed. Swallowing it left a named, selected, dead control.
        el = await mount('browse');
        const seen = [];
        el.addEventListener('lib-tab-change', e => seen.push(e.detail.tab));

        el.querySelectorAll('.lib-tab')[4].click();   // Radio
        await el.updateComplete;
        el.querySelector('.lib-tab.on').click();      // Radio again
        await el.updateComplete;

        expect(seen).toEqual(['radio', 'radio']);
    });

    it('scrolls the newly active tab into view without moving the page', async () => {
        el = await mount('browse');
        el.tab = 'radio';
        await el.updateComplete;

        const active = el.querySelector('.lib-tab.on');
        expect(active.scrollIntoView).toHaveBeenCalledTimes(1);
        expect(active.scrollIntoView).toHaveBeenCalledWith(
            expect.objectContaining({ inline: 'center', block: 'nearest' }),
        );
    });

    it('does not scroll when a re-render is not a tab change', async () => {
        el = await mount('browse');
        const active = el.querySelector('.lib-tab.on');

        el.requestUpdate();
        await el.updateComplete;

        expect(active.scrollIntoView).not.toHaveBeenCalled();
    });

    /**
     * The bar can only scroll if it is allowed to be narrower than its content, and
     * this component renders into the LIGHT DOM: the box its container lays out is
     * <ag-lib-tabbar>, not the .lib-nav inside it. Putting the flex properties on
     * .lib-nav alone left them inert — the element kept its content width, nothing
     * ever overflowed, and the sideways drag did nothing at all. Asserted against the
     * stylesheet source because no rendering test can see a rule that applies to the
     * wrong box, and jsdom does no layout.
     */
    it('gives the custom element itself the flex properties, not just .lib-nav', () => {
        const css = fs.readFileSync(PAGE, 'utf8');
        const rule = css.match(/\bag-lib-tabbar\s*\{([^}]*)\}/);
        expect(rule, 'no rule targets the ag-lib-tabbar element').not.toBeNull();
        expect(rule[1]).toMatch(/min-width:\s*0/);
        expect(rule[1]).toMatch(/flex:\s*1/);

        const nav = css.match(/\.lib-nav\s*\{([^}]*)\}/);
        expect(nav[1]).toMatch(/overflow-x:\s*auto/);
        expect(nav[1]).toMatch(/min-width:\s*0/);
    });

    it('skips the smooth scroll when animations are turned off', async () => {
        document.body.classList.add('no-animations');
        try {
            el = await mount('browse');
            el.tab = 'library';
            await el.updateComplete;
            const active = el.querySelector('.lib-tab.on');
            expect(active.scrollIntoView).toHaveBeenCalledWith(
                expect.objectContaining({ behavior: 'auto' }),
            );
        } finally {
            document.body.classList.remove('no-animations');
        }
    });
});
