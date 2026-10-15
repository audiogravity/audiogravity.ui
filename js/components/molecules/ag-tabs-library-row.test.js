/**
 * Unit tests for ag-tabs — the library's tab bar carried in the column.
 *
 * Rendered for real: lit is not mocked here, unlike ag-tabs.test.js, because what is
 * pinned is WHERE the bar appears and what it shows. What these hold:
 *
 *   - the bar sits right under the Library entry, and only while the tabs are a
 *     column — the horizontal bar has the page's own under the Library tab;
 *   - it is folded until a tap on Library unfolds it, without opening the page nor
 *     closing the column; a second tap folds it, and it folds whenever the column
 *     closes — by any path — the layout changes, or Library cannot unfold, so the
 *     column always opens on Library folded; unfolded, it is scrolled into view and
 *     named to a screen reader, as a group of Library's views;
 *   - from another tab, the view the page was left on brings the page back as it was
 *     left; any other view goes to the page as a tab;
 *   - a tap on Library still opens the page on the horizontal bar;
 *   - Library is open on every edition — Starter plays the box's music and the radio, its
 *     padlocks are on the Pro sources inside — so a Starter box gets the bar too;
 *   - it is not offered when Library is hidden: every tap would lead nowhere;
 *   - it shows what the page's bar shows (five tabs, three for the radio), and
 *     highlights one only while Library is the tab shown;
 *   - a tap hands the page a TAB, not a view, and closes the column — `selectTab`
 *     leaves it open when Library is already shown;
 *   - the main bar is a navigation, not a tablist (2026-10-15): it holds more than its
 *     entries, the page shown is marked aria-current, Tab reaches every entry, and an
 *     arrow key moves nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/keep-in-view.js', () => ({ keepInView: vi.fn() }));
vi.mock('../../auth.js', () => ({ getCurrentUser: vi.fn(() => null) }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn() }));

import { apiGet } from '../../api.js';
import { keepInView } from '../../core/keep-in-view.js';
import { stubScreen, restoreScreen } from '../../test-utils.js';
import './ag-tabs.js';

// In the app's order (index.html): Library comes last, after Admin.
const TABS = [
    { id: 'pipeline', label: 'Pipeline', hidden: false, badgeCount: null },
    { id: 'admin',    label: 'Admin',    hidden: false, badgeCount: null },
    { id: 'library',  label: 'Library',  hidden: false, badgeCount: null },
];

const RADIO = { tab: 'radio', tabs: ['queue', 'library', 'radio'] };

/**
 * Mount the tabs as the app does, the licence answered by the (mocked) core.
 *
 * @param {Object} [opts]
 * @param {string} [opts.active='pipeline'] - The tab shown.
 * @param {boolean} [opts.vertical=true] - A column, or the horizontal bar.
 * @param {string} [opts.licence='lifetime'] - What /license/status answers.
 * @param {Array<Object>} [opts.tabs=TABS] - The app's tabs.
 * @returns {Promise<HTMLElement>} The mounted element, settled.
 */
async function mount({ active = 'pipeline', vertical = true, licence = 'lifetime', tabs = TABS } = {}) {
    apiGet.mockImplementation(async (url) => (url === '/license/status' ? { status: licence } : {}));
    const el = document.createElement('ag-tabs');
    el.tabs = tabs;
    el.activeTab = active;
    document.body.appendChild(el);
    el._vertical = vertical;
    // The licence arrives after connecting, from the mocked core.
    await new Promise(resolve => setTimeout(resolve, 0));
    await el.updateComplete;
    return el;
}

/** @returns {HTMLElement|null} The bar the column carries, if any. */
const row = (el) => el.querySelector('ag-lib-tabbar.lib-menu');

/** @returns {HTMLElement} The Library entry. */
const libraryEntry = (el) => el.querySelector('.tab-btn[data-tab="library"]');

/**
 * Tap the Library entry, as a reader would.
 *
 * @param {HTMLElement} el - The mounted tabs.
 */
async function tapLibrary(el) {
    libraryEntry(el).click();
    await el.updateComplete;
    await row(el)?.updateComplete;
}

/** @returns {Array<string>} Its labels, in order. */
const labels = (el) => [...row(el).querySelectorAll('.lib-tab span')].map(n => n.textContent);

/**
 * Tell the column what the library page would.
 *
 * @param {HTMLElement} el - The mounted tabs.
 * @param {{tab: string, tabs: (Array<string>|null)}} nav - The page's bar.
 */
async function announce(el, nav) {
    window.dispatchEvent(new CustomEvent('lib-nav-changed', { detail: nav }));
    await el.updateComplete;
    await row(el)?.updateComplete;
}

describe('ag-tabs — the library\'s tab bar in the column', () => {
    let el;

    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });
    afterEach(() => {
        el?.remove();
        el = null;
        vi.restoreAllMocks();
    });

    it('sits right under the Library entry, once a tap has unfolded it', async () => {
        el = await mount();
        await tapLibrary(el);
        expect(row(el)).not.toBeNull();
        expect(row(el).previousElementSibling.dataset.tab).toBe('library');
        expect(row(el).nextElementSibling.classList).toContain('tab-manual-btn');
    });

    it('is folded until Library is tapped — even with Library shown', async () => {
        el = await mount({ active: 'library' });
        expect(row(el)).toBeNull();
        expect(libraryEntry(el).getAttribute('aria-expanded')).toBe('false');
        expect(libraryEntry(el).querySelector('.tab-unfold')).not.toBeNull();
    });

    it('a tap on Library unfolds it, without opening the page nor closing the column', async () => {
        el = await mount({ active: 'pipeline' });
        el._sidebarHidden = false;
        await el.updateComplete;
        const changed = [];
        el.addEventListener('tab-changed', (e) => changed.push(e.detail.active));

        await tapLibrary(el);

        expect(row(el)).not.toBeNull();
        expect(libraryEntry(el).getAttribute('aria-expanded')).toBe('true');
        expect(libraryEntry(el).querySelector('.tab-unfold.open')).not.toBeNull();
        expect(el.activeTab).toBe('pipeline');
        expect(changed).toEqual([]);
        expect(el._sidebarHidden).toBe(false);
    });

    it('a second tap folds it', async () => {
        el = await mount();
        await tapLibrary(el);
        await tapLibrary(el);
        expect(row(el)).toBeNull();
        expect(libraryEntry(el).getAttribute('aria-expanded')).toBe('false');
    });

    it('folds whenever the column closes, so the column opens on Library folded', async () => {
        el = await mount();
        el._sidebarHidden = false;
        await el.updateComplete;
        await tapLibrary(el);

        el.closeSidebar();
        await el.updateComplete;
        expect(row(el)).toBeNull();

        el._sidebarHidden = false;
        await el.updateComplete;
        expect(row(el)).toBeNull();
    });

    it('folds by every path that closes the column: a tab chosen, the toggle, the pointer leaving', async () => {
        el = await mount();
        const leave = () => {
            // The column closes half a second after the pointer leaves it.
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            try {
                el.dispatchEvent(new MouseEvent('mouseleave'));
                vi.advanceTimersByTime(600);
            } finally {
                vi.useRealTimers();
            }
        };
        for (const close of [
            () => el.querySelector('.tab-btn[data-tab="admin"]').click(),
            () => el._toggleVisibility(),
            leave,
        ]) {
            el._sidebarHidden = false;
            await el.updateComplete;
            await tapLibrary(el);
            expect(row(el)).not.toBeNull();
            close();
            await el.updateComplete;
            expect(el._sidebarHidden).toBe(true);
            el._sidebarHidden = false;
            await el.updateComplete;
            expect(row(el)).toBeNull();
        }
    });

    it('folds when the tabs change layout, and comes back folded', async () => {
        // The layout follows the screen: a window carried to a large screen gets the
        // bar, and back on a small one the column.
        try {
            el = await mount();
            el._sidebarHidden = false;
            await el.updateComplete;
            await tapLibrary(el);
            stubScreen(1920, 1080);
            await el.updateComplete;
            expect(el._vertical).toBe(false);
            stubScreen(390, 844);
            el._sidebarHidden = false;
            await el.updateComplete;
            expect(el._vertical).toBe(true);
            expect(row(el)).toBeNull();
        } finally {
            restoreScreen();
        }
    });

    it('folds while Library cannot unfold, and does not come back unfolded with no tap', async () => {
        el = await mount();
        el._sidebarHidden = false;
        await el.updateComplete;
        await tapLibrary(el);
        el.tabs = TABS.map(t => (t.id === 'library' ? { ...t, hidden: true } : t));
        await el.updateComplete;
        expect(row(el)).toBeNull();
        el.tabs = TABS;
        await el.updateComplete;
        expect(row(el)).toBeNull();
        expect(libraryEntry(el).getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps a state set before its first render: that render is no change of layout', async () => {
        el = document.createElement('ag-tabs');
        el.tabs = TABS;
        el.activeTab = 'pipeline';
        el._vertical = true;
        // An open column: a closed one folds the bar, first render or not.
        el._sidebarHidden = false;
        el._licenseStatus = 'lifetime';
        el._fetchLicenseStatus = async () => {};
        el._libOpen = true;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(row(el)).not.toBeNull();
    });

    it('brings the unfolded views into view: Library is the last tab, on a short screen they land below', async () => {
        el = await mount();
        keepInView.mockClear();
        await tapLibrary(el);
        expect(keepInView).toHaveBeenCalledWith(row(el));
    });

    it('says what it unfolds to a screen reader', async () => {
        el = await mount();
        // Folded, the bar is not in the page: nothing to point at.
        expect(libraryEntry(el).hasAttribute('aria-controls')).toBe(false);
        await tapLibrary(el);
        expect(libraryEntry(el).getAttribute('aria-controls')).toBe(row(el).id);
        expect(row(el).id).toBe('tab-library-views');
        // Its views are Library's, not entries of the main bar.
        expect(row(el).getAttribute('role')).toBe('group');
        expect(row(el).getAttribute('aria-label')).toBe('Library views');
    });

    it('from another tab, the view the page was left on brings the page back as it was left', async () => {
        // An album open in Browse, then Pipeline: Browse returns to the album, where a
        // tab sent to the page would reset it to the grid.
        el = await mount({ active: 'pipeline' });
        await announce(el, { tab: 'browse', tabs: null });
        el._sidebarHidden = false;
        await el.updateComplete;
        await tapLibrary(el);
        const sent = [];
        const listener = (e) => sent.push(e.detail);
        window.addEventListener('lib-goto', listener);
        [...row(el).querySelectorAll('.lib-tab')].find(b => b.textContent.includes('Browse')).click();
        window.removeEventListener('lib-goto', listener);
        await el.updateComplete;
        expect(el.activeTab).toBe('library');
        expect(sent).toEqual([]);
        expect(el._sidebarHidden).toBe(true);
    });

    it('another view from another tab, or the same view with Library shown, goes to the page as a tab', async () => {
        const sent = [];
        const listener = (e) => sent.push(e.detail);
        window.addEventListener('lib-goto', listener);
        try {
            el = await mount({ active: 'pipeline' });
            await announce(el, { tab: 'browse', tabs: null });
            await tapLibrary(el);
            [...row(el).querySelectorAll('.lib-tab')].find(b => b.textContent.includes('Queue')).click();
            el.remove();

            el = await mount({ active: 'library' });
            await announce(el, { tab: 'browse', tabs: null });
            await tapLibrary(el);
            [...row(el).querySelectorAll('.lib-tab')].find(b => b.textContent.includes('Browse')).click();
        } finally {
            window.removeEventListener('lib-goto', listener);
        }
        expect(sent).toEqual([{ tab: 'queue' }, { tab: 'browse' }]);
    });

    it('offers the five tabs before the page has said anything', async () => {
        el = await mount();
        await tapLibrary(el);
        expect(labels(el)).toEqual(['Browse', 'Search', 'Queue', 'Sources', 'Radio']);
    });

    it('leaves the horizontal bar alone — the page\'s own bar sits under the Library tab there', async () => {
        el = await mount({ vertical: false });
        expect(libraryEntry(el).hasAttribute('aria-expanded')).toBe(false);
        expect(libraryEntry(el).querySelector('.tab-unfold')).toBeNull();
        // A tap there opens the page, as before.
        await tapLibrary(el);
        expect(el.activeTab).toBe('library');
        expect(row(el)).toBeNull();
    });

    it('is offered on a Starter box: Library is open on every edition', async () => {
        el = await mount({ licence: 'starter' });
        el._sidebarHidden = false;
        await el.updateComplete;
        expect(libraryEntry(el).classList).not.toContain('tab-btn--locked');
        expect(libraryEntry(el).getAttribute('aria-expanded')).toBe('false');
        await tapLibrary(el);
        expect(row(el)).not.toBeNull();
    });

    it('nor when the Library tab is hidden, even left unfolded', async () => {
        el = await mount({ tabs: TABS.map(t => (t.id === 'library' ? { ...t, hidden: true } : t)) });
        el._sidebarHidden = false;
        el._libOpen = true;
        await el.updateComplete;
        expect(row(el)).toBeNull();
        expect(libraryEntry(el).hasAttribute('aria-expanded')).toBe(false);
    });

    it('shows what the page\'s bar shows: three tabs for the radio', async () => {
        el = await mount({ active: 'library' });
        await tapLibrary(el);
        await announce(el, RADIO);
        expect(labels(el)).toEqual(['Queue', 'Sources', 'Radio']);
        expect(row(el).querySelector('.lib-tab.on').textContent).toContain('Radio');
    });

    it('highlights nothing while another tab is shown', async () => {
        // The reader is on Pipeline: a highlighted Radio would say they are not.
        el = await mount({ active: 'pipeline' });
        await tapLibrary(el);
        await announce(el, RADIO);
        expect(row(el).querySelector('.lib-tab.on')).toBeNull();
    });

    it('reads the page\'s bar on connecting, when the page was there first', async () => {
        const page = document.createElement('ag-library-page');
        page.navState = RADIO;
        document.body.appendChild(page);
        el = await mount({ active: 'library' });
        await tapLibrary(el);
        expect(labels(el)).toEqual(['Queue', 'Sources', 'Radio']);
    });

    it('a tap hands the page a tab, not a view', async () => {
        // A view would go through _navigate, which reloads the browse's grid: a tab is
        // what the page's own bar sends, and the page treats it the same way.
        el = await mount();
        await tapLibrary(el);
        const sent = [];
        const listener = (e) => sent.push(e.detail);
        window.addEventListener('lib-goto', listener);
        [...row(el).querySelectorAll('.lib-tab')].find(b => b.textContent.includes('Queue')).click();
        window.removeEventListener('lib-goto', listener);
        expect(sent).toEqual([{ tab: 'queue' }]);
    });

    it('and closes the column, even with Library already shown — folded for next time', async () => {
        el = await mount({ active: 'library' });
        el._sidebarHidden = false;
        await el.updateComplete;
        await tapLibrary(el);
        row(el).querySelector('.lib-tab').click();
        await el.updateComplete;
        expect(el._sidebarHidden).toBe(true);
        expect(el.classList).toContain('tabs--sidebar-hidden');
        expect(row(el)).toBeNull();
    });

    it('an arrow key moves the app nowhere, wherever it is pressed', async () => {
        // A navigation's entries are reached with Tab and opened with Enter, as any button:
        // an arrow that changed the page, unannounced, was the tablist's.
        el = await mount({ active: 'library' });
        await tapLibrary(el);
        for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Home', 'End']) {
            for (const target of [row(el).querySelector('.lib-tab'), el.querySelector('.tab-manual-btn'), libraryEntry(el)]) {
                target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
                expect(el.activeTab).toBe('library');
            }
        }
    });

    it('stops listening to the page once removed', async () => {
        el = await mount();
        el.remove();
        window.dispatchEvent(new CustomEvent('lib-nav-changed', { detail: RADIO }));
        expect(el._libNav).toEqual({ tab: '', tabs: null });
    });
});

describe('ag-tabs — what a screen reader is told', () => {
    // A tablist may hold tabs only, and this bar holds more: the wordmark, the user, Manual,
    // and in the column the library's bar between Library and the next entry. A screen
    // reader counted Queue, Sources, Radio and Manual among the app's tabs (Chromium's
    // accessibility tree, 2026-10-15). Each entry changes the whole page: a navigation.
    let el;

    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });
    afterEach(() => {
        el?.remove();
        el = null;
        vi.restoreAllMocks();
    });

    it.each([['the column, Library unfolded', true], ['the horizontal bar', false]])(
        'is a navigation named Main navigation, with no tablist nor tab inside — %s', async (_, vertical) => {
            el = await mount({ vertical, active: 'library' });
            if (vertical) await tapLibrary(el);
            expect(el.getAttribute('role')).toBe('navigation');
            expect(el.getAttribute('aria-label')).toBe('Main navigation');
            expect(el.querySelectorAll('[role="tab"], [role="tablist"], [aria-selected]')).toHaveLength(0);
        });

    it('marks the page shown, and only it', async () => {
        el = await mount({ vertical: false, active: 'pipeline' });
        const current = () => [...el.querySelectorAll('.tab-btn[aria-current="page"]')].map(b => b.dataset.tab);
        expect(current()).toEqual(['pipeline']);
        el.querySelector('.tab-btn[data-tab="admin"]').click();
        await el.updateComplete;
        expect(current()).toEqual(['admin']);
        expect(el.querySelector('.tab-manual-btn').hasAttribute('aria-current')).toBe(false);
    });

    it('lets Tab reach every entry, not the page shown alone', async () => {
        el = await mount({ vertical: false, active: 'admin' });
        const entries = [...el.querySelectorAll('.tab-btn[data-tab]')];
        expect(entries).toHaveLength(TABS.length);
        for (const btn of entries) {
            expect(btn.hasAttribute('tabindex')).toBe(false);
            expect(btn.tabIndex).toBe(0);
        }
    });
});
