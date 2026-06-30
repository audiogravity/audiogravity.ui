/**
 * @module Login
 * @description Login page management
 */

import { API_BASE_URL, API_KEY, API_KEY_HEADER, UI_VERSION } from './core/config.js';
import './components/atoms/ag-license-badge.js';
import { initAuth, login, saveAuth, redirectIfAuthenticated } from './auth.js';
import { isWebAuthnAvailable, loginWithPasskey, registerPasskey } from './webauthn.js';

// =====================
// DOM ELEMENTS
// =====================

let elements = {};

function initElements() {
    elements = {
        loginForm: document.getElementById('loginForm'),
        usernameInput: document.getElementById('username'),
        passwordInput: document.getElementById('password'),
        loginBtn: document.getElementById('loginBtn'),
        btnText: document.querySelector('#loginBtn .btn-text'),
        btnLoader: document.querySelector('#loginBtn .btn-loader'),
        passkeyBtn: document.getElementById('passkeyBtn'),
        passkeyDivider: document.getElementById('passkeyDivider'),
        passkeyOffer: document.getElementById('passkeyOffer'),
        passkeyOfferYes: document.getElementById('passkeyOfferYes'),
        passkeyOfferSkip: document.getElementById('passkeyOfferSkip'),
        errorMessage: document.getElementById('errorMessage'),
        errorText: document.getElementById('errorText'),
        versionInfo: document.getElementById('versionInfo'),
        loginLicense: document.getElementById('loginLicense'),
        autoPasskeyLicense: document.getElementById('autoPasskeyLicense'),
        loginHeader: document.querySelector('.login-header'),
        loginMeta: document.getElementById('loginMeta'),
        loginStatus: document.getElementById('login-status'),
        autoPasskeyPanel: document.getElementById('autoPasskeyPanel'),
        autoPasskeyMeta: document.getElementById('autoPasskeyMeta'),
        autoPasskeyTrigger: document.getElementById('autoPasskeyTrigger'),
        autoPasskeyError: document.getElementById('autoPasskeyError'),
        autoPasskeyStatus: document.getElementById('autoPasskeyStatus'),
        autoPasskeyCancel: document.getElementById('autoPasskeyCancel')
    };
}

// =====================
// FUNCTIONS
// =====================

/**
 * Display error message
 */
function showError(message) {
    elements.errorText.textContent = message;
    elements.errorMessage.style.display = 'flex';
}

/**
 * Hide error message
 */
function hideError() {
    elements.errorMessage.style.display = 'none';
}

/**
 * Toggle loading state
 * @param {boolean} loading
 * @param {'login'|'passkey'} [target='login']
 */
function setLoading(loading, target = 'login') {
    elements.usernameInput.disabled = loading;
    elements.passwordInput.disabled = loading;
    elements.loginBtn.disabled = loading;
    if (elements.passkeyBtn) elements.passkeyBtn.disabled = loading;

    const btn = target === 'passkey' ? elements.passkeyBtn : elements.loginBtn;
    if (btn) {
        btn.classList.toggle('is-loading', loading);
    }
}

/**
 * Redirect to dashboard
 */
function redirectToDashboard() {
    // Check if there's a saved redirect
    const redirect = sessionStorage.getItem('redirect_after_login');
    sessionStorage.removeItem('redirect_after_login');

    // Only redirect if it's a real page (not login.html, not simple index.html)
    if (redirect && redirect !== '/login.html' && redirect !== '/index.html' && redirect !== 'login.html' && redirect !== 'index.html') {
        window.location.href = redirect;
    } else {
        // Default: go to root
        window.location.href = '/';
    }
}

/**
 * Perform login
 */
async function performLogin(username, password) {
    try {
        setLoading(true);
        hideError();

        // Use the centralized login function from auth.js
        await login(username, password);

        // Offer passkey setup before redirecting (shown once per user)
        await offerPasskeySetup(username);

        redirectToDashboard();

    } catch (error) {
        console.error('Login error:', error);

        // Map common error messages
        let message = error.message;
        if (message.includes('401') || message.includes('failed') || message.includes('Unauthorized')) {
            message = 'Invalid username or password';
        } else if (message.includes('403')) {
            message = 'Access denied. Check your API key.';
        }

        showError(message);
        setLoading(false);

        // Shake the form
        if (elements.loginForm) {
            elements.loginForm.style.animation = 'none';
            setTimeout(() => {
                elements.loginForm.style.animation = '';
            }, 10);
        }
    }
}

/**
 * Authenticate using a saved passkey (WebAuthn).
 */
async function performPasskeyLogin() {
    // Username is optional — discoverable flow lets the browser pick the passkey
    const username = elements.usernameInput.value.trim() || undefined;

    try {
        setLoading(true, 'passkey');
        hideError();

        const data = await loginWithPasskey(username);

        saveAuth(data.access_token, {
            username: data.username,
            role: data.role
        }, data.expires_in_hours, data.persistent_auth);

        await new Promise(resolve => setTimeout(resolve, 300));
        redirectToDashboard();
    } catch (error) {
        // User cancelled the authenticator dialog — don't show an error
        if (error.name === 'NotAllowedError') {
            setLoading(false, 'passkey');
            return;
        }
        console.error('Passkey login error:', error);
        let message = error.message;
        if (message.includes('404') || message.includes('No passkeys')) {
            message = 'No passkey registered for this account.';
        } else if (message.includes('401') || message.includes('failed')) {
            message = 'Passkey verification failed. Try again.';
        }
        showError(message);
        setLoading(false, 'passkey');
    }
}

/**
 * After a successful password login, offer to register a passkey (once per user).
 * Hides the login form and shows the offer panel; resolves when user decides.
 */
async function offerPasskeySetup(username) {
    if (!isWebAuthnAvailable()) return;
    const storageKey = `passkey_offered_${username}`;
    if (localStorage.getItem(storageKey)) return;

    elements.loginForm.style.display = 'none';
    elements.passkeyOffer.style.display = '';

    return new Promise(resolve => {
        elements.passkeyOfferYes.addEventListener('click', async () => {
            elements.passkeyOfferYes.classList.add('is-loading');
            elements.passkeyOfferYes.disabled = true;
            elements.passkeyOfferSkip.disabled = true;
            try {
                const deviceName = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone / iPad'
                    : /Android/.test(navigator.userAgent) ? 'Android'
                        : navigator.platform || 'This Device';
                await registerPasskey(username, deviceName);
                localStorage.setItem(storageKey, 'enabled');
                localStorage.setItem('passkey_auto', 'true');
            } catch (err) {
                if (err.name !== 'NotAllowedError') {
                    localStorage.setItem(storageKey, 'skipped');
                }
            }
            resolve();
        }, { once: true });

        elements.passkeyOfferSkip.addEventListener('click', () => {
            localStorage.setItem(storageKey, 'skipped');
            resolve();
        }, { once: true });
    });
}

/**
 * Auto-trigger passkey login on page load if the user previously registered one.
 * Silently falls back to the normal form if cancelled or unavailable.
 */
function hasRegisteredPasskey() {
    if (localStorage.getItem('passkey_auto')) return true;
    return Object.keys(localStorage).some(
        k => k.startsWith('passkey_offered_') && localStorage.getItem(k) === 'enabled'
    );
}

async function checkConnectivity() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const res = await fetch(`${API_BASE_URL}/health`, {
            headers: { [API_KEY_HEADER]: API_KEY },
            cache: 'no-store',
            signal: controller.signal
        });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

function renderStatus(ok) {
    const html = `<span class="status-label">API ·</span> <span class="status-dot${ok ? ' connected' : ''}">${ok ? '● CONNECTED' : '● OFFLINE'}</span>`;
    [elements.loginStatus, elements.autoPasskeyStatus].forEach(el => { if (el) el.innerHTML = html; });
}

function watchConnectivity() {
    const check = () => checkConnectivity().then(ok => renderStatus(ok));

    window.addEventListener('online', check);
    window.addEventListener('offline', () => renderStatus(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

    check();
}

function initHeaderMeta(metaEl) {
    metaEl.textContent = `v${UI_VERSION} · ${window.location.hostname.toUpperCase()}`;
}

function showPasskeyPanel() {
    elements.loginHeader.style.display = 'none';
    elements.loginForm.style.display = 'none';
    elements.autoPasskeyPanel.style.display = '';
    initHeaderMeta(elements.autoPasskeyMeta);
}

function showLoginForm() {
    elements.autoPasskeyPanel.style.display = 'none';
    elements.loginHeader.style.display = '';
    elements.loginForm.style.display = '';
    elements.usernameInput.focus();
}

function tryAutoPasskeyLogin() {
    if (!isWebAuthnAvailable()) return false;
    if (!hasRegisteredPasskey()) return false;

    showPasskeyPanel();

    elements.autoPasskeyTrigger.addEventListener('click', async () => {
        elements.autoPasskeyTrigger.disabled = true;
        elements.autoPasskeyCancel.disabled = true;
        elements.autoPasskeyError.style.display = 'none';
        try {
            const data = await loginWithPasskey(undefined);
            saveAuth(data.access_token, {
                username: data.username,
                role: data.role
            }, data.expires_in_hours, data.persistent_auth);
            redirectToDashboard();
        } catch (err) {
            console.error('[Passkey] Auto-login error:', err.name, err.message);
            if (err.name !== 'NotAllowedError') {
                elements.autoPasskeyError.textContent = err.message || 'Authentication failed';
                elements.autoPasskeyError.style.display = '';
            }
            elements.autoPasskeyTrigger.disabled = false;
            elements.autoPasskeyCancel.disabled = false;
        }
    }, { once: true });

    elements.autoPasskeyCancel.addEventListener('click', () => {
        showLoginForm();
    }, { once: true });

    return true;
}

/**
 * Show the passkey button if WebAuthn is supported by this browser.
 */
function initPasskeyButton() {
    if (!isWebAuthnAvailable()) return;
    if (elements.passkeyBtn) elements.passkeyBtn.style.display = '';
    if (elements.passkeyDivider) elements.passkeyDivider.style.display = '';
    elements.passkeyBtn.addEventListener('click', performPasskeyLogin);
}

/**
 * Fetch license status and render the badge below the connectivity indicator.
 * Silently fails — the badge is informational only.
 * @returns {Promise<void>}
 */
async function loadLicenseBadge() {
    if (!API_KEY) return;
    try {
        const res = await fetch(`${API_BASE_URL}/license/status`, {
            headers: { [API_KEY_HEADER]: API_KEY },
            cache: 'no-store',
        });
        if (!res.ok) return;
        const { status, days_remaining } = await res.json();

        const makeBadge = () => {
            const badge = document.createElement('ag-license-badge');
            badge.setAttribute('status', status);
            if (days_remaining != null) badge.setAttribute('days-remaining', days_remaining);
            badge.setAttribute('pill', '');
            return badge;
        };

        [elements.loginLicense, elements.autoPasskeyLicense].forEach(el => {
            if (el) el.appendChild(makeBadge());
        });
    } catch { /* non-blocking */ }
}

/**
 * Load API version
 */
function loadVersion() {
    elements.versionInfo.innerHTML = `<a class="version-link" href="https://audiogravity.app" target="_blank" rel="noopener">Audiogravi<sup>ty</sup></a> &copy; 2026 — <a class="version-link" href="https://github.com/audiogravity/audiogravity.site/blob/main/EULA.md" target="_blank" rel="noopener">Proprietary License</a>`;
}

// =====================
// EVENT HANDLERS
// =====================

function handleFormSubmit(e) {
    e.preventDefault();

    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value;

    // Basic validation
    if (username.length < 3) {
        showError('Username must be at least 3 characters');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    // Perform login
    performLogin(username, password);
}

// =====================
// INITIALIZATION
// =====================

function init() {
    initElements();

    // Apply IHM theme and dark mode (defaults to minimal/light if none saved)
    const VALID_THEMES = ['slate', 'gravity', 'minimal'];
    const savedTheme = localStorage.getItem('theme');
    const theme = VALID_THEMES.includes(savedTheme) ? savedTheme : 'minimal';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);

    try {
        const isDark = JSON.parse(localStorage.getItem('darkMode'));
        if (isDark) {
            document.documentElement.classList.add('dark-mode');
            document.body.classList.add('dark-mode');
        }
    } catch { /* ignore */ }

    // SECURITY: Bloc si API Key manquante
    if (!API_KEY) {
        showError(
            'Configuration error: API Key not found. ' +
            'Please run install.sh to configure the application.'
        );
        elements.loginBtn.disabled = true;
        elements.usernameInput.disabled = true;
        elements.passwordInput.disabled = true;
        console.error('[Audiogravity] API Key missing. Login disabled.');
        return;
    }

    // Restaurer l'éventuelle session existante
    initAuth();

    // Vérifier si déjà authentifié via le module auth
    if (redirectIfAuthenticated()) {
        return; // Redirection en cours
    }

    // Charger la version
    loadVersion();
    initHeaderMeta(elements.loginMeta);
    watchConnectivity();
    loadLicenseBadge();

    // Auto Face ID if passkey was previously registered — shows panel instead of form
    const passkeyPanelShown = tryAutoPasskeyLogin();
    if (!passkeyPanelShown) elements.usernameInput.focus();

    // Show passkey button if supported
    initPasskeyButton();

    // Event listeners
    elements.loginForm.addEventListener('submit', handleFormSubmit);

    // Effacer l'erreur lors de la saisie
    elements.usernameInput.addEventListener('input', hideError);
    elements.passwordInput.addEventListener('input', hideError);
}

// Lancer l'initialisation au chargement de la page
// Comme c'est un module type="module", le script s'exécute après les
// chargements du DOM mais avant le signal 'DOMContentLoaded' final.
// Utiliser init() directement est sécurisé ici.
init();
