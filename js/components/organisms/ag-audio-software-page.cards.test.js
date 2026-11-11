/**
 * What the audio software page hands each package card.
 *
 * "Restart required" is the core's: each package's `restart_needed`, which the core
 * checks against systemd every time it describes the package. The page passes it to
 * the card as `restartRequired` — kept in the browser instead, the badge was seen on
 * no other device and outlived restarts made another way (2026-11-11).
 *
 * Mounted as in ag-audio-software-page.dialog.test.js: the page itself, the modules
 * around it replaced. The grid is one of them, so a card is drawn by calling the
 * `renderItem` the page gives the grid.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'lit';

vi.mock('../../common.js', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    handleError: vi.fn(),
    AppState: {},
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

const MPD = { id: 'mpd', label: 'MPD', service_id: 'mpd', service_unit: 'mpd.service',
    status: 'installed' };

/**
 * The card the page draws for a package.
 * @param {Object} pkg - The package, as the core describes it.
 * @returns {Promise<HTMLElement>} The `ag-package-card` element.
 */
async function cardFor(pkg) {
    const page = document.createElement('ag-audio-software-page');
    page.packages = [pkg];
    document.body.appendChild(page);
    await page.updateComplete;
    const host = document.createElement('div');
    render(page.querySelector('ag-card-grid').renderItem(pkg, 0), host);
    return host.querySelector('ag-package-card');
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('the restart badge a card is handed', () => {
    it('is the one the core gives with the package', async () => {
        expect((await cardFor({ ...MPD, restart_needed: true })).restartRequired).toBe(true);
    });

    it('is none when the core gives none', async () => {
        expect((await cardFor({ ...MPD, restart_needed: false })).restartRequired).toBe(false);
        expect((await cardFor(MPD)).restartRequired).toBe(false);
    });
});
