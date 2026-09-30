/**
 * The audio software page follows the Animations switch without a reload.
 *
 * Its package cards read AppState.animationsEnabled as they are drawn, so a page
 * drawn with animations off kept its update badges still once they were switched
 * back on — until it redrew for some other reason. The page now redraws on
 * 'animations-changed', the window event the Settings panel sends.
 *
 * Mounted as in ag-audio-software-page.dialog.test.js: the page itself, the
 * modules around it replaced — what is tested is the page's side.
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

/** Mount the page and wait for its first render. */
async function mountPage() {
    const page = document.createElement('ag-audio-software-page');
    document.body.appendChild(page);
    await page.updateComplete;
    return page;
}

/** Switch animations on or off, the way the Settings panel announces it. */
function animations(enabled) {
    window.dispatchEvent(new CustomEvent('animations-changed', { detail: { enabled } }));
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('the audio software page and the Animations switch', () => {
    it('redraws when animations are switched', async () => {
        const page = await mountPage();
        const redraw = vi.spyOn(page, 'requestUpdate');

        animations(true);

        expect(redraw).toHaveBeenCalled();
    });

    it('no longer listens once removed', async () => {
        const page = await mountPage();
        page.remove();
        const redraw = vi.spyOn(page, 'requestUpdate');

        animations(false);

        expect(redraw).not.toHaveBeenCalled();
    });
});
