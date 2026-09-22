/**
 * Unit tests for ag-audio-software-page.js — what the page does with the core's answers.
 *
 * - The "Restart required" badge: never for a package the core restarts itself
 *   (`restarts_after_install`) — it said so about HQPlayer Embedded seconds
 *   after the core had restarted it, and a click cut the music for nothing —
 *   unless the action's result says that restart failed (`restart_needed`).
 * - The restart button reads `success`: the route answers 200 with
 *   `success: false`, and "restarted successfully" was shown anyway.
 * - "Update all" reads `warning`: it said "All Updates Complete" about an
 *   update whose next step was left, and the core's message was lost.
 * - A web interface password is set on an installed package from its card,
 *   in the request body.
 *
 * Kept apart from ag-audio-software-page.test.js because it replaces
 * common.js's network and toast functions, which the other file uses for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiPost, showToast } = vi.hoisted(() => ({ apiPost: vi.fn(), showToast: vi.fn() }));

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
    addToHistory: vi.fn(),
}));

import { AgAudioSoftwarePage } from './ag-audio-software-page.js';

const HQPLAYERD = {
    id: 'hqplayerd', label: 'HQPlayer Embedded', service_id: 'hqplayerd',
    status: 'installing', restarts_after_install: true,
    web_credentials: { username: 'hqplayer', port: 8088, already_set: false },
};
const MPD = { id: 'mpd', label: 'MPD', service_id: 'mpd', status: 'updating',
    restarts_after_install: false };

/** A page instance with the parts that touch the DOM or timers stubbed out. */
function page(packages = [HQPLAYERD, MPD]) {
    const el = Object.create(AgAudioSoftwarePage.prototype);
    // Own data properties: the Lit setters need state only the constructor makes.
    for (const [name, value] of Object.entries({
        dryRun: false, packages: packages.map(p => ({ ...p })),
        _installDialogFor: null, _uninstallDialogFor: null, _webPasswordDialogFor: null,
    })) {
        Object.defineProperty(el, name, { value, writable: true });
    }
    el._restartNeeded = new Set();
    el.requestUpdate = vi.fn();
    el._updateGlobalUpdateBadge = vi.fn();
    el._loadPackages = vi.fn();
    el._openLogsModal = vi.fn();
    el._startPolling = vi.fn();
    return el;
}

/** The SSE event the core sends once an operation is over. */
const installed = pkg => ({ detail: { ...pkg, status: 'installed' } });

beforeEach(() => {
    apiPost.mockReset();
    showToast.mockReset();
});

describe('the restart badge', () => {
    it('is not shown for a package the core restarts itself', () => {
        const el = page();
        el._handlePackageStateUpdate(installed(HQPLAYERD));
        expect(el._restartNeeded.has('hqplayerd')).toBe(false);
    });

    it('is still shown for a package the core does not restart', () => {
        const el = page();
        el._handlePackageStateUpdate(installed(MPD));
        expect(el._restartNeeded.has('mpd')).toBe(true);
    });

    it('is shown when the restart the core owed failed', async () => {
        apiPost.mockResolvedValue({ success: true, warning: true, restart_needed: true,
            message: 'HQPlayer Embedded is installed, but its new settings only take effect once hqplayerd.service restarts' });
        const el = page();
        await el._runPackageAction(el.packages[0], 'install', null, true, 'MyOwnPass42');
        expect(el._restartNeeded.has('hqplayerd')).toBe(true);
    });
});

describe('the restart button', () => {
    it('says so when the core could not restart the service', async () => {
        apiPost.mockResolvedValue({ success: false, message: 'Action restart failed: timed out' });
        const el = page();
        el._restartNeeded.add('mpd');
        await el._handleRestartService({ detail: { packageId: 'mpd', serviceId: 'mpd' } });
        expect(showToast).toHaveBeenCalledWith('error', 'Service Restart Failed',
            'Action restart failed: timed out');
        expect(el._restartNeeded.has('mpd')).toBe(true);  // still owed
    });

    it('clears the badge once it worked', async () => {
        apiPost.mockResolvedValue({ success: true, message: 'ok' });
        const el = page();
        el._restartNeeded.add('mpd');
        await el._handleRestartService({ detail: { packageId: 'mpd', serviceId: 'mpd' } });
        expect(el._restartNeeded.has('mpd')).toBe(false);
        expect(showToast.mock.calls[0][0]).toBe('success');
    });
});

describe('update all', () => {
    /** Run "Update all" with the confirmation accepted and the core's results. */
    async function updateAll(results) {
        const el = page([
            { ...HQPLAYERD, status: 'installed', installed_version: '6.0.2-3', available_version: '6.1.0-1' },
            { ...MPD, status: 'installed', installed_version: '0.24.4-1', available_version: '0.24.5-1' },
        ]);
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

    it('keeps "All Updates Complete" for updates with nothing left', async () => {
        await updateAll([
            { success: true, package_id: 'hqplayerd', message: 'Successfully updated HQPlayer Embedded' },
            { success: true, package_id: 'mpd', message: 'Successfully updated MPD' },
        ]);
        expect(showToast.mock.calls.at(-1).slice(0, 2)).toEqual(['success', 'All Updates Complete']);
    });

    it('shows the restart badge where the restart failed', async () => {
        const el = await updateAll([
            { success: true, warning: true, restart_needed: true, package_id: 'hqplayerd',
              message: 'HQPlayer Embedded is updated, but its new settings only take effect once it restarts' },
            { success: true, package_id: 'mpd', message: 'Successfully updated MPD' },
        ]);
        expect(el._restartNeeded.has('hqplayerd')).toBe(true);
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

    it('shows the restart badge when the restart after it failed', async () => {
        apiPost.mockResolvedValue({ success: true, warning: true, restart_needed: true,
            message: "HQPlayer Embedded's web interface password is set, but its new settings only take effect once hqplayerd.service restarts" });
        const el = page();
        await el._handleWebPasswordConfirmed({ detail: { packageId: 'hqplayerd', webPassword: 'MyOwnPass42' } });
        expect(el._restartNeeded.has('hqplayerd')).toBe(true);
        expect(showToast.mock.calls[0][0]).toBe('warning');
    });
});
