/**
 * @module Auth
 * @description Module de gestion de l'authentification JWT côté client
 */

import { API_BASE_URL, API_KEY, API_KEY_HEADER, JWT_ENABLED, IS_TEST_ENV } from './core/config.js';

// =====================
// AUTH STATE
// =====================

const AuthState = {
    token: null,
    user: null,
    isAuthenticated: false,
    tokenExpiry: null
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

    // If not found, check sessionStorage
    if (!token) {
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

    applyRoleClass();
}

/**
 * Efface l'authentification des deux types de stockage
 */
function clearAuth() {
    localStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN);
    localStorage.removeItem(AUTH_STORAGE_KEYS.USER);
    localStorage.removeItem(AUTH_STORAGE_KEYS.EXPIRY);
    localStorage.removeItem('redirect_after_login');

    sessionStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN);
    sessionStorage.removeItem(AUTH_STORAGE_KEYS.USER);
    sessionStorage.removeItem(AUTH_STORAGE_KEYS.EXPIRY);
    sessionStorage.removeItem('redirect_after_login');

    AuthState.token = null;
    AuthState.user = null;
    AuthState.tokenExpiry = null;
    AuthState.isAuthenticated = false;

    applyRoleClass();
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
 * Login utilisateur
 * @param {string} username - Nom d'utilisateur
 * @param {string} password - Mot de passe
 * @returns {Promise<object>} - Réponse de login avec token
 */
async function login(username, password) {
    try {
        // Note: La route /auth/login nécessite toujours l'API Key
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                [API_KEY_HEADER]: API_KEY
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Erreur de connexion' }));
            throw new Error(errorData.detail || 'Échec de connexion');
        }

        const data = await response.json();

        // Sauvegarder l'authentification
        saveAuth(data.access_token, {
            username: data.username,
            role: data.role
        }, data.expires_in_hours, data.persistent_auth);

        return data;
    } catch (error) {
        console.error('Erreur de login:', error);
        throw error;
    }
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

