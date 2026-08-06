/**
 * @module Config
 * @description Centralized configuration and environment detection.
 * This module has NO dependencies and is intended to be imported by all other modules.
 */

// Environment Configuration (Support for dynamic injection via install script)
export const AG_CONFIG = window.AG_CONFIG || {};

// Test Environment Detection
export const IS_TEST_ENV = window.IS_STORYBOOK ||
    window.location.port === '6006' ||
    window.__VITEST_BROWSER__ ||
    window.__vitest_browser__ ||
    navigator.userAgent.includes('Storybook') ||
    navigator.userAgent.includes('Vitest');

const isDevelopment = ['3000', '3001', '5173'].includes(window.location.port);
export const API_BASE_URL = AG_CONFIG.apiUrl || (isDevelopment
    ? '/api'  // Vite proxy
    : `${window.location.protocol}//${window.location.hostname}:8000`); // Direct backend

// Version: single source of truth is the root /VERSION file, propagated here by
// scripts/sync-version.mjs (run via `release.sh prepare`). A literal on purpose —
// no build-time global — so it resolves identically in Vite, Vitest and Storybook.
// Do not hand-edit; a guard test (js/version.test.js) fails if it drifts.
export const UI_VERSION = '0.9.32';

// Theme Registry
export const THEMES = [
    { value: 'minimal', label: 'Minimal (Classic)', file: 'css/themes/minimal.css' },
    { value: 'slate', label: 'Slate (Modern)', file: 'css/themes/slate.css' },
    { value: 'gravity', label: 'Gravity (Bold & Cosmic)', file: 'css/themes/gravity.css' }
];

// API Security
//
// Priority: AG_CONFIG (injected by install.sh) → localStorage → null.
//
// The injected key is AUTHORITATIVE — it is the one the core at the other end
// actually accepts. A copy kept in this browser used to outrank it, so once a
// wrong value was stored the interface was locked out for good: every upgrade
// republished the right key and lost to the stale one, with nothing on screen
// to explain the 403s. Storage is now only a fallback for development, where
// nothing is injected. A leftover override is dropped rather than kept, so it
// cannot come back if an install ever ships without a key.
export let API_KEY = AG_CONFIG.apiKey || localStorage.getItem('apiKey') || (IS_TEST_ENV ? 'mock-test-key' : null);

if (AG_CONFIG.apiKey && localStorage.getItem('apiKey')) {
    localStorage.removeItem('apiKey');
}

if (!API_KEY) {
    const isDev = isDevelopment || window.location.port === '5173';
    if (isDev) {
        // Development only: ask once and keep it in storage. This is the sole
        // remaining writer — the Settings panel used to offer the same field to
        // every user on a deployed box, which could only ever break their own
        // access to a key they already had.
        const devKey = window.prompt(
            '⚠️ Clé API manquante (mode développement)\n\n' +
            'Entrez votre API_KEY (visible dans backend/.env) :'
        );
        if (devKey && devKey.trim()) {
            API_KEY = devKey.trim();
            localStorage.setItem('apiKey', API_KEY);
        } else {
            console.error('[Audiogravity] API Key manquante. Fonctions API indisponibles.');
        }
    } else {
        // Production: hard error — install.sh must have injected AG_CONFIG.
        console.error(
            '[Audiogravity] ERREUR CRITIQUE : API Key non configurée.\n' +
            'Assurez-vous que install.sh a bien été exécuté et a injecté window.AG_CONFIG.'
        );
    }
}
export const API_KEY_HEADER = 'X-API-Key';


// Authentication Control
export const JWT_ENABLED = true;
