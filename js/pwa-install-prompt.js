/**
 * @module pwa-install-prompt
 * @description PWA install prompt manager.
 *
 * Intercepts the browser's `beforeinstallprompt` event and shows a compact
 * in-app install banner. The banner is dismissed via localStorage so it does
 * not reappear for 30 days after the user explicitly declines.
 *
 * Only active on Android/Chrome — iOS does not fire `beforeinstallprompt`
 * (users install via the Safari share sheet instead).
 *
 * Does NOT handle SW update notifications — that is done in common.js via the
 * `controllerchange` listener to avoid a duplicate handler.
 */

const DISMISS_KEY = 'ag_pwa_install_dismissed';
const DISMISS_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
const BANNER_ID   = 'ag-pwa-install-banner';

/** @type {BeforeInstallPromptEvent|null} */
let _deferredPrompt = null;

/** Whether the app is running in standalone mode (already installed). */
function _isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

/** Whether the user dismissed the banner recently. */
function _isDismissed() {
    try {
        const ts = localStorage.getItem(DISMISS_KEY);
        return ts && (Date.now() - parseInt(ts, 10)) < DISMISS_TTL;
    } catch {
        return false;
    }
}

function _markDismissed() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage quota */ }
}

function _removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
}

/** Build and append the install banner to the document body. */
function _showBanner() {
    if (document.getElementById(BANNER_ID)) return;

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'pwa-install-banner';
    banner.setAttribute('role', 'banner');
    banner.setAttribute('aria-label', 'Install Audiogravity');

    banner.innerHTML = `
        <div class="pwa-install-banner__body">
            <svg class="pwa-install-banner__icon" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 15V3"/>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <path d="m7 10 5 5 5-5"/>
            </svg>
            <span class="pwa-install-banner__text">Add Audiogravity to your home screen</span>
        </div>
        <div class="pwa-install-banner__actions">
            <button class="action-btn compact primary pwa-install-banner__btn-install">Install</button>
            <button class="pwa-install-banner__btn-dismiss" aria-label="Dismiss">✕</button>
        </div>
    `;

    banner.querySelector('.pwa-install-banner__btn-install')
          .addEventListener('click', _handleInstall);
    banner.querySelector('.pwa-install-banner__btn-dismiss')
          .addEventListener('click', _handleDismiss);

    document.body.appendChild(banner);
}

async function _handleInstall() {
    if (!_deferredPrompt) return;
    const prompt = _deferredPrompt;
    _deferredPrompt = null;
    _removeBanner();
    try {
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted' && window.showToast) {
            window.showToast('success', 'Installed', 'Audiogravity added to your home screen.', 4000);
        }
    } catch (err) {
        console.warn('[pwa] Install prompt failed:', err);
    }
}

function _handleDismiss() {
    _markDismissed();
    _removeBanner();
}

function _init() {
    // Mark standalone class immediately on startup so CSS rules that depend on
    // body.pwa-standalone apply from the very first render (not only on install).
    if (_isStandalone()) {
        document.body.classList.add('pwa-standalone');
        return;
    }
    if (_isDismissed()) return;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredPrompt = e;
        _showBanner();
    });

    window.addEventListener('appinstalled', () => {
        _deferredPrompt = null;
        _removeBanner();
        document.body.classList.add('pwa-standalone');
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
} else {
    _init();
}
