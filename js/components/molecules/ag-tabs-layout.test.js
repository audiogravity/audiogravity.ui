/**
 * Unit tests for ag-tabs — which layout the tabs take.
 *
 * A column on a phone, the horizontal bar on a computer, and nothing to switch
 * between them (user's decision, 2026-10-09: the Switch button is gone). What these
 * hold:
 *
 *   - a computer gets the bar, even in a browser that had saved the column;
 *   - a phone gets the column — "phone" being any screen whose short side is 768 px
 *     or less, a 1366 × 768 laptop included;
 *   - no Switch button is rendered, on either;
 *   - the layout follows the screen both ways, and comes as on a load: the bar shown,
 *     the column as it was left (closed unless left open);
 *   - only a change of screen type acts: a resize that keeps it — a phone's address
 *     bar, a column a story sets on a computer — changes nothing;
 *   - an auto-close pending when the layout changes does not mark the bar hidden.
 *
 * Rendered for real, as in ag-tabs-library-row.test.js: lit is not mocked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { stubScreen, restoreScreen } from '../../test-utils.js';

vi.mock('../../core/keep-in-view.js', () => ({ keepInView: vi.fn() }));
vi.mock('../../auth.js', () => ({ getCurrentUser: vi.fn(() => null) }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(async () => ({})) }));

import './ag-tabs.js';

const TABS = [
    { id: 'pipeline', label: 'Pipeline', hidden: false, badgeCount: null },
    { id: 'admin',    label: 'Admin',    hidden: false, badgeCount: null },
];

/**
 * Mount the tabs on a screen of the given size, as the app does.
 *
 * @param {number} width
 * @param {number} height
 * @returns {Promise<HTMLElement>} The mounted element, settled.
 */
async function mountOn(width, height) {
    stubScreen(width, height);
    const el = document.createElement('ag-tabs');
    el.tabs = TABS;
    el.activeTab = 'pipeline';
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/** @returns {boolean} Whether a Switch button is in the tabs. */
const hasSwitch = (el) => Boolean(el.querySelector('.tab-orientation-btn'))
    || [...el.querySelectorAll('button')].some((b) => /switch/i.test(b.textContent));

let el;

afterEach(() => {
    el?.remove();
    document.querySelectorAll('.tab-sidebar-toggle').forEach((b) => b.remove());
    el = null;
    localStorage.clear();
    restoreScreen();
    vi.useRealTimers();
});

describe('ag-tabs — the layout the screen gives', () => {
    it('gives a computer the bar', async () => {
        el = await mountOn(1920, 1080);
        expect(el._vertical).toBe(false);
        expect(el.classList.contains('tabs--vertical')).toBe(false);
    });

    it('gives a computer the bar even where the column had been chosen', async () => {
        localStorage.setItem('tabs-orientation', 'vertical');
        el = await mountOn(1920, 1080);
        expect(el._vertical).toBe(false);
        expect(el.classList.contains('tabs--vertical')).toBe(false);
    });

    it('gives a phone the column, in either orientation', async () => {
        el = await mountOn(390, 844);
        expect(el._vertical).toBe(true);
        expect(el.classList.contains('tabs--vertical')).toBe(true);
        el.remove();
        el = await mountOn(844, 390);
        expect(el._vertical).toBe(true);
    });

    it('counts a screen whose short side is 768 px as a phone', async () => {
        el = await mountOn(1366, 768);
        expect(el._vertical).toBe(true);
    });

    it('ends the bar on Manual, so its automatic margin pushes Manual alone to the right', async () => {
        el = await mountOn(1920, 1080);
        expect(el.lastElementChild.classList.contains('tab-manual-btn')).toBe(true);
    });

    it('offers no Switch button, on a computer or a phone', async () => {
        el = await mountOn(1920, 1080);
        expect(hasSwitch(el)).toBe(false);
        el.remove();
        el = await mountOn(390, 844);
        expect(hasSwitch(el)).toBe(false);
    });
});

describe('ag-tabs — the layout follows the screen', () => {
    it('goes to the column on a small screen, and back to the bar on a large one', async () => {
        el = await mountOn(1920, 1080);
        stubScreen(390, 844);
        await el.updateComplete;
        expect(el._vertical).toBe(true);
        expect(el.classList.contains('tabs--vertical')).toBe(true);

        stubScreen(1920, 1080);
        await el.updateComplete;
        expect(el._vertical).toBe(false);
        expect(el.classList.contains('tabs--vertical')).toBe(false);
    });

    it('shows the bar it comes back to, though the column had been closed', async () => {
        // A phone's column starts closed (nothing saved says otherwise).
        el = await mountOn(390, 844);
        expect(el._sidebarHidden).toBe(true);

        stubScreen(1920, 1080);
        await el.updateComplete;
        expect(el._sidebarHidden).toBe(false);
        expect(el.classList.contains('tabs--sidebar-hidden')).toBe(false);
    });

    it('stops following once gone', async () => {
        el = await mountOn(1920, 1080);
        el.remove();
        stubScreen(390, 844);
        expect(el._vertical).toBe(false);
    });

    it('brings the column back as it was left: closed', async () => {
        el = await mountOn(390, 844);
        expect(el._sidebarHidden).toBe(true);
        stubScreen(1920, 1080);
        await el.updateComplete;
        stubScreen(390, 844);
        await el.updateComplete;
        expect(el._vertical).toBe(true);
        expect(el._sidebarHidden).toBe(true);
        expect(el.classList.contains('tabs--sidebar-hidden')).toBe(true);
    });

    it('brings the column back as it was left: open, when it was left open', async () => {
        localStorage.setItem('tabs-sidebar-hidden', 'false');
        el = await mountOn(390, 844);
        stubScreen(1920, 1080);
        await el.updateComplete;
        stubScreen(390, 844);
        await el.updateComplete;
        expect(el._sidebarHidden).toBe(false);
    });

    it('keeps an open column open through a resize that keeps the screen a phone', async () => {
        // A phone fires resize as its address bar shows and hides.
        el = await mountOn(390, 844);
        el._sidebarHidden = false;
        await el.updateComplete;
        stubScreen(390, 760);
        await el.updateComplete;
        expect(el._vertical).toBe(true);
        expect(el._sidebarHidden).toBe(false);
    });

    it('keeps a column set on a computer through a resize that keeps the screen a computer', async () => {
        // What the Storybook stories of the column do.
        el = await mountOn(1920, 1080);
        el._vertical = true;
        el._sidebarHidden = false;
        await el.updateComplete;
        stubScreen(1920, 1080);
        await el.updateComplete;
        expect(el._vertical).toBe(true);
        expect(el._sidebarHidden).toBe(false);
    });

    it('drops an auto-close pending when the layout changes: the bar is not marked hidden', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        el = await mountOn(390, 844);
        el._sidebarHidden = false;
        await el.updateComplete;
        el.dispatchEvent(new Event('mouseleave'));   // the column closes 500 ms later
        stubScreen(1920, 1080);
        await el.updateComplete;
        vi.advanceTimersByTime(1000);
        await el.updateComplete;
        expect(el._vertical).toBe(false);
        expect(el._sidebarHidden).toBe(false);
        expect(localStorage.getItem('tabs-sidebar-hidden')).not.toBe('true');
    });
});
