/**
 * Unit tests for ag-tabs — the library's tab bar carried in the column.
 *
 * Rendered for real: lit is not mocked here, unlike ag-tabs.test.js, because what is
 * pinned is WHERE the bar appears and what it shows. What these hold:
 *
 *   - the bar sits right under the Library entry, and only while the tabs are a
 *     column — the horizontal bar has the page's own under the Library tab;
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

    it('sits right under the Library entry', async () => {
        el = await mount();
        expect(row(el)).not.toBeNull();
        expect(row(el).previousElementSibling.dataset.tab).toBe('library');
        expect(row(el).nextElementSibling.classList).toContain('tab-manual-btn');
    });

    it('offers the five tabs before the page has said anything', async () => {
        el = await mount();
        await row(el).updateComplete;
        expect(labels(el)).toEqual(['Browse', 'Search', 'Queue', 'Sources', 'Radio']);
    });

    it('leaves the horizontal bar alone — the page\'s own bar sits under the Library tab there', async () => {
        el = await mount({ vertical: false });
        expect(row(el)).toBeNull();
    });

    it('is not offered while the licence keeps Library closed', async () => {
        el = await mount({ licence: 'starter' });
        expect(el.querySelector('.tab-btn[data-tab="library"]').classList).toContain('tab-btn--locked');
        expect(row(el)).toBeNull();
    });

    it('nor when the Library tab is hidden', async () => {
        el = await mount({ tabs: TABS.map(t => (t.id === 'library' ? { ...t, hidden: true } : t)) });
        expect(row(el)).toBeNull();
    });

    it('shows what the page\'s bar shows: three tabs for the radio', async () => {
        el = await mount({ active: 'library' });
        await announce(el, RADIO);
        expect(labels(el)).toEqual(['Queue', 'Sources', 'Radio']);
        expect(row(el).querySelector('.lib-tab.on').textContent).toContain('Radio');
    });

    it('highlights nothing while another tab is shown', async () => {
        // The reader is on Pipeline: a highlighted Radio would say they are not.
        el = await mount({ active: 'pipeline' });
        await announce(el, RADIO);
        expect(row(el).querySelector('.lib-tab.on')).toBeNull();
    });

    it('reads the page\'s bar on connecting, when the page was there first', async () => {
        const page = document.createElement('ag-library-page');
        page.navState = RADIO;
        document.body.appendChild(page);
        el = await mount({ active: 'library' });
        await row(el).updateComplete;
        expect(labels(el)).toEqual(['Queue', 'Sources', 'Radio']);
    });

    it('a tap hands the page a tab, not a view', async () => {
        // A view would go through _navigate, which reloads the browse's grid: a tab is
        // what the page's own bar sends, and the page treats it the same way.
        el = await mount();
        const sent = [];
        const listener = (e) => sent.push(e.detail);
        window.addEventListener('lib-goto', listener);
        [...row(el).querySelectorAll('.lib-tab')].find(b => b.textContent.includes('Queue')).click();
        window.removeEventListener('lib-goto', listener);
        expect(sent).toEqual([{ tab: 'queue' }]);
    });

    it('and closes the column, even with Library already shown', async () => {
        el = await mount({ active: 'library' });
        el._sidebarHidden = false;
        await el.updateComplete;
        row(el).querySelector('.lib-tab').click();
        await el.updateComplete;
        expect(el._sidebarHidden).toBe(true);
        expect(el.classList).toContain('tabs--sidebar-hidden');
    });

    it('an arrow key pressed on it does not move the app to another tab', async () => {
        el = await mount({ active: 'library' });
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
