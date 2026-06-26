/**
 * @module PushManager
 * @description Manages Web Push active subscriptions and UI state.
 */

import { EventEmitter } from './common.js';
import { apiGet, apiPost, apiDelete } from './api.js';

let swRegistration = null;
let isSubscribed = false;

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
 */
async function getPublicKey() {
    const data = await apiGet('/push/vapid-public-key');
    if (!data?.public_key) throw new Error('VAPID public key missing in response');
    return data.public_key;
}

/**
 * Subscribe user to push notifications
 */
async function subscribeUser() {
    try {
        const publicKey = await getPublicKey();
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        console.log('[Push] Browser subscribed:', subscription);

        // Destructure explicitly rather than passing the PushSubscription browser
        // object directly — PushSubscription.toJSON() is stable today but the
        // browser interface could change, and plain objects are easier to test.
        const sub = subscription.toJSON();
        await apiPost('/push/subscribe', { endpoint: sub.endpoint, keys: sub.keys });
        
        isSubscribed = true;
        EventEmitter.emit('push-status-changed', { isSubscribed });
        console.log('[Push] Successfully subscribed on server');
        return true;
    } catch (err) {
        console.error('[Push] Subscription failed:', err);
        return false;
    }
}

/**
 * Unsubscribe user
 */
async function unsubscribeUser() {
    try {
        const subscription = await swRegistration.pushManager.getSubscription();
        if (subscription) {
            await subscription.unsubscribe();
            
            // Notify backend — DELETE with endpoint as query param (matches backend router)
            const params = new URLSearchParams({ endpoint: subscription.endpoint });
            await apiDelete(`/push/unsubscribe?${params}`);
        }
        
        isSubscribed = false;
        EventEmitter.emit('push-status-changed', { isSubscribed });
        console.log('[Push] Successfully unsubscribed');
        return true;
    } catch (err) {
        console.error('[Push] Unsubscription failed:', err);
        return false;
    }
}

/**
 * Toggle subscription status
 */
export async function toggleSubscription() {
    if (isSubscribed) {
        return await unsubscribeUser();
    } else {
        return await subscribeUser();
    }
}

export function getPushStatus() {
    return isSubscribed;
}
