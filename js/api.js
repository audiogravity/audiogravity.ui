import { API_BASE_URL, API_KEY_HEADER, API_KEY } from './core/config.js';
import { AppState, updateConnectionStatus } from './common.js';
import { getAuthToken } from './auth.js';
import { hasCoreCredentials, isKeylessLocked, recordKeylessVerdict } from './core/credentials.js';

export { hasCoreCredentials };

// =====================
// API UTILITIES
// =====================

import { getUserFriendlyError, downloadBlob, showToast } from './ui-helpers.js';
import { fetchOrNetworkError, throwForStatus, fetchOrThrow, fetchJson, readJson, isRetryableFailure } from './net-errors.js';

/**
 * Retry API call with exponential backoff
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise} - API response
 */
export async function apiCallWithRetry(endpoint, options = {}, maxRetries = 3) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await apiCall(endpoint, options);
        } catch (error) {
            lastError = error;

            // Only a transport failure the device has not already settled is worth a second
            // try. "No status" used to stand in for that: it also matched a 200 whose body was
            // not JSON, replayed three times for nothing. And the service worker's offline
            // answer is final — retrying it three times per call, from every poller on the
            // page, is what the installed app did to a switched-off box.
            if (!isRetryableFailure(error)) {
                throw error;
            }

            // Last attempt, throw the error
            if (attempt === maxRetries - 1) {
                throw error;
            }

            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, attempt) * 1000;
            // Exponential backoff retry

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Endpoints the core serves without any key — mirrored from core/auth.py PUBLIC_PATHS.
 * The version-skew banner reads /status and the push manager registers subscriptions
 * from keyless contexts; refusing those locally would break features the server
 * explicitly left open.
 */
const PUBLIC_ENDPOINTS = new Set([
    // '/' is the entry point, and the core serves it without a key. Its absence here was
    // not theoretical: the configuration panel has fetched it at every page load for as
    // long as it has existed, so on a keyless client it WAS the probe the gate lets
    // through to settle the verdict — and it answers 200 whatever the key situation, so
    // the verdict was recorded as 'open' and the suppression never engaged for that
    // session. Once locked, the same call is refused locally, which would now also hide
    // the API reference on a core that does serve it.
    '/',
    '/status', '/health',
    '/push/vapid-public-key', '/push/subscribe', '/push/unsubscribe',
]);

let _authMissingSignalled = false;

function _signalLocked() {
    if (_authMissingSignalled) return;
    _authMissingSignalled = true;
    console.error('[api] No API key and the core requires one — requests are suppressed.');
    updateConnectionStatus(false);
    window.dispatchEvent(new CustomEvent('ag-auth-missing'));
}

function _recordVerdict(verdict) {
    recordKeylessVerdict(verdict);
    if (verdict === 'locked') _signalLocked();
}

/**
 * Refuse doomed requests locally; let one keyless request through as the probe.
 *
 * A client whose key was gone used to send everything anyway — 598 rejected cover
 * fetches in one measured day, each costing the box a request cycle and a journal line.
 * The box has a resource budget; the client does not. But a flat refusal would brick a
 * core running SECURITY_ENABLED=false, which legitimately answers keyless clients. So:
 * public endpoints always pass, and the FIRST protected request goes out as the probe —
 * its response settles the verdict in apiCall (403 → locked, anything else → open).
 * Worst case is one burst per tab, not hundreds of rejections per day.
 *
 * @param {string} endpoint - As passed to apiCall, without the base URL.
 * @throws {Error} with `.status = 401` (final for the retry layer) once locked.
 */
function keylessGate(endpoint) {
    if (API_KEY) return;
    if (PUBLIC_ENDPOINTS.has(endpoint.split('?')[0])) return;
    if (isKeylessLocked()) {
        _signalLocked();
        const error = new Error('No API key configured — request not sent');
        error.status = 401;
        throw error;
    }
}

export async function apiCall(endpoint, options = {}) {
    keylessGate(endpoint);
    try {
        // Préparer les headers de base
        const headers = {
            'Content-Type': 'application/json',
            [API_KEY_HEADER]: API_KEY,
            ...options.headers
        };

        // Ajouter le token JWT si disponible et si ce n'est pas une route publique
        const token = getAuthToken();
        if (token && !endpoint.startsWith('/auth/login')) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const fetchOptions = {
            ...options,
            headers
        };

        // The transport tag is set inside fetchOrNetworkError and nowhere wider: the catch at
        // the bottom of this function also covers onSuccess-style code in callers, so
        // classifying there would call a caller's TypeError a dead network.
        const response = await fetchOrNetworkError(`${API_BASE_URL}${endpoint}`, fetchOptions);

        // The keyless probe's answer settles the verdict: 403 is the middleware's
        // "Invalid or missing API key"; anything else means the core does not gate on
        // a key (SECURITY_ENABLED=false) and keyless traffic is legitimate.
        if (!API_KEY && !PUBLIC_ENDPOINTS.has(endpoint.split('?')[0])) {
            _recordVerdict(response.status === 403 ? 'locked' : 'open');
        }

        // One error shape for every caller — status, a string detail or null, the 422 field
        // list under validationErrors. This used to be built here with its own rules; see
        // throwForStatus for why the rules must be the same everywhere.
        if (!response.ok) await throwForStatus(response);

        // 204 No Content / 205 Reset Content — no body to parse.
        if (response.status === 204 || response.status === 205) return null;
        return await readJson(response);
    } catch (error) {
        console.error(`API Error [${endpoint}] on ${API_BASE_URL}:`, error);
        // Add visual feedback for connection failure if on profiles tab
        if (AppState && AppState.currentTab === 'profiles' && !AppState.connected) {
            if (typeof updateConnectionStatus === 'function') {
                updateConnectionStatus(false);
            }
        }
        throw error;
    }
}

/**
 * Build an absolute URL to a backend endpoint with the standard auth params
 * appended as query string: `api_key` (if set) and the JWT `token` (if a user
 * session exists). Used for transport channels that cannot rely on fetch
 * headers — namely `EventSource` (SSE) and `<img src>` cover loading.
 *
 * @param {string} path - Endpoint path (must start with `/`).
 * @param {object} [extraParams] - Additional query params (string values).
 * @returns {string|null} Absolute URL, or null when no usable credential exists —
 *     callers must not connect in that case.
 */
export function buildAuthedUrl(path, extraParams = {}) {
    // No usable credential → no URL at all. A bare URL here handed EventSource a
    // guaranteed 403 to reconnect against for the life of the tab; callers treat null
    // as "do not connect", which the client can afford and the box cannot. A JWT alone
    // does NOT open the gate: the middleware checks only the API key (verified against
    // core/auth.py), JWT or not.
    if (!hasCoreCredentials()) return null;
    const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
    if (API_KEY) url.searchParams.append('api_key', API_KEY);
    const token = getAuthToken();
    if (token) url.searchParams.append('token', token);
    for (const [k, v] of Object.entries(extraParams)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v);
    }
    return url.toString();
}

export async function apiGet(endpoint, retry = true) {
    if (retry) {
        return apiCallWithRetry(endpoint, { method: 'GET' });
    }
    return apiCall(endpoint, { method: 'GET' });
}

export async function apiPost(endpoint, data = {}, retry = true) {
    const options = {
        method: 'POST',
        body: JSON.stringify(data)
    };

    if (retry) {
        return apiCallWithRetry(endpoint, options);
    }
    return apiCall(endpoint, options);
}

export async function apiPut(endpoint, data = {}, retry = true) {
    const options = {
        method: 'PUT',
        body: JSON.stringify(data),
    };
    if (retry) {
        return apiCallWithRetry(endpoint, options);
    }
    return apiCall(endpoint, options);
}

export async function apiDelete(endpoint, retry = true) {
    const options = { method: 'DELETE' };
    if (retry) {
        return apiCallWithRetry(endpoint, options);
    }
    return apiCall(endpoint, options);
}

export async function apiDownload(endpoint, filename) {
    try {
        const headers = {
            [API_KEY_HEADER]: API_KEY
        };
        const token = getAuthToken();
        if (token && !endpoint.startsWith('/auth/login')) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetchOrThrow(`${API_BASE_URL}${endpoint}`, { headers });
        downloadBlob(await response.blob(), filename);
    } catch (error) {
        console.error('Download error:', error);
        showToast('error', 'Download failed', getUserFriendlyError(error));
    }
}

export async function apiUpload(endpoint, file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const headers = {
            [API_KEY_HEADER]: API_KEY
        };
        const token = getAuthToken();
        if (token && !endpoint.startsWith('/auth/login')) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return await fetchJson(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData
        });
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Global attachment for legacy code
if (typeof window !== 'undefined') {
    window.getUserFriendlyError = getUserFriendlyError;
    // other window API properties can remain unassigned until common logic is removed,
    // or we can assign them:
    window.apiCall = apiCall;
    window.apiCallWithRetry = apiCallWithRetry;
    window.apiGet = apiGet;
    window.apiPost = apiPost;
    window.apiDownload = apiDownload;
    window.apiUpload = apiUpload;
}
