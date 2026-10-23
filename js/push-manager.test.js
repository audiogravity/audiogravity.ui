/**
 * Unit tests for push-manager.js: turning this device's notifications on — proved by
 * the box's test notification — and off, and the words for each way it can fail.
 *
 * The browser's push machinery (service worker registration, PushManager,
 * Notification) is stood in for; the module itself is the real one, imported afresh
 * for each test since it holds this device's state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./api.js', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiDelete: vi.fn(),
}));

vi.mock('./common.js', () => ({
    EventEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

const ENDPOINT = 'https://push/phone';

/** A VAPID public key as the core gives it: an uncompressed P-256 point, base64url. */
const KEY = btoa(String.fromCharCode(4, ...new Array(64).fill(7)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A refusal from the box, in the shape api.js throws. */
function refusal(status, detail) {
    return Object.assign(new Error(detail || `HTTP ${status}`), { status, detail });
}

/**
 * A browser able to subscribe, holding `existing` already.
 * @returns {{subscription: object, pushManager: object}}
 */
function browser({ permission = 'default', existing = null } = {}) {
    const subscription = {
        endpoint: ENDPOINT,
        toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } }),
        unsubscribe: vi.fn().mockResolvedValue(true),
    };
    const pushManager = {
        getSubscription: vi.fn().mockResolvedValue(existing),
        subscribe: vi.fn().mockResolvedValue(subscription),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({ pushManager }) }, configurable: true,
    });
    window.PushManager = function PushManager() {};
    window.Notification = { permission };
    return { subscription, pushManager };
}

let api;
let EventEmitter;

/** The module afresh, initialised against the browser in place. */
async function manager({ init = true } = {}) {
    const mod = await import('./push-manager.js');
    if (init) await mod.initPushManager();
    return mod;
}

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    api = await import('./api.js');
    ({ EventEmitter } = await import('./common.js'));
    api.apiGet.mockResolvedValue({ public_key: KEY });
    api.apiPost.mockResolvedValue({ success: true });
    api.apiDelete.mockResolvedValue({ success: true });
});

afterEach(() => {
    delete navigator.serviceWorker;
    delete window.PushManager;
    delete window.Notification;
});

/** Turn the switch, and say how it went: the error, or nothing. */
async function toggle(mod) {
    try {
        await mod.toggleSubscription();
        return null;
    } catch (err) {
        return err;
    }
}

describe('push-manager — turning notifications on', () => {
    it('subscribes, then has the box send this device the test notification', async () => {
        browser();
        const mod = await manager();
        expect(await mod.toggleSubscription()).toEqual({ subscribed: true, tested: true });

        expect(api.apiPost).toHaveBeenNthCalledWith(1, '/push/subscribe',
            { endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } });
        // Not retried: a test the box answered too late would push twice.
        expect(api.apiPost).toHaveBeenNthCalledWith(2, '/push/test', { endpoint: ENDPOINT }, false);
        expect(mod.getPushStatus()).toBe(true);
        expect(EventEmitter.emit).toHaveBeenCalledWith('push-status-changed', { isSubscribed: true });
    });

    it('is unavailable where the browser has no push — over HTTP, or an iPhone tab', async () => {
        const mod = await manager();        // no service worker, no PushManager
        const err = await toggle(mod);

        expect(err.name).toBe('PushSetupError');
        expect(err.title).toBe('Notifications unavailable here');
        expect(err.message).toMatch(/HTTPS/);
        expect(err.message).toMatch(/Home Screen/);
        expect(api.apiGet).not.toHaveBeenCalled();
        expect(mod.getPushStatus()).toBe(false);
    });

    it('waits for a worker still installing — a first visit — rather than call it unavailable', async () => {
        const { pushManager } = browser();
        let ready;
        Object.defineProperty(navigator, 'serviceWorker', {
            value: { ready: new Promise((resolve) => { ready = resolve; }) }, configurable: true,
        });
        const mod = await manager({ init: false });
        const turning = mod.toggleSubscription();
        setTimeout(() => ready({ pushManager }), 50);

        expect(await turning).toEqual({ subscribed: true, tested: true });
    });

    it('calls it unavailable once a worker that never comes has been waited for', async () => {
        // The dev server unregisters its worker: `ready` never settles there.
        vi.useFakeTimers();
        try {
            browser();
            Object.defineProperty(navigator, 'serviceWorker', {
                value: { ready: new Promise(() => {}) }, configurable: true,
            });
            const mod = await manager({ init: false });
            const turning = toggle(mod);
            await vi.advanceTimersByTimeAsync(mod.SW_READY_WAIT_MS);

            expect((await turning).title).toBe('Notifications unavailable here');
            expect(api.apiGet).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('says notifications are blocked, before asking the box anything', async () => {
        browser({ permission: 'denied' });
        const err = await toggle(await manager());

        expect(err.title).toBe('Notifications blocked');
        expect(err.message).toMatch(/Settings → Notifications → Audiogravity/);
        expect(api.apiGet).not.toHaveBeenCalled();
    });

    it('says notifications are blocked when the prompt is refused', async () => {
        const { pushManager } = browser();
        pushManager.subscribe.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
        const err = await toggle(await manager());
        expect(err.title).toBe('Notifications blocked');
    });

    it('says the box has no keys', async () => {
        browser();
        api.apiGet.mockRejectedValue(refusal(503, 'VAPID keys not configured. Run generate_vapid_keys.py'));
        const err = await toggle(await manager());

        expect(err.title).toBe('The box cannot send notifications');
        expect(err.message).toMatch(/Reinstalling the core/);
    });

    it('subscribes with the key the box gave', async () => {
        const { pushManager } = browser();
        await (await manager()).toggleSubscription();

        const { userVisibleOnly, applicationServerKey } = pushManager.subscribe.mock.calls[0][0];
        expect(userVisibleOnly).toBe(true);
        expect(applicationServerKey.length).toBe(65);
        expect(applicationServerKey[0]).toBe(4);
    });

    it('says the box gave a key that cannot be read, rather than blame the browser', async () => {
        const { pushManager } = browser();
        api.apiGet.mockResolvedValue({ public_key: 'not*base64' });
        const err = await toggle(await manager());

        expect(err.title).toBe('The box cannot send notifications');
        expect(err.message).toMatch(/unreadable/);
        expect(pushManager.subscribe).not.toHaveBeenCalled();
    });

    it('says the box did not answer', async () => {
        browser();
        api.apiGet.mockRejectedValue(new Error('Failed to fetch'));
        const err = await toggle(await manager());

        expect(err.title).toBe('Notifications not turned on');
        expect(err.message).toBe('The box did not answer: Failed to fetch.');
    });

    it("says the browser's own notification service failed it", async () => {
        const { pushManager } = browser();
        pushManager.subscribe.mockRejectedValue(
            Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' }));
        const err = await toggle(await manager());

        expect(err.title).toBe('Notifications not turned on');
        expect(err.message).toMatch(/Registration failed - push service error/);
    });

    it('undoes the browser subscription the box refused', async () => {
        const { subscription } = browser();
        api.apiPost.mockRejectedValueOnce(refusal(409, 'Subscription cap reached (200)'));
        const mod = await manager();
        const err = await toggle(mod);

        expect(err.message).toBe('The box refused this device: Subscription cap reached (200).');
        expect(subscription.unsubscribe).toHaveBeenCalled();
        expect(mod.getPushStatus()).toBe(false);
    });

    it('undoes both sides when the test notification does not go out, in the box\'s words', async () => {
        const { subscription } = browser();
        api.apiPost
            .mockResolvedValueOnce({ success: true })
            .mockRejectedValueOnce(refusal(502, "This device's notification service refused the test notification (HTTP 403)."));
        const mod = await manager();
        const err = await toggle(mod);

        expect(err.title).toBe('Test notification not delivered');
        expect(err.message).toBe("This device's notification service refused the test notification (HTTP 403).");
        expect(subscription.unsubscribe).toHaveBeenCalled();
        expect(api.apiDelete).toHaveBeenCalledWith(
            `/push/unsubscribe?${new URLSearchParams({ endpoint: ENDPOINT })}`);
        expect(mod.getPushStatus()).toBe(false);
        expect(EventEmitter.emit).not.toHaveBeenCalledWith('push-status-changed', { isSubscribed: true });
    });

    it('keeps the subscription on a core too old to have the test, and says it was not tested', async () => {
        // The app and the core are installed apart: a newer app meets a core without the
        // route, which answers FastAPI's own 404 — as it was before there was a test.
        const { subscription } = browser();
        api.apiPost
            .mockResolvedValueOnce({ success: true })
            .mockRejectedValueOnce(refusal(404, 'Not Found'));
        const mod = await manager();

        expect(await mod.toggleSubscription()).toEqual({ subscribed: true, tested: false });
        expect(subscription.unsubscribe).not.toHaveBeenCalled();
        expect(api.apiDelete).not.toHaveBeenCalled();
        expect(mod.getPushStatus()).toBe(true);
    });

    it("undoes it on the test route's own 404 — the box does not know this device", async () => {
        const { subscription } = browser();
        api.apiPost
            .mockResolvedValueOnce({ success: true })
            .mockRejectedValueOnce(refusal(404, "This device is not subscribed to the box's notifications."));
        const mod = await manager();
        const err = await toggle(mod);

        expect(err.title).toBe('Test notification not delivered');
        expect(subscription.unsubscribe).toHaveBeenCalled();
        expect(mod.getPushStatus()).toBe(false);
    });
});

describe('push-manager — turning notifications off', () => {
    it('undoes the subscription, and tells the box which one', async () => {
        const { subscription } = browser();
        browser({ existing: subscription });
        const mod = await manager();
        expect(mod.getPushStatus()).toBe(true);

        expect(await mod.toggleSubscription()).toEqual({ subscribed: false });
        expect(subscription.unsubscribe).toHaveBeenCalled();
        // DELETE with the endpoint as a query parameter, as the core's route reads it.
        expect(api.apiDelete).toHaveBeenCalledWith(
            `/push/unsubscribe?${new URLSearchParams({ endpoint: ENDPOINT })}`);
        expect(mod.getPushStatus()).toBe(false);
    });

    it('is off even when the box does not hear of it: nothing can reach the device', async () => {
        const { subscription } = browser();
        browser({ existing: subscription });
        api.apiDelete.mockRejectedValue(new Error('Failed to fetch'));
        const mod = await manager();

        expect(await mod.toggleSubscription()).toEqual({ subscribed: false });
    });

    it('stays on when the browser cannot undo it, and says so', async () => {
        const { subscription } = browser();
        subscription.unsubscribe.mockRejectedValue(new Error('InvalidStateError'));
        browser({ existing: subscription });
        const mod = await manager();
        const err = await toggle(mod);

        expect(err.title).toBe('Notifications still on');
        expect(mod.getPushStatus()).toBe(true);
    });
});

describe('push-manager — this device\'s endpoint', () => {
    it('is the subscription\'s', async () => {
        const { subscription } = browser();
        browser({ existing: subscription });
        expect(await (await manager()).getPushEndpoint()).toBe(ENDPOINT);
    });

    it('is none when not subscribed', async () => {
        browser();
        expect(await (await manager()).getPushEndpoint()).toBeNull();
    });

    it('is none where push does not exist', async () => {
        expect(await (await manager()).getPushEndpoint()).toBeNull();
    });
});
