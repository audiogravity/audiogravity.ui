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
 *     named to a screen reader;
 *   - from another tab, the view the page was left on brings the page back as it was
 *     left; any other view goes to the page as a tab;
 *   - a tap on Library still opens the page on the horizontal bar, and still leads to
 *     the licence prompt when Library is locked; an arrow key still opens the page;
 *   - it is not offered when the licence keeps Library closed, nor when Library is
 *     hidden: every tap would lead to the licence prompt, or nowhere;
 *   - it shows what the page's bar shows (five tabs, three for the radio), and
 *     highlights one only while Library is the tab shown;
 *   - a tap hands the page a TAB, not a view, and closes the column — `selectTab`
 *     leaves it open when Library is already shown;
 *   - an arrow key pressed on it does not move the app to another tab.
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
        el._licenseStatus = 'starter';
        await el.updateComplete;
        expect(row(el)).toBeNull();
        el._licenseStatus = 'lifetime';
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
        expect(libraryEntry(el).getAttribute('aria-controls')).toBe('library');
        await tapLibrary(el);
        expect(libraryEntry(el).getAttribute('aria-controls')).toBe(row(el).id);
        expect(row(el).id).toBe('tab-library-views');
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

    it('is not offered while the licence keeps Library closed: a tap leads to the licence prompt', async () => {
        el = await mount({ licence: 'starter' });
        expect(libraryEntry(el).classList).toContain('tab-btn--locked');
        expect(libraryEntry(el).hasAttribute('aria-expanded')).toBe(false);
        await tapLibrary(el);
        expect(el.activeTab).toBe('admin');
        expect(row(el)).toBeNull();
    });

    it('nor when the Library tab is hidden, even left unfolded', async () => {
        el = await mount({ tabs: TABS.map(t => (t.id === 'library' ? { ...t, hidden: true } : t)) });
        el._sidebarHidden = false;
        el._libOpen = true;
        await el.updateComplete;
        expect(row(el)).toBeNull();
        expect(libraryEntry(el).hasAttribute('aria-expanded')).toBe(false);
    });

    it('an arrow key still opens the Library page, folded', async () => {
        el = await mount({ active: 'admin' });
        el.querySelector('.tab-btn[data-tab="admin"]')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await el.updateComplete;
        expect(el.activeTab).toBe('library');
        expect(row(el)).toBeNull();
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

    it('an arrow key pressed on it does not move the app to another tab', async () => {
        el = await mount({ active: 'library' });
        await tapLibrary(el);
        const key = () => new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });

        row(el).querySelector('.lib-tab').dispatchEvent(key());
        expect(el.activeTab).toBe('library');

        // Nor on Manual: only a key pressed on one of the tabs moves to another.
        el.querySelector('.tab-manual-btn').dispatchEvent(key());
        expect(el.activeTab).toBe('library');

        // The handler is live: the same key on the Library entry does move on.
        el.querySelector('.tab-btn[data-tab="library"]').dispatchEvent(key());
        expect(el.activeTab).toBe('admin');
    });

    it('stops listening to the page once removed', async () => {
        el = await mount();
        el.remove();
        window.dispatchEvent(new CustomEvent('lib-nav-changed', { detail: RADIO }));
        expect(el._libNav).toEqual({ tab: '', tabs: null });
    });
});
