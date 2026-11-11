/**
 * Unit tests for ag-audio-software-page.js — what the page does with the core's answers.
 *
 * - The "Restart required" badge is each package's `restart_needed`, as the core
 *   describes it: whether its service still runs what an install or update
 *   replaced, asked of systemd each time, so it goes out once the service
 *   restarted — whatever restarted it — and every device shows the same. Kept in
 *   this browser instead, it was seen on no other device and outlived the
 *   restarts made another way (2026-11-11). An action's result lights it at once;
 *   the state turning "installed" never does — a simulation and an update the box
 *   refused end on that change too. A rule here once lit it after every install
 *   and update of a package with a service: for Shairport Sync, seconds after its
 *   package had restarted it on the new version.
 * - The restart button asks the core first whether the restart is still owed —
 *   another device may have done it — then restarts the systemd unit
 *   (`service_unit`), not the package's `service_id`: "Service 'airplay.service'
 *   is not managed by Audiogravity". And it reads `success`: the route answers
 *   200 with `success: false`, and "restarted successfully" was shown anyway.
 * - The badges this browser kept under the old rule are dropped once.
 * - "Update all" reads `warning`: it said "All Updates Complete" about an
 *   update whose next step was left, and the core's message was lost.
 * - A web interface password is set on an installed package from its card,
 *   in the request body.
 *
 * Kept apart from ag-audio-software-page.test.js because it replaces
 * common.js's network and toast functions, which the other file uses for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiGet, apiPost, showToast } = vi.hoisted(() => {
    // A toast's handle that tells the outcome as a toast of its own: the calls then read in
    // order — an "in progress" notice, then what it came to.
    const showToast = vi.fn(() => ({ update: (...outcome) => showToast(...outcome), close: () => {} }));
    return { apiGet: vi.fn(), apiPost: vi.fn(), showToast };
});

vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    isGuest: () => false,
    isAdmin: () => true,
    requireAuth: () => true,
}));
vi.mock(import('../../common.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    apiGet,
    apiPost,
    showToast,
    addToHistory: vi.fn(),
}));

import { AgAudioSoftwarePage } from './ag-audio-software-page.js';

const HQPLAYERD = {
    id: 'hqplayerd', label: 'HQPlayer Embedded', service_id: 'hqplayerd',
    service_unit: 'hqplayerd.service', status: 'installing',
    web_credentials: { username: 'hqplayer', port: 8088, already_set: false },
};
const MPD = { id: 'mpd', label: 'MPD', service_id: 'mpd', service_unit: 'mpd.service',
    status: 'updating' };
/** Its key in audio-config.json is not its unit's name. */
const SHAIRPORT = { id: 'airplay', label: 'Shairport Sync', service_id: 'airplay',
    service_unit: 'shairport-sync.service', status: 'installed' };

/** A page instance with the parts that touch the DOM or timers stubbed out. */
function page(packages = [HQPLAYERD, MPD, SHAIRPORT]) {
    const el = Object.create(AgAudioSoftwarePage.prototype);
    // Own data properties: the Lit setters need state only the constructor makes.
    for (const [name, value] of Object.entries({
        dryRun: false, packages: packages.map(p => ({ ...p })),
        _installDialogFor: null, _uninstallDialogFor: null, _webPasswordDialogFor: null,
    })) {
        Object.defineProperty(el, name, { value, writable: true });
    }
    el.packagesFetch = { stale: false };
    el.requestUpdate = vi.fn();
    el._updateGlobalUpdateBadge = vi.fn();
    el._loadPackages = vi.fn();
    el._openLogsModal = vi.fn();
    el._startPolling = vi.fn();
    return el;
}

/** Whether the page shows "Restart required" on a package's card. */
const badged = (el, packageId) => Boolean(el.packages.find(p => p.id === packageId)?.restart_needed);

/**
 * Have the page's next reading of the packages answer this listing, as the core
 * gives it.
 * @param {Object} el - The page.
 * @param {Object[]} listing - The packages the core describes.
 */
function coreDescribes(el, listing) {
    el._loadPackages = vi.fn(async () => { el.packages = listing.map(p => ({ ...p })); });
}

/** The SSE event the core sends once an operation is over. */
const installed = pkg => ({ detail: { ...pkg, status: 'installed' } });

beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    showToast.mockReset();
});

describe('the restart badge', () => {
    /**
     * Run an update of MPD as the page does, the core's two state changes arriving
     * while it runs — "updating", then "installed".
     * @param {Object} result - What the core answers.
     * @param {boolean} [simulated] - With SIMULATE on.
     * @returns {Promise<Object>} The page.
     */
    async function updateMpd(result, simulated = false) {
        const el = page();
        el.dryRun = simulated;
        apiPost.mockImplementation(async () => {
            el._handlePackageStateUpdate({ detail: { ...MPD, status: 'updating' } });
            el._handlePackageStateUpdate(installed(MPD));
            return result;
        });
        await el._runPackageAction(el.packages[1], 'update');
        return el;
    }

    it('is not shown when the core says nothing is owed', async () => {
        // HQPlayer Embedded: the core restarts it itself once installed.
        apiPost.mockResolvedValue({ success: true, restart_needed: false,
            message: 'Successfully installed HQPlayer Embedded' });
        const el = page();
        await el._runPackageAction(el.packages[0], 'install', null, true, 'MyOwnPass42');
        expect(badged(el, 'hqplayerd')).toBe(false);
    });

    it('is not shown after an update whose package restarted its service', async () => {
        // Shairport Sync 5.6.2 → 5.6.3 on the x86 box, 2026-11-11: it was.
        apiPost.mockResolvedValue({ success: true, restart_needed: false,
            message: 'Successfully updated Shairport Sync' });
        const el = page();
        await el._runPackageAction(el.packages[2], 'update');
        expect(badged(el, 'airplay')).toBe(false);
    });

    it('is not shown on a success the core gave no word on', async () => {
        const el = await updateMpd({ success: true, message: 'Successfully updated MPD' });
        expect(badged(el, 'mpd')).toBe(false);
    });

    it('is shown at once where the service still runs the previous version', async () => {
        // MPD's package does not restart it.
        const el = await updateMpd({ success: true, restart_needed: true,
            message: 'Successfully updated MPD' });
        expect(badged(el, 'mpd')).toBe(true);
    });

    it('is not shown after a simulation, whatever it found', async () => {
        // The core gives the card back its state: "updating", then "installed".
        for (const success of [true, false]) {
            const el = await updateMpd({ success, message: 'Simulation: …' }, true);
            expect(badged(el, 'mpd')).toBe(false);
        }
    });

    it('is not shown after an update the box refused', async () => {
        const el = await updateMpd({ success: false, message: 'MPD was not updated: dpkg is busy' });
        expect(badged(el, 'mpd')).toBe(false);
    });

    it('is not lit by the state turning "installed"', () => {
        const el = page();
        el._handlePackageStateUpdate(installed(MPD));
        expect(badged(el, 'mpd')).toBe(false);
    });

    it('is the core\'s, whichever device ran the operation', () => {
        // Kept in the browser that ran it, no other device saw it.
        const el = page();
        el._handlePackageStateUpdate({ detail: { ...MPD, status: 'installed', restart_needed: true } });
        expect(badged(el, 'mpd')).toBe(true);
    });

    it('goes out when the core describes the package without it', () => {
        // Its service restarted from the Services page, or by a reboot.
        const el = page([{ ...MPD, status: 'installed', restart_needed: true }]);
        el._handlePackageStateUpdate(installed(MPD));
        expect(badged(el, 'mpd')).toBe(false);
    });

    it('is not shown after an uninstall', async () => {
        apiPost.mockResolvedValue({ success: true, message: 'Successfully uninstalled MPD' });
        const el = page();
        await el._runPackageAction(el.packages[1], 'uninstall');
        expect(badged(el, 'mpd')).toBe(false);
    });

    it('is shown when the restart the core owed failed', async () => {
        apiPost.mockResolvedValue({ success: true, warning: true, restart_needed: true,
            message: 'HQPlayer Embedded is installed, but its new settings only take effect once hqplayerd.service restarts' });
        const el = page();
        await el._runPackageAction(el.packages[0], 'install', null, true, 'MyOwnPass42');
        expect(badged(el, 'hqplayerd')).toBe(true);
    });
});

describe('the packages read again when the tab is shown', () => {
    /** A page already loaded once, showing these packages. */
    function loaded(packages) {
        const el = page(packages);
        el._loaded = true;
        el._loadConfiguredServices = vi.fn().mockResolvedValue();
        return el;
    }

    it('while a card shows "Restart required": its service may have restarted since', () => {
        const el = loaded([{ ...MPD, status: 'installed', restart_needed: true }, SHAIRPORT]);
        el._handleTabChanged({ active: 'audio-software' });
        expect(el._loadPackages).toHaveBeenCalledOnce();
    });

    it('not otherwise', () => {
        const el = loaded([{ ...MPD, status: 'installed' }, SHAIRPORT]);
        el._handleTabChanged({ active: 'audio-software' });
        expect(el._loadPackages).not.toHaveBeenCalled();
    });
});

describe('the restart button', () => {
    /** Press "Restart required" on a card, as the card dispatches it. */
    const press = (el, pkg) => el._handleRestartService(
        { detail: { packageId: pkg.id, serviceUnit: pkg.service_unit } });

    /** The page, the package's card showing the badge. */
    const owing = pkg => page([{ ...pkg, status: 'installed', restart_needed: true }]);

    it('restarts the unit, not the package\'s key in audio-config.json', async () => {
        // "Service 'airplay.service' is not managed by Audiogravity" (2026-11-11).
        apiPost.mockResolvedValue({ success: true, message: 'ok' });
        await press(owing(SHAIRPORT), SHAIRPORT);
        expect(apiPost).toHaveBeenCalledExactlyOnceWith('/services/shairport-sync.service/restart');
        expect(showToast).toHaveBeenCalledWith('success', 'Service restarted',
            'Shairport Sync is running again.');
    });

    it('asks the core first whether the restart is still owed', async () => {
        apiPost.mockResolvedValue({ success: true, message: 'ok' });
        const el = owing(MPD);
        coreDescribes(el, [{ ...MPD, status: 'installed', restart_needed: true }]);
        await press(el, MPD);
        expect(el._loadPackages.mock.invocationCallOrder[0])
            .toBeLessThan(apiPost.mock.invocationCallOrder[0]);
    });

    it('restarts nothing another device already restarted', async () => {
        // Pressed on both, the service restarted twice: the music cut twice.
        const el = owing(MPD);
        coreDescribes(el, [{ ...MPD, status: 'installed', restart_needed: false }]);
        await press(el, MPD);
        expect(apiPost).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledExactlyOnceWith('info', 'No restart needed',
            'MPD needs no restart any more.');
        expect(badged(el, 'mpd')).toBe(false);
    });

    it('restarts when the listing could only be read from before going offline', async () => {
        apiPost.mockResolvedValue({ success: true, message: 'ok' });
        const el = owing(MPD);
        coreDescribes(el, [{ ...MPD, status: 'installed', restart_needed: false }]);
        el.packagesFetch.stale = true;
        await press(el, MPD);
        expect(apiPost).toHaveBeenCalledExactlyOnceWith('/services/mpd.service/restart');
    });

    it('says so when the core could not restart the service', async () => {
        apiPost.mockResolvedValue({ success: false, message: 'Action restart failed: timed out' });
        const el = owing(MPD);
        await press(el, MPD);
        expect(showToast).toHaveBeenCalledWith('error', 'Service Restart Failed',
            'Action restart failed: timed out');
        expect(badged(el, 'mpd')).toBe(true);  // still owed
    });

    it('names the package when the core gives no reason', async () => {
        apiPost.mockResolvedValue({ success: false });
        await press(owing(MPD), MPD);
        expect(showToast).toHaveBeenCalledWith('error', 'Service Restart Failed',
            'MPD could not be restarted');
    });

    it('clears the badge once it worked', async () => {
        apiPost.mockResolvedValue({ success: true, message: 'ok' });
        const el = owing(MPD);
        await press(el, MPD);
        expect(badged(el, 'mpd')).toBe(false);
        expect(showToast.mock.calls[0][0]).toBe('success');
    });
});

describe('the badges this browser kept', () => {
    it('are dropped once: the core holds them now', () => {
        // The one Shairport Sync's card kept on an iPhone after its update (2026-11-11).
        localStorage.setItem('softwareRestartNeeded', JSON.stringify(['airplay']));
        const el = document.createElement('ag-audio-software-page');
        expect(localStorage.getItem('softwareRestartNeeded')).toBeNull();
        expect(badged(el, 'airplay')).toBe(false);
    });
});

describe('update all', () => {
    /** Run "Update all" with the confirmation accepted and the core's results. */
    async function updateAll(results, simulated = false, listing = null) {
        const el = page([
            { ...HQPLAYERD, status: 'installed', installed_version: '6.0.2-3', available_version: '6.1.0-1' },
            { ...MPD, status: 'installed', installed_version: '0.24.4-1', available_version: '0.24.5-1' },
        ]);
        if (listing) coreDescribes(el, listing);
        el.dryRun = simulated;
        window.showConfirm = vi.fn().mockResolvedValue(true);
        apiPost.mockResolvedValue(results);
        await el._handleUpdateAll();
        return el;
    }

    it('says an update whose next step was left is incomplete, with what is left', async () => {
        await updateAll([
            { success: true, warning: true, package_id: 'hqplayerd',
              message: 'HQPlayer Embedded is updated, but its log is still written to its default place' },
            { success: true, package_id: 'mpd', message: 'Successfully updated MPD' },
        ]);
        const last = showToast.mock.calls.at(-1);
        expect(last[0]).toBe('warning');
        expect(last[1]).toBe('Updates Incomplete');
        expect(last[2]).toContain('its log is still written to its default place');
    });

    it('says "Updates complete" for updates with nothing left', async () => {
        await updateAll([
            { success: true, package_id: 'hqplayerd', message: 'Successfully updated HQPlayer Embedded' },
            { success: true, package_id: 'mpd', message: 'Successfully updated MPD' },
        ]);
        expect(showToast.mock.calls.at(-1)).toEqual(['success', 'Updates complete', '2 packages updated.']);
    });

    it('shows the restart badges the core gives with the packages read again', async () => {
        const el = await updateAll([
            { success: true, restart_needed: false, package_id: 'hqplayerd',
              message: 'Successfully updated HQPlayer Embedded' },
            { success: true, restart_needed: true, package_id: 'mpd', message: 'Successfully updated MPD' },
        ], false, [
            { ...HQPLAYERD, status: 'installed', restart_needed: false },
            { ...MPD, status: 'installed', restart_needed: true },
        ]);
        expect([badged(el, 'hqplayerd'), badged(el, 'mpd')]).toEqual([false, true]);
    });
});

describe('setting the web interface password from the card', () => {
    it('opens the dialog on the package', () => {
        const el = page();
        el._handleSetWebPassword({ detail: { packageId: 'hqplayerd' } });
        expect(el._webPasswordDialogFor.id).toBe('hqplayerd');
    });

    it('sends the password in the body, never in the URL', async () => {
        apiPost.mockResolvedValue({ success: true, message: "HQPlayer Embedded's web interface password is set" });
        const el = page();
        el._webPasswordDialogFor = el.packages[0];
        await el._handleWebPasswordConfirmed({ detail: { packageId: 'hqplayerd', webPassword: 'MyOwnPass42' } });
        const [url, body] = apiPost.mock.calls[0];
        expect(url).toBe('/packages/hqplayerd/web_password');
        expect(url).not.toContain('MyOwnPass42');
        expect(body).toEqual({ web_password: 'MyOwnPass42' });
        expect(el._webPasswordDialogFor).toBeNull();
        expect(showToast.mock.calls[0][0]).toBe('success');
        expect(el._loadPackages).toHaveBeenCalled();  // the card stops offering it
    });

    it('says why it was not set', async () => {
        apiPost.mockResolvedValue({ success: false, message: 'HQPlayer Embedded: its web interface password could not be set' });
        const el = page();
        await el._handleWebPasswordConfirmed({ detail: { packageId: 'hqplayerd', webPassword: 'MyOwnPass42' } });
        expect(showToast).toHaveBeenCalledWith('error', 'Web Password Not Set',
            'HQPlayer Embedded: its web interface password could not be set');
    });

    it('shows the restart badge the core gives when the restart after it failed', async () => {
        apiPost.mockResolvedValue({ success: true, warning: true, restart_needed: true,
            message: "HQPlayer Embedded's web interface password is set, but its new settings only take effect once hqplayerd.service restarts" });
        const el = page();
        coreDescribes(el, [{ ...HQPLAYERD, status: 'installed', restart_needed: true }]);
        await el._handleWebPasswordConfirmed({ detail: { packageId: 'hqplayerd', webPassword: 'MyOwnPass42' } });
        expect(badged(el, 'hqplayerd')).toBe(true);
        expect(showToast.mock.calls[0][0]).toBe('warning');
    });
});

describe('one toast for an operation in progress, which becomes its outcome', () => {
    /** A handle of its own, to tell an update of the notice from a toast added under it. */
    function notice() {
        const handle = { update: vi.fn(), close: vi.fn() };
        showToast.mockReturnValueOnce(handle);
        return handle;
    }

    it('turns "Checking for updates" into the number of updates found', async () => {
        const checking = notice();
        apiGet.mockResolvedValue([
            { ...HQPLAYERD, installed_version: '6.0.2-3', available_version: '6.1.0-1' },
            { ...MPD, installed_version: '0.24.5-1', available_version: '0.24.5-1' },
        ]);
        await page()._checkAllUpdates();
        expect(showToast).toHaveBeenCalledExactlyOnceWith('info', 'Checking for updates', 'Every package is being checked…', 0);
        expect(checking.update).toHaveBeenCalledExactlyOnceWith('success', 'Updates checked', '1 update is available.');
    });

    it('says when every package is at its latest version', async () => {
        apiGet.mockResolvedValue([{ ...MPD, installed_version: '0.24.5-1', available_version: '0.24.5-1' }]);
        await page()._checkAllUpdates();
        expect(showToast.mock.calls.at(-1)).toEqual(['success', 'Updates checked', 'Every package is at its latest version.']);
    });

    it('turns it into the reason when the check fails', async () => {
        const checking = notice();
        apiGet.mockRejectedValue(Object.assign(new Error('x'), { status: 502, detail: 'The vendor did not answer' }));
        await page()._checkAllUpdates();
        expect(checking.update).toHaveBeenCalledExactlyOnceWith('error', 'Updates not checked', 'The vendor did not answer');
    });

    it('turns "Updating packages" into what the run came to', async () => {
        const updating = notice();
        const el = page([{ ...MPD, status: 'installed', installed_version: '0.24.4-1', available_version: '0.24.5-1' }]);
        window.showConfirm = vi.fn().mockResolvedValue(true);
        apiPost.mockResolvedValue([{ success: true, package_id: 'mpd', message: 'Successfully updated MPD' }]);
        await el._handleUpdateAll();
        expect(showToast).toHaveBeenCalledExactlyOnceWith('info', 'Updating packages', '1 package, one after the other…', 0);
        expect(updating.update).toHaveBeenCalledExactlyOnceWith('success', 'Updates complete', '1 package updated.');
    });

    it('turns "Refreshing" into the core\'s answer', async () => {
        const refreshing = notice();
        apiPost.mockResolvedValue({ success: true, message: '7 packages from 3 sources' });
        await page()._refreshConfig();
        expect(refreshing.update).toHaveBeenCalledExactlyOnceWith('success', 'Refreshed', '7 packages from 3 sources');
    });
});
