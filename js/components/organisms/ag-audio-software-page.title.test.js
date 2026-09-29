/**
 * Unit tests for the actions of the Audio Software title.
 *
 * Refresh, download, CHECK UPDATES and UPDATE ALL are real buttons, drawn as badges
 * by plain-btn: the browser gives them the keyboard and announces them, with no code
 * of ours. While the configuration is being refreshed, the refresh button says it is
 * unavailable and a press does nothing — but it is not made disabled, which would
 * throw the focus off it.
 *
 * Covers:
 * 1. the four actions of the title are buttons
 * 2. while a refresh runs, and only then, the refresh button is announced
 *    unavailable and ignores a press, and it stays a focusable button
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../common.js', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    handleError: vi.fn(),
    AppState: {},
    MemoryCache: { get: vi.fn(() => []), set: vi.fn() },
    AgTimerManager: {},
    EventEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    addToHistory: vi.fn(),
}));
vi.mock('../../auth.js', () => ({ isGuest: () => false, isAdmin: () => true }));
vi.mock('../../core/FetchController.js', () => ({ FetchController: class { fetch() {} } }));
vi.mock('../../core/app-context.js', () => ({ appContext: Symbol('app') }));
vi.mock('@lit/context', () => ({
    ContextConsumer: class { constructor() { this.value = undefined; } },
}));
vi.mock('../atoms/ag-filter-bar.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-package-card.js', () => ({}));
vi.mock('../molecules/ag-package-install-dialog.js', () => ({}));
vi.mock('../molecules/ag-package-uninstall-dialog.js', () => ({}));

await import('./ag-audio-software-page.js');

/** A package with an update waiting, so that UPDATE ALL is shown. */
const MPD = { id: 'mpd', label: 'Music Player Daemon', installed_version: '0.23', available_version: '0.24' };

/**
 * Mount the page with the packages given.
 * @param {Object[]} packages
 * @returns {Promise<HTMLElement>}
 */
async function mountPage(packages) {
    const page = document.createElement('ag-audio-software-page');
    page.packages = packages;
    document.body.appendChild(page);
    await page.updateComplete;
    return page;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the actions of the Audio Software title', () => {
    it('are buttons, UPDATE ALL included', async () => {
        const page = await mountPage([MPD]);
        const actions = [...page.querySelectorAll('.tab-title-container .badge')];
        expect(actions.map((a) => a.localName)).toEqual(['button', 'button', 'button', 'button']);
        expect(actions.at(-1).textContent.trim()).toBe('UPDATE ALL');
    });

    it('hold the refresh while a refresh runs, and only then, without disabling it', async () => {
        const page = await mountPage([]);
        // Bound by the next render: the button then calls this instead of the real refresh.
        page._refreshConfig = vi.fn();
        page.requestUpdate();
        await page.updateComplete;
        const refresh = () => page.querySelector('button[aria-label^="Refresh package config"]');

        refresh().click();
        expect(page._refreshConfig).toHaveBeenCalledTimes(1);
        expect(refresh().getAttribute('aria-disabled')).toBe('false');

        page._isRefreshing = true;
        await page.updateComplete;
        refresh().click();
        expect(page._refreshConfig).toHaveBeenCalledTimes(1);
        expect(refresh().getAttribute('aria-disabled')).toBe('true');
        expect(refresh().disabled).toBe(false);

        page._isRefreshing = false;
        await page.updateComplete;
        refresh().click();
        expect(page._refreshConfig).toHaveBeenCalledTimes(2);
        expect(refresh().getAttribute('aria-disabled')).toBe('false');
    });
});
