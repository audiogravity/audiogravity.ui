import { API_BASE_URL, API_KEY_HEADER, API_KEY } from './core/config.js';
import { AppState, updateConnectionStatus } from './common.js';
import { getAuthToken } from './auth.js';

// =====================
// API UTILITIES
// =====================

import { getUserFriendlyError } from './ui-helpers.js';

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

            // Don't retry on HTTP 4xx/5xx — these are definitive server responses.
            // Network-level errors (TypeError, no .status) stay retryable.
            if (error.status !== undefined && error.status >= 400) {
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

export async function apiCall(endpoint, options = {}) {
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

        const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));

            // Handle Pydantic validation errors (422)
            if (response.status === 422 && Array.isArray(errorData.detail)) {
                const validationErrors = errorData.detail.map(err => {
                    const field = err.loc ? err.loc.slice(1).join('.') : 'unknown';
                    return `${field}: ${err.msg}`;
                }).join('; ');
                const error = new Error(validationErrors);
                error.detail = validationErrors;
                error.validationErrors = errorData.detail;
                error.status = 422;
                throw error;
            }

            // Handle other errors
            const errorMessage = errorData.detail || `HTTP ${response.status}`;
            const error = new Error(errorMessage);
            error.detail = errorMessage;
            error.status = response.status;
            throw error;
        }

        // 204 No Content / 205 Reset Content — no body to parse.
        if (response.status === 204 || response.status === 205) return null;
        return await response.json();
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
 * @returns {string} Absolute URL.
 */
export function buildAuthedUrl(path, extraParams = {}) {
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

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers
        });
        if (!response.ok) throw new Error('Download failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download file');
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

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || 'Upload failed');
        }

        return await response.json();
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
