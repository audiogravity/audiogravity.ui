/**
 * Unit tests for where ag-audio-software-page puts its install dialog.
 *
 * The regression: the dialog was rendered in the page's own template, inside
 * `.main-content`. That element is `position: fixed`, so it is a stacking
 * context of its own, and nothing inside it can rise above the top bar, the
 * tabs or the player bar, whatever its z-index. On a 1366×768 desktop both
 * buttons sat under the player bar and every click landed on it: the install
 * could not be confirmed at all. The dialog now lives on <body>, and the page
 * only drives it.
 *
 * The dialog's own module is replaced by an empty one: what is tested here is
 * the page's side — where the element goes, what it is told, what it answers
 * to — not what the dialog then fetches.
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

const HQPLAYERD = { id: 'hqplayerd', label: 'HQPlayer Embedded', service_id: 'hqplayerd' };

/** The install dialogs that are direct children of <body>. */
const dialogsOnBody = () =>
    [...document.body.children].filter(el => el.localName === 'ag-package-install-dialog');

/** The uninstall dialogs that are direct children of <body>. */
const uninstallDialogsOnBody = () =>
    [...document.body.children].filter(el => el.localName === 'ag-package-uninstall-dialog');

/**
 * Mount a page the way the app does: inside the fixed content area.
 * @returns {Promise<HTMLElement>}
 */
async function mountPage() {
    const main = document.createElement('main');
    main.className = 'main-content';
    const page = document.createElement('ag-audio-software-page');
    page.packages = [HQPLAYERD];
    main.appendChild(page);
    document.body.appendChild(main);
    await page.updateComplete;
    return page;
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('the install dialog of the audio software page', () => {
    it('lives on <body>, outside the content area', async () => {
        const page = await mountPage();
        const [dialog] = dialogsOnBody();
        expect(dialog).toBeDefined();
        expect(page.contains(dialog)).toBe(false);
        expect(document.querySelector('.main-content ag-package-install-dialog')).toBeNull();
    });

    it('opens on the package whose install was asked for', async () => {
        const page = await mountPage();
        await page._handleAction({ detail: { packageId: 'hqplayerd', action: 'install' } });
        await page.updateComplete;
        const [dialog] = dialogsOnBody();
        expect(dialog.pkg).toBe(HQPLAYERD);
        expect(dialog.show).toBe(true);
    });

    it('closes when the dialog is dismissed', async () => {
        const page = await mountPage();
        await page._handleAction({ detail: { packageId: 'hqplayerd', action: 'install' } });
        await page.updateComplete;
        const [dialog] = dialogsOnBody();

        dialog.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }));
        await page.updateComplete;

        expect(page._installDialogFor).toBeNull();
        expect(dialog.show).toBe(false);
        expect(dialog.pkg).toBeNull();
    });

    it('installs what the dialog confirmed, with the terms accepted', async () => {
        const page = await mountPage();
        const run = vi.spyOn(page, '_runPackageAction').mockResolvedValue();
        await page._handleAction({ detail: { packageId: 'hqplayerd', action: 'install' } });
        await page.updateComplete;
        const [dialog] = dialogsOnBody();

        dialog.dispatchEvent(new CustomEvent('install-confirmed', {
            bubbles: true,
            composed: true,
            detail: { packageId: 'hqplayerd', version: '6.0.2-3' },
        }));
        await page.updateComplete;

        expect(run).toHaveBeenCalledWith(HQPLAYERD, 'install', '6.0.2-3', true, null);
        expect(dialog.show).toBe(false);
    });

    it('takes the dialog away with the page', async () => {
        const page = await mountPage();
        expect(dialogsOnBody()).toHaveLength(1);
        page.parentElement.remove();
        expect(dialogsOnBody()).toHaveLength(0);
    });

    it('never leaves two dialogs behind when the page is put back', async () => {
        const page = await mountPage();
        const main = page.parentElement;
        main.remove();
        document.body.appendChild(main);
        await page.updateComplete;
        expect(dialogsOnBody()).toHaveLength(1);
    });
});

describe('the uninstall dialog of the audio software page', () => {
    it('lives on <body>, outside the content area', async () => {
        const page = await mountPage();
        const [dialog] = uninstallDialogsOnBody();
        expect(dialog).toBeDefined();
        expect(page.contains(dialog)).toBe(false);
    });

    it('opens on the package, told what the uninstall interrupts', async () => {
        const page = await mountPage();
        await page._handleAction({ detail: { packageId: 'hqplayerd', action: 'uninstall' } });
        await page.updateComplete;
        const [dialog] = uninstallDialogsOnBody();
        expect(dialog.pkg).toBe(HQPLAYERD);
        expect(dialog.show).toBe(true);
        expect(dialog.note).toContain('stops and removes HQPlayer Embedded');
    });

    it('uninstalls what the dialog confirmed, deleting the settings when ticked', async () => {
        const page = await mountPage();
        const run = vi.spyOn(page, '_runPackageAction').mockResolvedValue();
        await page._handleAction({ detail: { packageId: 'hqplayerd', action: 'uninstall' } });
        await page.updateComplete;
        const [dialog] = uninstallDialogsOnBody();

        dialog.dispatchEvent(new CustomEvent('uninstall-confirmed', {
            bubbles: true, composed: true, detail: { packageId: 'hqplayerd', purge: true },
        }));
        await page.updateComplete;

        expect(run).toHaveBeenCalledWith(HQPLAYERD, 'uninstall', null, false, null, true);
        expect(dialog.show).toBe(false);
    });

    it('closes when the dialog is dismissed', async () => {
        const page = await mountPage();
        await page._handleAction({ detail: { packageId: 'hqplayerd', action: 'uninstall' } });
        await page.updateComplete;
        const [dialog] = uninstallDialogsOnBody();
        dialog.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }));
        await page.updateComplete;
        expect(page._uninstallDialogFor).toBeNull();
        expect(dialog.show).toBe(false);
    });

    it('takes the dialog away with the page, and never leaves two', async () => {
        const page = await mountPage();
        const main = page.parentElement;
        main.remove();
        expect(uninstallDialogsOnBody()).toHaveLength(0);
        document.body.appendChild(main);
        await page.updateComplete;
        expect(uninstallDialogsOnBody()).toHaveLength(1);
    });
});
