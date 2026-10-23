/**
 * @module PushManager
 * @description This device's push subscription: turning it on — proved by a test
 * notification from the box — and off, and why either did not work, in words the
 * Settings panel shows as they are.
 */

import { EventEmitter } from './common.js';
import { apiGet, apiPost, apiDelete } from './api.js';

let swRegistration = null;
let isSubscribed = false;

/**
 * Why this device's notifications could not be turned on or off: a heading and a
 * message, both for the user — what happened, and what to do about it.
 */
export class PushSetupError extends Error {
    /**
     * @param {string} title - The toast's heading.
     * @param {string} message - What happened, and what to do about it.
     */
    constructor(title, message) {
        super(message);
        this.name = 'PushSetupError';
        this.title = title;
    }
}

/** The heading of a failure to turn notifications on. */
const NOT_ON = 'Notifications not turned on';

/**
 * How long turning notifications on waits for the service worker, at a first visit
 * where it is still being installed. A page that never registers one — the dev
 * server, a browser without push — is told "unavailable" once it is over.
 */
export const SW_READY_WAIT_MS = 5000;

/**
 * Helper to convert Base64URL to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * What an error from the box says, for a message: its detail, else its own words.
 * @param {Error & {detail?: string}} err
 * @returns {string}
 */
function said(err) {
    return err?.detail || err?.message || 'no answer';
}

/**
 * Whether the box has no such route at all — FastAPI's own 404, not the test route's
 * "not subscribed". The app and the core are installed apart: an app newer than its
 * core meets a core without POST /push/test.
 * @param {Error & {status?: number, detail?: string}} err
 * @returns {boolean}
 */
function noSuchRoute(err) {
    return err?.status === 404 && err?.detail === 'Not Found';
}

/**
 * Initialize Push Manager
 */
export async function initPushManager() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported');
        return;
    }

    try {
        swRegistration = await navigator.serviceWorker.ready;
        const subscription = await swRegistration.pushManager.getSubscription();
        isSubscribed = !!subscription;

        console.log('[Push] Initialized, isSubscribed:', isSubscribed);
        EventEmitter.emit('push-status-changed', { isSubscribed });
    } catch (err) {
        console.error('[Push] Initialization failed:', err);
    }
}

/**
 * Get the VAPID public key from the backend.
 * @returns {Promise<string>} Base64URL-encoded VAPID public key.
 * @throws {PushSetupError} The box has no keys, or did not answer.
 */
async function getPublicKey() {
    let data;
    try {
        data = await apiGet('/push/vapid-public-key');
    } catch (err) {
        if (err?.status === 503) {
            throw new PushSetupError('The box cannot send notifications',
                'Its notification keys are missing. Reinstalling the core creates them.');
        }
        throw new PushSetupError(NOT_ON, `The box did not answer: ${said(err)}.`);
    }
    if (!data?.public_key) {
        throw new PushSetupError('The box cannot send notifications',
            'It gave no notification key. Reinstalling the core creates one.');
    }
    return data.public_key;
}

/**
 * The service worker registration push needs, waited for a while if it is not ready.
 *
 * initPushManager takes it when the worker is ready; a switch turned before that — the
 * first visit, while the worker installs — used to find none, and fail.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>} None where push cannot be had.
 */
async function registration() {
    if (swRegistration) return swRegistration;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), SW_READY_WAIT_MS); });
    try {
        swRegistration = await Promise.race([navigator.serviceWorker.ready, late]);
    } finally {
        clearTimeout(timer);
    }
    return swRegistration;
}

/**
 * Subscribe this device, then have the box send it the test notification.
 *
 * Nothing is left half done: when the box refuses the subscription, or its test does
 * not go out, the browser's subscription is undone and the box's too — on means the
 * box has reached this device once. A core too old to have the test is the one
 * exception: the subscription stays, as it did before there was a test.
 *
 * @returns {Promise<boolean>} Whether the test notification went out — false only
 *   on a core that has no test to send.
 * @throws {PushSetupError} Why it did not work, in the user's words.
 */
async function subscribeUser() {
    if (!(await registration())) {
        throw new PushSetupError('Notifications unavailable here',
            'This browser cannot receive notifications from the box here. They need the app '
            + 'opened over HTTPS — and on an iPhone or iPad, installed on the Home Screen and '
            + 'opened from there.');
    }
    if (window.Notification?.permission === 'denied') throw blocked();

    let applicationServerKey;
    try {
        applicationServerKey = urlBase64ToUint8Array(await getPublicKey());
    } catch (err) {
        if (err instanceof PushSetupError) throw err;
        throw new PushSetupError('The box cannot send notifications',
            'Its notification key is unreadable. Reinstalling the core creates a new one.');
    }

    let subscription;
    try {
        subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
        });
    } catch (err) {
        if (err?.name === 'NotAllowedError') throw blocked();
        throw new PushSetupError(NOT_ON,
            `This browser could not register with its notification service (${said(err)}).`);
    }

    // Destructure explicitly rather than passing the PushSubscription browser
    // object directly — PushSubscription.toJSON() is stable today but the
    // browser interface could change, and plain objects are easier to test.
    const sub = subscription.toJSON();
    try {
        await apiPost('/push/subscribe', { endpoint: sub.endpoint, keys: sub.keys });
    } catch (err) {
        await subscription.unsubscribe().catch(() => {});
        throw new PushSetupError(NOT_ON, `The box refused this device: ${said(err)}.`);
    }

    let tested = true;
    try {
        // Not retried: a request the box answered too late would push twice.
        await apiPost('/push/test', { endpoint: sub.endpoint }, false);
    } catch (err) {
        if (!noSuchRoute(err)) {
            await subscription.unsubscribe().catch(() => {});
            await apiDelete(`/push/unsubscribe?${new URLSearchParams({ endpoint: sub.endpoint })}`)
                .catch(() => {});
            throw new PushSetupError('Test notification not delivered', said(err));
        }
        tested = false;
    }

    isSubscribed = true;
    EventEmitter.emit('push-status-changed', { isSubscribed });
    console.log(tested ? '[Push] Subscribed, test notification sent'
        : '[Push] Subscribed; this core has no test notification');
    return tested;
}

/**
 * The failure of a site whose notifications the user (or the device) refused.
 * @returns {PushSetupError}
 */
function blocked() {
    return new PushSetupError('Notifications blocked',
        "Notifications are blocked for this site on this device. Allow them in the browser's "
        + 'site settings — on an iPhone or iPad, in Settings → Notifications → Audiogravity — '
        + 'then turn the switch on again.');
}

/**
 * Unsubscribe this device.
 *
 * The browser's subscription is what lets the box reach this device: once it is
 * undone, nothing more arrives, whether or not the box heard of it — a box left
 * holding it forgets it at its next push, which the push service refuses.
 *
 * @returns {Promise<void>}
 * @throws {PushSetupError} The browser could not undo its subscription.
 */
async function unsubscribeUser() {
    let subscription = null;
    try {
        subscription = await swRegistration?.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
    } catch (err) {
        throw new PushSetupError('Notifications still on',
            `This device could not be unsubscribed (${said(err)}).`);
    }
    if (subscription) {
        // Notify backend — DELETE with endpoint as query param (matches backend router)
        const params = new URLSearchParams({ endpoint: subscription.endpoint });
        await apiDelete(`/push/unsubscribe?${params}`).catch((err) => {
            console.warn('[Push] The box did not hear of the unsubscription:', err);
        });
    }

    isSubscribed = false;
    EventEmitter.emit('push-status-changed', { isSubscribed });
    console.log('[Push] Successfully unsubscribed');
}

/**
 * Turn this device's notifications on (with the test notification) or off.
 * @returns {Promise<{subscribed: boolean, tested?: boolean}>} The state now; turned
 *   on, whether the test notification went out (false: a core without the test).
 * @throws {PushSetupError} Why it did not work; the state is then what it was.
 */
export async function toggleSubscription() {
    if (isSubscribed) {
        await unsubscribeUser();
        return { subscribed: isSubscribed };
    }
    const tested = await subscribeUser();
    return { subscribed: isSubscribed, tested };
}

export function getPushStatus() {
    return isSubscribed;
}

/**
 * This device's push endpoint, sent with a change this device makes, so the
 * notification of that change goes to the other devices only.
 * @returns {Promise<string|null>} The endpoint, or null when not subscribed.
 */
export async function getPushEndpoint() {
    try {
        const subscription = await swRegistration?.pushManager.getSubscription();
        return subscription?.endpoint ?? null;
    } catch {
        return null;
    }
}
