/**
 * Tests for the Settings panel's Face ID / Touch ID devices: the X of a device's chip
 * removes that device's passkey, and says so.
 *
 * Rendered for real, like ag-config-panel.push.test.js. The chip's X called a method that
 * had been removed as unused, on a search cut short: a TypeError at the press, for as long
 * as nobody pressed it (caught by the code review of the toasts, 2026-10-27).
 * js/private-members.test.js now guards the whole app against that kind of removal; this
 * guards what the X does. webauthn.js, which talks to the browser, and the two requests to
 * the box are stood in for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Partial: common.js calls initAuth as it loads, so the real module must stay.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    // common.js gates its own module load on this and throws otherwise.
    requireAuth: () => true,
}));
vi.mock(import('../../ui-helpers.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    showToast: vi.fn(),
}));
vi.mock(import('../../api.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    apiGet: vi.fn(),
    apiDelete: vi.fn(),
}));
vi.mock('../../webauthn.js', () => ({
    isWebAuthnAvailable: () => true,
    registerPasskey: vi.fn(),
}));

import { showToast } from '../../ui-helpers.js';
import { apiGet, apiDelete } from '../../api.js';
import './ag-config-panel.js';

/** The devices the box knows, as GET /auth/webauthn/credentials lists them. */
let devices;

/** Open the panel, which reads the devices, and wait for their chips. */
async function openPanel() {
    const el = document.createElement('ag-config-panel');
    document.body.appendChild(el);
    await el.updateComplete;
    el.active = true;
    await settle(el);
    return el;
}

/** Let the panel's requests end and its render follow. */
async function settle(panel) {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await panel.updateComplete;
}

/** The X of the chip that names a device. */
function removeButton(panel, name) {
    const chip = [...panel.querySelectorAll('.passkey-device-chip')].find((c) => c.textContent.includes(name));
    return chip?.querySelector('.passkey-chip-delete');
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '0.0.0-test' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    devices = [
        { credential_id: 'cred-phone', device_name: 'iPhone / iPad' },
        { credential_id: 'cred-android', device_name: 'Android' },
    ];
    // The panel also asks the core's version as it opens.
    apiGet.mockImplementation(async (url) => (url === '/auth/webauthn/credentials' ? devices : { version: '0.0.0-test' }));
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

describe('Settings — Face ID / Touch ID devices', () => {
    it('the X of a device removes its passkey, says which device, and the chip goes', async () => {
        const panel = await openPanel();
        apiDelete.mockImplementation(async () => {
            devices = devices.filter((d) => d.credential_id !== 'cred-phone');
        });

        removeButton(panel, 'iPhone / iPad').click();
        await settle(panel);

        expect(apiDelete).toHaveBeenCalledWith('/auth/webauthn/credentials/cred-phone', false);
        expect(showToast).toHaveBeenCalledWith('success', 'Passkey removed', 'iPhone / iPad can no longer sign you in.');
        expect(removeButton(panel, 'iPhone / iPad')).toBeUndefined();
        expect(removeButton(panel, 'Android')).toBeTruthy();
    });

    it('a refusal says why, and the device stays', async () => {
        const panel = await openPanel();
        apiDelete.mockRejectedValue(new Error('The credential is in use'));

        removeButton(panel, 'Android').click();
        await settle(panel);

        expect(showToast).toHaveBeenCalledWith('error', 'Passkey not removed', 'The credential is in use');
        expect(removeButton(panel, 'Android')).toBeTruthy();
    });
});
