/**
 * Unit tests for ag-audio-software-page.js — the log window of an operation.
 *
 * - A simulation ends on its verdict. The core gives its package back the state
 *   the card showed, so the window ended on "Installed" after a simulated update
 *   that failed, and on "Not installed" after a simulated install that went
 *   through — whichever of that state and the answer reached the page first.
 * - A real operation still ends on the state it leaves.
 * - Another package's operation, run from another device, does not move it.
 * - Its title names the operation: `${Action}ing` said "Updateing".
 *
 * Kept apart from ag-audio-software-page.test.js because it replaces
 * common.js's network and toast functions, which the other file uses for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    isGuest: () => false,
    isAdmin: () => true,
    requireAuth: () => true,
}));
vi.mock(import('../../common.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    apiPost,
    showToast: vi.fn(),
    addToHistory: vi.fn(),
}));

import { AgAudioSoftwarePage } from './ag-audio-software-page.js';

const HQPLAYERD = { id: 'hqplayerd', label: 'HQPlayer Embedded', service_id: 'hqplayerd',
    status: 'installed', restarts_after_install: true };
const MPD = { id: 'mpd', label: 'MPD', service_id: 'mpd', status: 'installed' };

/** The log window, as the page finds it in the document: what it is told, and nothing else. */
function logsModal() {
    const modal = document.createElement('div');
    modal.id = 'agLogsModal';
    Object.assign(modal, { isOpen: false, progress: 0, statusText: '', isActive: false,
        showCancel: false, clearLogs: vi.fn(), appendLogs: vi.fn() });
    document.body.appendChild(modal);
    return modal;
}

/** A page instance with the parts that touch the DOM, the network or timers stubbed out. */
function page(simulated) {
    const el = Object.create(AgAudioSoftwarePage.prototype);
    for (const [name, value] of Object.entries({
        dryRun: simulated, packages: [{ ...HQPLAYERD }, { ...MPD }],
    })) {
        Object.defineProperty(el, name, { value, writable: true });
    }
    el._restartNeeded = new Set();
    el._logCursor = { packageId: null, lastSeq: 0 };
    el.requestUpdate = vi.fn();
    el._updateGlobalUpdateBadge = vi.fn();
    el._startPolling = vi.fn();
    el._syncLogsFromServer = vi.fn();
    return el;
}

/** The SSE event the core sends when a package changes state. */
const state = (pkg, status) => ({ detail: { ...pkg, status } });

/**
 * Update HQPlayer Embedded as the page does, the core's two state changes arriving
 * while the request runs — "updating", then the state the card had.
 * @param {Object} el - The page.
 * @param {Object} modal - The log window.
 * @param {Object} result - What the core answers.
 * @returns {Promise<string>} What the window said between the two changes and the answer.
 */
async function update(el, modal, result) {
    let before;
    apiPost.mockImplementation(async () => {
        el._handlePackageStateUpdate(state(HQPLAYERD, 'updating'));
        el._handlePackageStateUpdate(state(HQPLAYERD, 'installed'));
        before = modal.statusText;
        return result;
    });
    await el._runPackageAction(el.packages[0], 'update');
    return before;
}

beforeEach(() => { apiPost.mockReset(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('the log window of a simulation', () => {
    it('ends on how the simulation went, not on the state the card is given back', async () => {
        const modal = logsModal();
        const meanwhile = await update(page(true), modal, { success: false, message: 'Simulation: …' });

        expect(meanwhile).toBe('Updating');
        expect(modal.statusText).toBe('Simulation failed: nothing was changed');
        expect([modal.progress, modal.isActive, modal.showCancel]).toEqual([100, false, false]);
    });

    it('says so when the steps went through', async () => {
        const modal = logsModal();
        await update(page(true), modal, { success: true, message: 'Simulation: …' });
        expect(modal.statusText).toBe('Simulated: nothing was changed');
    });

    it('keeps its verdict when the state arrives after the answer', async () => {
        const modal = logsModal();
        const el = page(true);
        apiPost.mockResolvedValue({ success: true });
        await el._runPackageAction(el.packages[0], 'update');

        el._handlePackageStateUpdate(state(HQPLAYERD, 'installed'));

        expect(modal.statusText).toBe('Simulated: nothing was changed');
        expect(modal.progress).toBe(100);
    });

    it('ends on a failure when the request itself failed', async () => {
        const modal = logsModal();
        const el = page(true);
        apiPost.mockRejectedValue(new Error('Network error'));
        await el._runPackageAction(el.packages[0], 'update');
        expect(modal.statusText).toBe('Simulation failed: nothing was changed');
    });

    it('says in its title that it is one', async () => {
        const modal = logsModal();
        apiPost.mockResolvedValue({ success: true });
        await page(true)._runPackageAction(HQPLAYERD, 'update');
        expect(modal.title).toBe('Updating HQPlayer Embedded (simulation)...');
    });
});

describe('the log window of an operation', () => {
    it('ends on the state the operation leaves', async () => {
        const modal = logsModal();
        await update(page(false), modal, { success: true, message: 'Successfully updated HQPlayer Embedded' });
        expect(modal.statusText).toBe('Installed');
        expect([modal.progress, modal.isActive]).toEqual([100, false]);
    });

    it('is not moved by another package', async () => {
        const modal = logsModal();
        const el = page(false);
        apiPost.mockImplementation(async () => {
            el._handlePackageStateUpdate(state(HQPLAYERD, 'updating'));
            el._handlePackageStateUpdate(state(MPD, 'installing'));
            el._handlePackageStateUpdate(state(MPD, 'error'));
            return { success: true };
        });
        await el._runPackageAction(el.packages[0], 'update');
        expect(modal.statusText).toBe('Updating');
        expect(modal.isActive).toBe(true);
    });

    it('names each operation', async () => {
        const modal = logsModal();
        apiPost.mockResolvedValue({ success: true });
        const titles = [];
        for (const action of ['install', 'update', 'uninstall']) {
            await page(false)._runPackageAction(MPD, action);
            titles.push(modal.title);
        }
        expect(titles).toEqual(['Installing MPD...', 'Updating MPD...', 'Uninstalling MPD...']);
    });
});
