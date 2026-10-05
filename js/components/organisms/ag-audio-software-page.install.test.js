/**
 * Unit tests for ag-audio-software-page.js — the install request itself.
 *
 * Two things must reach the core from here: the version picked in the install
 * dialog, and the fact that its terms were accepted — the core refuses an
 * install of a package with terms without it, because the dialog is not the
 * only way in. And one thing must come back to the screen: WHY an install was
 * turned down ("needs libgmpris, which no configured source provides"), which
 * a bare "Failed to install" used to hide. An UPDATE press is confirmed in words
 * that say what it does — the version it moves to, an older one it switches to,
 * a versionless vendor's installer run again — without asking the core first.
 *
 * Kept apart from ag-audio-software-page.test.js because it replaces
 * common.js's network and toast functions, which the other file uses for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted: vi.mock factories run before the module body, so anything they
// reference has to exist by then.
const { apiPost, showToast, addToHistory, showConfirm } = vi.hoisted(() => ({ apiPost: vi.fn(), showToast: vi.fn(), addToHistory: vi.fn(), showConfirm: vi.fn() }));

// Partial, as in ag-audio-software-page.test.js: common.js calls initAuth as it
// loads and throws unless requireAuth says the session is logged in.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    isGuest: () => false,
    isAdmin: () => true,
    requireAuth: () => true,
}));
vi.mock(import('../../common.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    apiPost,
    showToast,
    addToHistory,
    showConfirm,
}));

import { AgAudioSoftwarePage } from './ag-audio-software-page.js';

const HQPLAYERD = { id: 'hqplayerd', label: 'HQPlayer Embedded' };

/** A page instance with the parts that touch the DOM or timers stubbed out. */
function page() {
    const el = Object.create(AgAudioSoftwarePage.prototype);
    // Own data properties, not assignments: `dryRun` and `packages` are Lit
    // reactive properties, whose setters need state only the constructor
    // creates — and this instance was made without it.
    Object.defineProperty(el, 'dryRun', { value: false, writable: true });
    Object.defineProperty(el, 'packages', { value: [HQPLAYERD], writable: true });
    Object.defineProperty(el, '_installDialogFor', { value: HQPLAYERD, writable: true });
    Object.defineProperty(el, '_uninstallDialogFor', { value: null, writable: true });
    el._openLogsModal = vi.fn();
    el._startPolling = vi.fn();
    return el;
}

describe('installing from the dialog', () => {
    beforeEach(() => {
        apiPost.mockReset();
        showToast.mockReset();
    });

    it('sends the chosen version and the acceptance', async () => {
        apiPost.mockResolvedValue({ success: true });
        const el = page();
        await el._handleInstallConfirmed({
            detail: { packageId: 'hqplayerd', version: '6.0.2-3' },
        });
        expect(el._installDialogFor).toBeNull();  // the dialog closes
        const url = apiPost.mock.calls[0][0];
        expect(url).toContain('/packages/hqplayerd/install');
        expect(url).toContain('version=6.0.2-3');
        expect(url).toContain('accept_notices=true');
    });

    it('sends the web interface password in the body, never in the URL', async () => {
        // A URL ends up in access logs.
        apiPost.mockResolvedValue({ success: true });
        await page()._handleInstallConfirmed({
            detail: { packageId: 'hqplayerd', version: '6.0.2-3', webPassword: 'MyOwnPass42' },
        });
        const [url, body] = apiPost.mock.calls[0];
        expect(body).toEqual({ web_password: 'MyOwnPass42' });
        expect(url).not.toContain('MyOwnPass42');
        expect(url).not.toContain('web_password');
    });

    it('sends an empty body when there is no password to set', async () => {
        apiPost.mockResolvedValue({ success: true });
        await page()._handleInstallConfirmed({
            detail: { packageId: 'hqplayerd', version: null, webPassword: null },
        });
        expect(apiPost.mock.calls[0][1]).toEqual({});
    });

    it('sends no password with any other action', async () => {
        apiPost.mockResolvedValue({ success: true });
        await page()._runPackageAction(HQPLAYERD, 'uninstall');
        expect(apiPost.mock.calls[0][1]).toEqual({});
    });

    it('sends no version when none was chosen', async () => {
        apiPost.mockResolvedValue({ success: true });
        await page()._handleInstallConfirmed({
            detail: { packageId: 'hqplayerd', version: null },
        });
        expect(apiPost.mock.calls[0][0]).not.toContain('version=');
    });

    it('does not claim acceptance for anything but an install from the dialog', async () => {
        apiPost.mockResolvedValue({ success: true });
        await page()._runPackageAction(HQPLAYERD, 'uninstall');
        expect(apiPost.mock.calls[0][0]).not.toContain('accept_notices');
    });

    it('shows why an install was turned down', async () => {
        const reason = 'HQPlayer Embedded 5.17.2-48 cannot be installed on this system: '
            + 'it needs libgmpris, which no configured source provides';
        apiPost.mockResolvedValue({ success: false, message: reason });
        await page()._handleInstallConfirmed({
            detail: { packageId: 'hqplayerd', version: '5.17.2-48' },
        });
        expect(showToast).toHaveBeenCalledWith('error', 'Install Failed', reason);
    });

    it('falls back to a generic line when the core gave no reason', async () => {
        apiPost.mockResolvedValue({ success: false });
        await page()._handleInstallConfirmed({
            detail: { packageId: 'hqplayerd', version: null },
        });
        expect(showToast).toHaveBeenCalledWith(
            'error', 'Install Failed', 'Failed to install HQPlayer Embedded');
    });

    it('warns, rather than fails, when the package is installed but a step is left', async () => {
        // "Install Failed" used to be said about a package that was installed.
        const left = 'HQPlayer Embedded 6.0.2-3 is installed, but its new settings only take '
            + 'effect once hqplayerd.service restarts — restart it with: '
            + 'sudo systemctl restart hqplayerd.service';
        apiPost.mockResolvedValue({ success: true, warning: true, message: left });
        await page()._handleInstallConfirmed({
            detail: { packageId: 'hqplayerd', version: '6.0.2-3' },
        });
        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith('warning', 'Install Incomplete', left);
    });

    it('says the same about an update that left a step', async () => {
        const left = 'HQPlayer Embedded is updated, but its log is still written to its '
            + 'default place, without a size limit: its memory space could not be set up';
        apiPost.mockResolvedValue({ success: true, warning: true, message: left });
        await page()._runPackageAction(HQPLAYERD, 'update');
        expect(showToast).toHaveBeenCalledWith('warning', 'Update Incomplete', left);
    });

    it('keeps the plain success when there is no warning', async () => {
        apiPost.mockResolvedValue({ success: true, warning: false, message: 'ok' });
        await page()._runPackageAction(HQPLAYERD, 'install');
        expect(showToast).toHaveBeenCalledWith(
            'success', 'Install Successful', 'HQPlayer Embedded installed successfully');
    });

    it('spells the past tense of each action', async () => {
        // `${action}ed` put "updateed" on screen.
        apiPost.mockResolvedValue({ success: true });
        await page()._runPackageAction(HQPLAYERD, 'update');
        await page()._runPackageAction(HQPLAYERD, 'uninstall');
        expect(showToast.mock.calls.map(call => call[2])).toEqual([
            'HQPlayer Embedded updated successfully',
            'HQPlayer Embedded uninstalled successfully',
        ]);
    });
});

describe('simulating', () => {
    beforeEach(() => {
        apiPost.mockReset();
        showToast.mockReset();
        addToHistory.mockReset();
    });

    /** A page with SIMULATE on. */
    const simulating = () => Object.assign(page(), { dryRun: true });

    it('says nothing was changed, where it said "Install Successful"', async () => {
        apiPost.mockResolvedValue({ success: true, message:
            'Simulation: the steps to install HQPlayer Embedded went through — nothing was changed' });
        await simulating()._runPackageAction(HQPLAYERD, 'install');

        expect(apiPost.mock.calls[0][0]).toContain('dry_run=true');
        expect(showToast).toHaveBeenCalledExactlyOnceWith('info', 'Install Simulated',
            'Nothing was changed: the steps to install HQPlayer Embedded went through.');
        expect(addToHistory).toHaveBeenCalledExactlyOnceWith('software', 'Simulate install HQPlayer Embedded', true);
    });

    it('says a simulation failed as a simulation, with the core\'s reason', async () => {
        apiPost.mockResolvedValue({ success: false, message: 'needs libgmpris' });
        await simulating()._runPackageAction(HQPLAYERD, 'update');

        expect(showToast).toHaveBeenCalledExactlyOnceWith('error', 'Update Simulation Failed', 'needs libgmpris');
        expect(addToHistory).toHaveBeenCalledExactlyOnceWith('software', 'Simulate update HQPlayer Embedded', false);
    });

    it('keeps the setting it started with, if the switch is flipped meanwhile', async () => {
        let answer;
        apiPost.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        const el = simulating();
        const running = el._runPackageAction(HQPLAYERD, 'install');
        el.dryRun = false;
        answer({ success: true });
        await running;

        expect(showToast.mock.calls[0][1]).toBe('Install Simulated');
    });

    it('says the updates of a batch were simulated, not made', async () => {
        const el = simulating();
        el.packages = [{ ...HQPLAYERD, installed_version: '5.1', available_version: '5.2' }];
        window.showConfirm = vi.fn(async () => true);
        el._loadPackages = vi.fn();
        apiPost.mockResolvedValue([{ package_id: 'hqplayerd', success: true }]);

        await el._handleUpdateAll();

        expect(apiPost.mock.calls[0][0]).toContain('dry_run=true');
        expect(showToast).toHaveBeenLastCalledWith('info', 'Updates Simulated',
            'Nothing was changed: the steps to update 1 packages went through.');
    });

    it('says a simulated uninstall would delete the settings too, when that was ticked', async () => {
        apiPost.mockResolvedValue({ success: true });
        await simulating()._runPackageAction(HQPLAYERD, 'uninstall', null, false, null, true);

        expect(apiPost.mock.calls[0][0]).toContain('purge=true');
        expect(showToast).toHaveBeenCalledExactlyOnceWith('info', 'Uninstall Simulated',
            'Nothing was changed: the steps to uninstall HQPlayer Embedded and delete its '
            + 'settings and data went through.');
    });
});

describe('the update confirmation', () => {
    beforeEach(() => {
        apiPost.mockReset();
        showConfirm.mockReset();
    });

    /** Press UPDATE on a card holding `pkg`, declining the confirmation. */
    async function pressUpdate(pkg) {
        const el = page();
        el.packages = [pkg];
        showConfirm.mockResolvedValue(false);
        await el._handleAction({ detail: { packageId: pkg.id, action: 'update' } });
        return showConfirm.mock.calls[0][1];
    }

    it('offers to run again the installer of a vendor that publishes no version', async () => {
        const asked = await pressUpdate({ id: 'roon', label: 'Roon Bridge', installer_type: 'script',
            installed_version: '1.8 (build 1125) stable', available_version: null });
        expect(asked).toContain('Roon Bridge publishes no version number');
        expect(asked).toContain('You currently have 1.8 (build 1125) stable.');
    });

    it('names the version an update moves to', async () => {
        const asked = await pressUpdate({ ...HQPLAYERD, installer_type: 'apt_deb',
            installed_version: '5.1.5-67', available_version: '5.1.6-70' });
        expect(asked).toMatch(/^Update HQPlayer Embedded from version 5\.1\.5-67 to 5\.1\.6-70\?/);
    });

    it('says "Switch" for the older version the core proposes', async () => {
        const asked = await pressUpdate({ ...HQPLAYERD, installer_type: 'apt_deb',
            installed_version: '6.1.4-71', available_version: '5.1.6-70', available_is_older: true });
        expect(asked).toMatch(/^Switch HQPlayer Embedded from version 6\.1\.4-71 to 5\.1\.6-70\?/);
    });

    it('updates once it is confirmed, asking the core nothing before', async () => {
        apiPost.mockResolvedValue({ success: true });
        const el = page();
        el.packages = [{ ...HQPLAYERD, installer_type: 'apt_deb',
            installed_version: '5.1.5-67', available_version: '5.1.6-70' }];
        showConfirm.mockResolvedValue(true);

        await el._handleAction({ detail: { packageId: 'hqplayerd', action: 'update' } });

        expect(apiPost).toHaveBeenCalledOnce();
        expect(apiPost.mock.calls[0][0]).toMatch(/^\/packages\/hqplayerd\/update\?dry_run=false/);
    });
});

describe('uninstalling from the dialog', () => {
    beforeEach(() => {
        apiPost.mockReset();
        showToast.mockReset();
    });

    it('opens the dialog instead of uninstalling at once', async () => {
        const el = page();
        await el._handleAction({ detail: { packageId: 'hqplayerd', action: 'uninstall' } });
        expect(el._uninstallDialogFor).toBe(HQPLAYERD);
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('asks the core to delete the settings when that was ticked', async () => {
        apiPost.mockResolvedValue({ success: true });
        const el = page();
        el._uninstallDialogFor = HQPLAYERD;
        await el._handleUninstallConfirmed({ detail: { packageId: 'hqplayerd', purge: true } });
        expect(el._uninstallDialogFor).toBeNull();  // the dialog closes
        const url = apiPost.mock.calls[0][0];
        expect(url).toContain('/packages/hqplayerd/uninstall');
        expect(url).toContain('purge=true');
    });

    it('keeps the settings by default', async () => {
        apiPost.mockResolvedValue({ success: true });
        await page()._handleUninstallConfirmed({ detail: { packageId: 'hqplayerd', purge: false } });
        expect(apiPost.mock.calls[0][0]).not.toContain('purge');
    });

    it('never asks for a deletion with any other action', async () => {
        apiPost.mockResolvedValue({ success: true });
        await page()._runPackageAction(HQPLAYERD, 'update');
        expect(apiPost.mock.calls[0][0]).not.toContain('purge');
    });
});
