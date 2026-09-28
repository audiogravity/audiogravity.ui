/**
 * @module Auth
 * @description Module de gestion de l'authentification JWT côté client
 */

import { API_BASE_URL, API_KEY, API_KEY_HEADER, JWT_ENABLED, IS_TEST_ENV } from './core/config.js';
import { fetchJson, fetchOrNetworkError, readJson, throwForStatus } from './net-errors.js';
import { sessionEnded } from './core/credentials.js';

// =====================
// AUTH STATE
// =====================

const AuthState = {
    token: null,
    user: null,
    isAuthenticated: false,
    tokenExpiry: null,
    // Where this tab's session lives: localStorage (persistent, shared by the tabs of
    // the browser) or sessionStorage (this tab's own). Another tab may since have put
    // another account's session in localStorage.
    storage: null
};

// =====================
// STORAGE KEYS
// =====================

const AUTH_STORAGE_KEYS = {
    TOKEN: 'jwt_token',
    USER: 'jwt_user',
    EXPIRY: 'jwt_expiry'
};

// =====================
// AUTH UTILITIES
// =====================

/**
 * Helper to get either localStorage or sessionStorage
 * @returns {Storage}
 */
function getStorage(persistent = true) {
    return persistent ? localStorage : sessionStorage;
}

/**
 * Initialise l'état d'authentification
 * Checks both storage types (localStorage for persistent, sessionStorage for session-only)
 */
function initAuth() {
    // Check localStorage first (persistent preference)
    let token = localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN);
    let userStr = localStorage.getItem(AUTH_STORAGE_KEYS.USER);
    let expiry = localStorage.getItem(AUTH_STORAGE_KEYS.EXPIRY);

    let storage = localStorage;

    // If not found, check sessionStorage
    if (!token) {
        storage = sessionStorage;
        token = sessionStorage.getItem(AUTH_STORAGE_KEYS.TOKEN);
        userStr = sessionStorage.getItem(AUTH_STORAGE_KEYS.USER);
        expiry = sessionStorage.getItem(AUTH_STORAGE_KEYS.EXPIRY);
    }

    if (token && userStr && expiry) {
        const expiryDate = new Date(expiry);
        const now = new Date();

        // Vérifier si le token n'est pas expiré
        if (expiryDate > now) {
            AuthState.token = token;
            try { AuthState.user = JSON.parse(userStr); } catch { clearAuth(); return false; }
            AuthState.tokenExpiry = expiryDate;
            AuthState.isAuthenticated = true;
            AuthState.storage = storage;

            applyRoleClass();
            return true;
        } else {
            clearAuth();
        }
    }

    return false;
}

/**
 * Sauvegarde l'authentification
 * @param {string} token - JWT token
 * @param {object} user - Informations utilisateur
 * @param {number} expiresInHours - Durée de validité en heures
 * @param {boolean} persistent - Si la session doit être persistante
 */
function saveAuth(token, user, expiresInHours = 12, persistent = true) {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + expiresInHours);

    // PWA standalone mode has no persistent session concept — always use localStorage
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    const storage = getStorage(persistent || isPWA);
    
    // Clear other storage to avoid conflicts
    const otherStorage = getStorage(!persistent);
    otherStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN);
    otherStorage.removeItem(AUTH_STORAGE_KEYS.USER);
    otherStorage.removeItem(AUTH_STORAGE_KEYS.EXPIRY);

    storage.setItem(AUTH_STORAGE_KEYS.TOKEN, token);
    storage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(user));
    storage.setItem(AUTH_STORAGE_KEYS.EXPIRY, expiry.toISOString());

    AuthState.token = token;
    AuthState.user = user;
    AuthState.tokenExpiry = expiry;
    AuthState.isAuthenticated = true;
    AuthState.storage = storage;

    applyRoleClass();
}

/**
 * Efface l'authentification des deux types de stockage
 */
function clearAuth() {
    for (const storage of [localStorage, sessionStorage]) {
        dropStoredSession(storage);
        storage.removeItem('redirect_after_login');
    }
    forgetSession();
}

/**
 * Remove the session a storage holds.
 * @param {Storage} storage - localStorage or sessionStorage.
 */
function dropStoredSession(storage) {
    storage.removeItem(AUTH_STORAGE_KEYS.TOKEN);
    storage.removeItem(AUTH_STORAGE_KEYS.USER);
    storage.removeItem(AUTH_STORAGE_KEYS.EXPIRY);
}

/**
 * Drop this tab's session from memory, leaving the storages as they are.
 */
function forgetSession() {
    AuthState.token = null;
    AuthState.user = null;
    AuthState.tokenExpiry = null;
    AuthState.isAuthenticated = false;
    AuthState.storage = null;

    applyRoleClass();
}

/**
 * The account a storage holds a session for.
 * @param {?Storage} storage - localStorage or sessionStorage.
 * @returns {?Object} Its user, or null when it holds none (or an unreadable one).
 */
function storedUser(storage) {
    try { return JSON.parse(storage?.getItem(AUTH_STORAGE_KEYS.USER) || 'null'); } catch { return null; }
}

/**
 * Whether a storage holds a session of this tab's account.
 * @param {?Storage} storage - localStorage or sessionStorage.
 * @returns {boolean}
 */
function holdsThisAccount(storage) {
    const user = storedUser(storage);
    return Boolean(user && AuthState.user && user.username === AuthState.user.username);
}

/**
 * End in this tab a session the core no longer accepts — expired, or ended because
 * the account changed (a new password, a new role, disabled, deleted) — and send the
 * user to the sign-in page, which brings them back here afterwards.
 *
 * Only while the token refused is still the one the tab's storage keeps: a request
 * sent before the token was replaced — by this tab, or by another tab sharing its
 * storage — is refused for the old one, and the session goes on with the new, taken
 * up here with the account's role and expiry as they now are. Never another
 * account's: a session another tab signed in since, in the storage the tabs share, is
 * neither taken up nor erased — the tab's own session ends, the other stays.
 * @param {string} [rejectedToken] - The token the refused request carried.
 */
function endSession(rejectedToken) {
    const storage = AuthState.storage;
    const kept = storage?.getItem(AUTH_STORAGE_KEYS.TOKEN);
    if (rejectedToken && kept && kept !== rejectedToken && holdsThisAccount(storage)) {
        if (AuthState.token !== kept) {
            // Replaced by another tab: take it up, and let the streams reconnect with it.
            AuthState.token = kept;
            AuthState.user = storedUser(storage);
            AuthState.tokenExpiry = new Date(storage.getItem(AUTH_STORAGE_KEYS.EXPIRY));
            applyRoleClass();
            window.dispatchEvent(new CustomEvent('ag-session-token-replaced'));
        }
        return;
    }
    if (!rejectedToken || !storage) {
        clearAuth();
    } else {
        // The refused session is erased where this tab kept it, and only there: the
        // other storage, or this one once another account signed in, is not this tab's.
        if (!kept || kept === rejectedToken) dropStoredSession(storage);
        forgetSession();
    }
    requireAuth();
}

/**
 * Swap the session token for the one the core issued to replace it, keeping the
 * rest of the session as it is: same user, same storage, same expiry. An admin
 * who changes their own password ends their own sessions with the others, and the
 * core hands back a token for the one the change was made from.
 *
 * Announced with an `ag-session-token-replaced` event on window: a stream opened
 * with the old token (sse.js) reconnects with the new one — reconnecting on its own
 * with the old, it would come back as no one, the core opening it without a user.
 * @param {string} token - Replacement JWT.
 */
function replaceToken(token) {
    // Only where this tab's session lives, and only while it is still this account's
    // there: another tab may have signed another account in since.
    if (holdsThisAccount(AuthState.storage)) {
        AuthState.storage.setItem(AUTH_STORAGE_KEYS.TOKEN, token);
    }
    AuthState.token = token;
    window.dispatchEvent(new CustomEvent('ag-session-token-replaced'));
}

/**
 * Send a request that carries this device's session, and end the session here when
 * the core answers that it no longer accepts it (see `sessionEnded`). Every request
 * that sends the token goes through it: the API calls, the uploads, the passkey
 * registration.
 * @param {string} url - Full URL.
 * @param {RequestInit} options - Its `headers` a plain object, `Authorization` included when sent.
 * @returns {Promise<Response>} The response, whatever its status.
 */
async function fetchInSession(url, options) {
    const response = await fetchOrNetworkError(url, options);
    const sent = options.headers?.Authorization;
    if (sessionEnded(response, sent)) endSession(sent.replace(/^Bearer\s+/i, ''));
    return response;
}

/**
 * `fetchInSession`, then the JSON body — or the error the status calls for.
 * @param {string} url - Full URL.
 * @param {RequestInit} options - As for `fetchInSession`.
 * @returns {Promise<any>}
 */
async function fetchJsonInSession(url, options) {
    const response = await fetchInSession(url, options);
    if (!response.ok) await throwForStatus(response);
    return readJson(response);
}

/**
 * Applique ou retire la classe CSS selon le rôle (ex: guest)
 * Gère également la visibilité de l'onglet Admin
 */
function applyRoleClass() {
    if (document.body) {
        if (isGuest()) {
            document.body.classList.add('role-guest');
        } else {
            document.body.classList.remove('role-guest');
        }

        // Gérer la visibilité de l'onglet Admin
        const isAdminUser = isAdmin();
        const agTabs = document.querySelector('ag-tabs');
        if (agTabs) {
            customElements.whenDefined('ag-tabs').then(() => {
                agTabs.toggleTabVisibility('admin', isAdminUser);
                
                // Si l'utilisateur n'est plus admin mais est toujours sur l'onglet admin, on redirige
                if (!isAdminUser && window.AppState && window.AppState.currentTab === 'admin') {
                    agTabs._selectTab('profiles');
                }
            });
        }
    }

    // Emit event for lit components
    if (window.EventEmitter) {
        window.EventEmitter.emit('auth-changed', {
            isAuthenticated: AuthState.isAuthenticated,
            user: AuthState.user
        });
    }
}

/**
 * Vérifie si l'utilisateur est authentifié
 * @returns {boolean}
 */
function isAuthenticated() {
    if (!AuthState.isAuthenticated || !AuthState.token) {
        return false;
    }

    // Vérifier l'expiration
    const now = new Date();
    if (AuthState.tokenExpiry && AuthState.tokenExpiry <= now) {
        clearAuth();
        return false;
    }

    return true;
}

/**
 * Récupère les informations de l'utilisateur connecté
 * @returns {object|null}
 */
function getCurrentUser() {
    return AuthState.isAuthenticated ? AuthState.user : null;
}

/**
 * Vérifie si l'utilisateur a le rôle admin
 * @returns {boolean}
 */
function isAdmin() {
    return AuthState.isAuthenticated && AuthState.user?.role === 'admin';
}

/**
 * Vérifie si l'utilisateur a le rôle guest
 * @returns {boolean}
 */
function isGuest() {
    return AuthState.isAuthenticated && AuthState.user?.role === 'guest';
}

/**
 * Récupère le token JWT
 * @returns {string|null}
 */
function getAuthToken() {
    return AuthState.isAuthenticated ? AuthState.token : null;
}

// =====================
// API CALLS AVEC AUTH
// =====================

/**
 * Sign in with a password and store the session.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>} The login response (token, username, role, expiry).
 */
async function login(username, password) {
    // /auth/login always requires the API key: there is no JWT yet.
    // Transport is tagged and a refusal carries its status and a string detail — see
    // net-errors.js. Telling a refused password from an unreachable box by reading message
    // text is what made an offline machine accuse its owner.
    const data = await fetchJson(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            [API_KEY_HEADER]: API_KEY
        },
        body: JSON.stringify({ username, password })
    });

    saveAuth(data.access_token, {
        username: data.username,
        role: data.role
    }, data.expires_in_hours, data.persistent_auth);

    return data;
}

/**
 * Logout utilisateur
 */
async function logout() {
    try {
        // Appeler l'API de logout (optionnel pour MVP)
        if (AuthState.token) {
            await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [API_KEY_HEADER]: API_KEY,
                    'Authorization': `Bearer ${AuthState.token}`
                }
            }).catch(() => {
                // Ignorer les erreurs de l'API logout
            });
        }
    } finally {
        // Toujours effacer la session locale
        clearAuth();
    }
}

// =====================
// MIDDLEWARE POUR APPELS API
// =====================

/**
 * Note: L'injection du JWT token est faite dans common.js
 * directement via getAuthToken() pour éviter les problèmes de chargement
 */

/**
 * Rediriger vers login si non authentifié
 */
function requireAuth() {
    // Si JWT désactivé globalement, bypasser la vérification
    if (typeof JWT_ENABLED !== 'undefined' && !JWT_ENABLED) {
        console.warn('⚠️ JWT_ENABLED=false - Authentication bypassed (DEBUG MODE)');
        return true;
    }

    if (!isAuthenticated()) {
        // Bypass redirect in Storybook or Vitest environment to avoid breaking tests
        if (IS_TEST_ENV) {
            console.warn('⚠️ Authentication required but bypassed in Test/Storybook environment');
            return true;
        }

        // Sauvegarder la page actuelle pour redirection après login
        // On utilise localStorage pour la redirection car c'est plus fiable lors des sauts de domaines/sessions
        localStorage.setItem('redirect_after_login', window.location.pathname);
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

/**
 * Rediriger vers dashboard si déjà authentifié (pour page login)
 */
function redirectIfAuthenticated() {
    if (isAuthenticated()) {
        window.location.href = 'index.html';
        return true;
    }
    return false;
}



// =====================
// ES6 MODULE EXPORTS (Phase 2)
// =====================

/**
 * Export all authentication functions for ES6 module usage
 * Example: import { isGuest, getCurrentUser, logout } from './auth.js'
 */
export {
    AuthState,
    initAuth,
    saveAuth,
    clearAuth,
    endSession,
    replaceToken,
    fetchInSession,
    fetchJsonInSession,
    isAuthenticated,
    getCurrentUser,
    isAdmin,
    isGuest,
    getAuthToken,
    login,
    logout,
    requireAuth,
    redirectIfAuthenticated,
    applyRoleClass
};

