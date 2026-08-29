/**
 * @module Login
 * @description Login page management
 */

import { API_BASE_URL, API_KEY, API_KEY_HEADER, UI_VERSION } from './core/config.js';
import './components/atoms/ag-license-badge.js';
import './components/atoms/ag-theme-toggle.js';
import { initAuth, login, saveAuth, redirectIfAuthenticated } from './auth.js';
import { isWebAuthnAvailable, loginWithPasskey, registerPasskey } from './webauthn.js';
import { applyOrientationLock } from './orientation-lock.js';
import { signInFailureMessage } from './net-errors.js';

// Honour the persisted portrait lock on the login screen too — the app's
// common.js / <ag-orientation-gate> don't run here, so without this an Android
// user who turned Portrait Lock off would still get a portrait-locked login (the
// manifest lock is only released by the runtime override). Default is on.
try {
    const stored = localStorage.getItem('lockPortrait');
    applyOrientationLock(stored === null ? true : JSON.parse(stored));
} catch {
    applyOrientationLock(true);
}

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
 * The sentence to put in front of someone whose sign-in just failed.
 *
 * One call for all three sign-in paths — the password form, the passkey button and the
 * auto-passkey panel — because having written the mapping twice is precisely what left the
 * third one showing WebKit's raw "Load failed", on the very device the report came from. The
 * table itself lives in net-errors.js, where it is tested against the responses the servers
 * really send; what stays here is the one side effect: when nothing answered, re-probe, so the
 * `CORE · OFFLINE` badge above the form and the message below it never contradict each other.
 *
 * @param {Error} error - What the sign-in call threw.
 * @param {string} unauthorized - What to say when the box answered "no" (differs per path).
 * @param {{ detailOnUnauthorized?: boolean }} [opts] - See signInFailureMessage.
 * @returns {string} A message for a person.
 */
function signInErrorMessage(error, unauthorized, opts = {}) {
    const { message, unreachable } = signInFailureMessage(error, {
        unauthorized,
        host: window.location.hostname,
        ...opts,
    });
    if (unreachable) checkConnectivity().then(renderStatus);
    return message;
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

        showError(signInErrorMessage(error, 'Invalid username or password'));
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
        // Cancelled or superseded authenticator dialog — nothing to report. WebKit rejects
        // a ceremony replaced by another with AbortError, on a box that answered fine.
        if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
            setLoading(false, 'passkey');
            return;
        }
        console.error('Passkey login error:', error);
        // No passkey for the typed username (server returns 200 with empty allowCredentials;
        // webauthn.js raises this before prompting). Its own case: nothing failed.
        const message = error.name === 'NoPasskeyError'
            ? 'No passkey registered for this account.'
            : signInErrorMessage(error, 'Passkey verification failed. Try again.', { detailOnUnauthorized: true });
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
                if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
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

let connectivityProbe = null;

/**
 * One probe in flight at a time: every failed sign-in asks for one, and five quick retries on
 * the passkey panel used to send five concurrent requests at a box that had just not answered.
 * @returns {Promise<boolean>}
 */
function checkConnectivity() {
    if (!connectivityProbe) {
        connectivityProbe = probeConnectivity().finally(() => { connectivityProbe = null; });
    }
    return connectivityProbe;
}

async function probeConnectivity() {
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

/**
 * Paint the connectivity badge above the sign-in form and on the auto-passkey panel.
 *
 * The label names the core, not "API": what the probe reaches is the box's own core
 * server, and that is the word the rest of the interface, the installer and the service
 * unit all use for it. "API" named a protocol nobody signing in has to think about.
 *
 * @param {boolean} ok - Whether /health answered.
 */
function renderStatus(ok) {
    const html = `<span class="status-label">CORE ·</span> <span class="status-dot${ok ? ' connected' : ''}">${ok ? '● CONNECTED' : '● OFFLINE'}</span>`;
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
                // This panel — not the form — is the first thing a passkey-registered iPhone
                // sees, so it is where an unreachable box is met first. It used to print the
                // browser's raw sentence.
                elements.autoPasskeyError.textContent =
                    signInErrorMessage(err, 'Passkey verification failed. Try again.', { detailOnUnauthorized: true });
                elements.autoPasskeyError.style.display = '';
            }
            elements.autoPasskeyTrigger.disabled = false;
            elements.autoPasskeyCancel.disabled = false;
        }
    });
    // Deliberately not `{ once: true }`. The catch above hands the button back to the user, and
    // with `once` the listener was already gone: the retry it invited did nothing at all, until
    // the page was reloaded. A button that comes back enabled must still work. Double-submits are
    // prevented by the `disabled = true` at the top of the handler, which is the guard that
    // belongs here — it lasts exactly as long as the attempt does.

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
    elements.versionInfo.innerHTML = `<a class="version-link" href="https://audiogravity.app" target="_blank" rel="noopener"><span class="ag-wordmark ag-wordmark--in-text">Audiogravi<sup>ty</sup></span></a> &copy; 2026 — <a class="version-link" href="https://github.com/audiogravity/audiogravity.site/blob/main/EULA.md" target="_blank" rel="noopener">Proprietary License</a>`;
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
