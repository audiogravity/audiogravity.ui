/**
 * Tests for the Settings panel's Notifications switch: what it says, and what it shows
 * once its request is over.
 *
 * Rendered for real, like ag-config-panel.device-settings.test.js: the switch moves
 * under the finger before anything is known, and only running it shows that a failure
 * brings it back. push-manager.js, which talks to the browser and the box, is stood in
 * for — its own tests are push-manager.test.js.
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
vi.mock('../../push-manager.js', () => ({
    toggleSubscription: vi.fn(),
    getPushStatus: vi.fn(),
}));

import { showToast } from '../../ui-helpers.js';
import { toggleSubscription, getPushStatus } from '../../push-manager.js';
import './ag-config-panel.js';

/** Mount the panel and wait for its first render. */
async function mount() {
    const el = document.createElement('ag-config-panel');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/** The Notifications switch. */
function notifications(panel) {
    const row = [...panel.querySelectorAll('.config-item-row')]
        .find(r => r.querySelector('label')?.textContent.trim() === 'Notifications');
    return row.querySelector('ag-switch');
}

/** Flip a switch the way a finger does: through its checkbox. */
function flip(sw, checked) {
    const box = sw.querySelector('input[type="checkbox"]');
    box.checked = checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Let the panel's request end and both components render what follows. */
async function settle(panel, sw) {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await panel.updateComplete;
    await sw.updateComplete;
}

/** A failure as push-manager.js throws it. */
function failure(title, message) {
    return Object.assign(new Error(message), { name: 'PushSetupError', title });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '0.0.0-test' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    getPushStatus.mockReturnValue(false);
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

describe('Settings — Notifications', () => {
    it('turned on, says a test notification is on its way', async () => {
        const panel = await mount();
        const sw = notifications(panel);
        toggleSubscription.mockImplementation(async () => {
            getPushStatus.mockReturnValue(true);
            return { subscribed: true };
        });

        flip(sw, true);
        await settle(panel, sw);

        expect(showToast).toHaveBeenCalledWith('success', 'Notifications on',
            'A test notification is on its way to this device.');
        expect(sw.checked).toBe(true);
    });

    it('on a core too old to send a test, says so — and stays on', async () => {
        const panel = await mount();
        const sw = notifications(panel);
        toggleSubscription.mockImplementation(async () => {
            getPushStatus.mockReturnValue(true);
            return { subscribed: true, tested: false };
        });

        flip(sw, true);
        await settle(panel, sw);

        expect(showToast).toHaveBeenCalledWith('warning', 'Notifications on',
            expect.stringContaining('older than this app'), 8000);
        expect(showToast).not.toHaveBeenCalledWith('success', expect.anything(), expect.anything());
        expect(sw.checked).toBe(true);
    });

    it('a failure says why, and the switch goes back off', async () => {
        const panel = await mount();
        const sw = notifications(panel);
        toggleSubscription.mockRejectedValue(failure('Notifications blocked',
            'Notifications are blocked for this site on this device.'));

        flip(sw, true);
        expect(sw.checked).toBe(true);            // moved under the finger
        await settle(panel, sw);

        expect(showToast).toHaveBeenCalledWith('error', 'Notifications blocked',
            'Notifications are blocked for this site on this device.', 8000);
        expect(sw.checked).toBe(false);
        expect(sw.querySelector('input').checked).toBe(false);
    });

    it('a failure to turn them off leaves the switch on', async () => {
        getPushStatus.mockReturnValue(true);
        const panel = await mount();
        const sw = notifications(panel);
        expect(sw.checked).toBe(true);
        toggleSubscription.mockRejectedValue(failure('Notifications still on',
            'This device could not be unsubscribed (InvalidStateError).'));

        flip(sw, false);
        await settle(panel, sw);

        expect(showToast).toHaveBeenCalledWith('error', 'Notifications still on',
            'This device could not be unsubscribed (InvalidStateError).', 8000);
        expect(sw.checked).toBe(true);
    });

    it('a second turn while the first is on its way is not acted on', async () => {
        const panel = await mount();
        const sw = notifications(panel);
        let answer;
        toggleSubscription.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));

        flip(sw, true);
        flip(sw, false);
        flip(sw, true);
        expect(toggleSubscription).toHaveBeenCalledTimes(1);

        getPushStatus.mockReturnValue(true);
        answer({ subscribed: true });
        await settle(panel, sw);
        expect(sw.checked).toBe(true);
    });

    it('an error with no words of its own still says something', async () => {
        const panel = await mount();
        const sw = notifications(panel);
        toggleSubscription.mockRejectedValue(new Error(''));

        flip(sw, true);
        await settle(panel, sw);

        expect(showToast).toHaveBeenCalledWith('error', 'Notifications', 'Unknown error', 8000);
        expect(sw.checked).toBe(false);
    });
});
