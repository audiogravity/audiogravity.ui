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
import { readStylesheet, cssRuleBody, mediaBlock } from '../../test-utils.js';

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

    it('say what they do in a word, the icons included', async () => {
        // Two black squares side by side said nothing of what they do (2026-10-04).
        const page = await mountPage([MPD]);
        const words = [...page.querySelectorAll('.tab-title-container .badge')].map((a) => a.textContent.trim());
        expect(words).toEqual(['REFRESH', 'DOWNLOAD', 'CHECK UPDATES', 'UPDATE ALL']);
        expect(page.querySelector('button[aria-label="Download resolved configuration"]')).not.toBeNull();
    });

    it('fit on one line on a 375px phone: no margin of their own once the row wraps', () => {
        // Each carried 6px of margin on top of the row's 6px gap: 327px for the 319 a
        // 375px phone has, and CHECK UPDATES went to a line of its own (measured).
        const phone = mediaBlock(readStylesheet('css', 'components', 'tab-zone.css'),
            /@media\s*\(width\s*<=\s*768px\)/);
        expect(cssRuleBody(phone, '.tab-zone .tab-title-container .badge')).toMatch(/margin-left:\s*0/);
    });

    it('offer the admin a SIMULATE switch, not a "dry-run" one', async () => {
        const page = await mountPage([]);
        expect(page.querySelector('.dry-run-label').textContent.trim()).toBe('SIMULATE');
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
