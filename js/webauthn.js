/**
 * @module WebAuthn
 * @description WebAuthn / Passkey helpers — registration and authentication flows.
 *
 * All functions call the backend /auth/webauthn/* endpoints.
 * ArrayBuffer ↔ base64url conversions are handled here so callers stay clean.
 */

import { API_BASE_URL, API_KEY, API_KEY_HEADER } from './core/config.js';
import { getAuthToken } from './auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function base64urlToUint8Array(b64) {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function uint8ArrayToBase64url(bytes) {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeCredentialForServer(cred) {
    const obj = {
        id: cred.id,
        rawId: uint8ArrayToBase64url(new Uint8Array(cred.rawId)),
        type: cred.type,
        response: {}
    };

    if (cred.response.clientDataJSON)
        obj.response.clientDataJSON = uint8ArrayToBase64url(new Uint8Array(cred.response.clientDataJSON));
    if (cred.response.attestationObject)
        obj.response.attestationObject = uint8ArrayToBase64url(new Uint8Array(cred.response.attestationObject));
    if (cred.response.authenticatorData)
        obj.response.authenticatorData = uint8ArrayToBase64url(new Uint8Array(cred.response.authenticatorData));
    if (cred.response.signature)
        obj.response.signature = uint8ArrayToBase64url(new Uint8Array(cred.response.signature));
    if (cred.response.userHandle)
        obj.response.userHandle = uint8ArrayToBase64url(new Uint8Array(cred.response.userHandle));

    return obj;
}

async function webauthnFetch(endpoint, body) {
    const headers = { 'Content-Type': 'application/json', [API_KEY_HEADER]: API_KEY };
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether this browser supports WebAuthn / Passkeys.
 * @returns {boolean}
 */
export function isWebAuthnAvailable() {
    return !!(window.PublicKeyCredential && navigator.credentials?.create);
}

/**
 * Register a new passkey for the currently authenticated user.
 * @param {string} username - Authenticated user's username
 * @param {string} deviceName - Label for this device (e.g. "iPhone 15")
 * @returns {Promise<{credential_id: string, device_name: string}>}
 */
export async function registerPasskey(username, deviceName) {
    // 1 — get options from server
    const options = await webauthnFetch('/auth/webauthn/register/begin', { username });

    // 2 — decode binary fields
    options.challenge = base64urlToUint8Array(options.challenge);
    options.user.id = base64urlToUint8Array(options.user.id);
    if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map(c => ({
            ...c,
            id: base64urlToUint8Array(c.id)
        }));
    }

    // 3 — prompt the authenticator
    const cred = await navigator.credentials.create({ publicKey: options });

    // 4 — send to server
    return webauthnFetch('/auth/webauthn/register/complete', {
        username,
        credential: encodeCredentialForServer(cred),
        device_name: deviceName || 'Unknown Device'
    });
}

/**
 * Authenticate with a passkey.
 * If username is omitted, uses the discoverable (usernameless) flow — the browser
 * presents all registered passkeys for this site without needing a typed username.
 * @param {string} [username] - Optional username (omit for discoverable flow)
 * @returns {Promise<object>} - Same shape as the /auth/login response (access_token, username, role…)
 */
export async function loginWithPasskey(username) {
    // 1 — get challenge from server (username is optional)
    const beginBody = username ? { username } : {};
    const options = await webauthnFetch('/auth/webauthn/login/begin', beginBody);

    // Capture the discoverable token before mutating the options object
    const challengeToken = options._token || null;
    delete options._token;

    // 2 — decode binary fields
    options.challenge = base64urlToUint8Array(options.challenge);
    if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map(c => ({
            ...c,
            id: base64urlToUint8Array(c.id)
        }));
    }

    // 3 — prompt the authenticator
    const assertion = await navigator.credentials.get({ publicKey: options });

    // 4 — verify on server — returns a JWT response identical to /auth/login
    const completeBody = { credential: encodeCredentialForServer(assertion) };
    if (username) completeBody.username = username;
    if (challengeToken) completeBody.challenge_token = challengeToken;

    return webauthnFetch('/auth/webauthn/login/complete', completeBody);
}
