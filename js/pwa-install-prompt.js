/**
 * PWA Install Prompt Manager
 * @module PWAInstallPrompt
 * @description Gère l'invitation à installer l'application en mode PWA
 *
 * Fonctionnalités :
 * - Capture l'événement beforeinstallprompt
 * - Affiche un bouton d'installation personnalisé
 * - Détecte si l'app est déjà installée
 * - Gère les notifications de mise à jour
 */

let deferredPrompt = null;
let isInstalled = false;

/**
 * Initialisation du gestionnaire PWA
 */
function initPWAInstallPrompt() {
    console.log('[PWA] Install prompt manager initialized');

    // Capturer l'événement beforeinstallprompt
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Détecter l'installation réussie
    window.addEventListener('appinstalled', handleAppInstalled);

    // Vérifier si déjà installé/lancé en standalone
    checkIfAlreadyInstalled();

    // Gérer les mises à jour du Service Worker
    handleServiceWorkerUpdates();
}

/**
 * Gère l'événement beforeinstallprompt
 * @param {Event} e - L'événement beforeinstallprompt
 */
function handleBeforeInstallPrompt(e) {
    console.log('[PWA] Install prompt available');

    // Empêcher le prompt automatique du navigateur
    e.preventDefault();

    // Stocker l'événement pour l'utiliser plus tard
    deferredPrompt = e;

    // Afficher un bouton d'installation personnalisé
    showInstallButton();
}

/**
 * Affiche le bouton d'installation dans la topbar
 */
function showInstallButton() {
    // Vérifier si le bouton n'existe pas déjà
    if (document.getElementById('pwa-install-btn')) {
        return;
    }

    // Créer le bouton
    const installBtn = document.createElement('button');
    installBtn.id = 'pwa-install-btn';
    installBtn.className = 'btn-icon';
    installBtn.innerHTML = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg> Install App';
    installBtn.title = 'Install Audiogravity as a standalone application';
    installBtn.setAttribute('aria-label', 'Install application');

    // Style inline pour assurer la visibilité
    installBtn.style.cssText = `
        margin-left: 8px;
        background: var(--color-primary, #4CAF50);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: background 0.2s ease;
    `;

    installBtn.addEventListener('mouseenter', () => {
        installBtn.style.background = 'var(--color-primary-hover, #45a049)';
    });

    installBtn.addEventListener('mouseleave', () => {
        installBtn.style.background = 'var(--color-primary, #4CAF50)';
    });

    // Gestionnaire de clic
    installBtn.addEventListener('click', handleInstallClick);

    // Insérer dans la topbar
    // Stratégie : essayer plusieurs emplacements possibles
    const topBar = document.querySelector('ag-top-bar');
    if (topBar) {
        // Essayer d'accéder au shadow DOM
        const shadowRoot = topBar.shadowRoot;
        if (shadowRoot) {
            const actionsContainer = shadowRoot.querySelector('.topbar-actions') ||
                                    shadowRoot.querySelector('.topbar-right') ||
                                    shadowRoot.querySelector('.topbar');
            if (actionsContainer) {
                actionsContainer.appendChild(installBtn);
                console.log('[PWA] Install button added to topbar');
                return;
            }
        }
    }

    // Fallback : ajouter dans le body en position fixe
    installBtn.style.cssText += `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(installBtn);
    console.log('[PWA] Install button added to body (fallback)');
}

/**
 * Gère le clic sur le bouton d'installation
 */
async function handleInstallClick() {
    if (!deferredPrompt) {
        console.warn('[PWA] No deferred prompt available');
        return;
    }

    console.log('[PWA] Showing install prompt');

    // Afficher le prompt natif
    deferredPrompt.prompt();

    // Attendre le choix de l'utilisateur
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to install prompt: ${outcome}`);

    // Nettoyer
    deferredPrompt = null;

    // Masquer le bouton
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.remove();
    }
}

/**
 * Gère l'événement d'installation réussie
 */
function handleAppInstalled() {
    console.log('[PWA] Application installed successfully! 🎉');
    isInstalled = true;

    // Masquer le bouton d'installation
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.remove();
    }

    // Afficher une notification de succès
    showToast('Application installed successfully! You can now launch it from your home screen.', 'success');

    // Nettoyer la référence au prompt
    deferredPrompt = null;
}

/**
 * Vérifie si l'application est déjà installée
 */
function checkIfAlreadyInstalled() {
    // Méthode 1 : display-mode standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
        isInstalled = true;
        console.log('[PWA] Running in standalone mode (installed)');
        document.body.classList.add('pwa-standalone');
        return;
    }

    // Méthode 2 : iOS standalone
    if (window.navigator.standalone === true) {
        isInstalled = true;
        console.log('[PWA] Running in iOS standalone mode (installed)');
        document.body.classList.add('pwa-standalone');
        return;
    }

    console.log('[PWA] Running in browser mode (not installed)');
}

/**
 * Gère les mises à jour du Service Worker
 */
function handleServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] New Service Worker activated');

        // Afficher une notification de mise à jour
        showUpdateNotification();
    });
}

/**
 * Affiche une notification de mise à jour disponible
 */
function showUpdateNotification() {
    // Créer une notification toast
    const toast = document.createElement('div');
    toast.id = 'pwa-update-toast';
    toast.className = 'toast toast-info';
    toast.innerHTML = `
        <div class="toast-content">
            <strong>Update Available</strong>
            <p>A new version of Audiogravity is available.</p>
        </div>
        <div class="toast-actions">
            <button id="pwa-update-btn" class="btn-sm btn-primary">Reload</button>
            <button id="pwa-dismiss-btn" class="btn-sm btn-secondary">Later</button>
        </div>
    `;

    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--surface-bg, #fff);
        border: 1px solid var(--border-color, #ddd);
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 320px;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    // Bouton de rechargement
    document.getElementById('pwa-update-btn').addEventListener('click', () => {
        window.location.reload();
    });

    // Bouton de fermeture
    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
        toast.remove();
    });

    // Auto-dismiss après 10 secondes
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 10000);
}

/**
 * Affiche un toast (utilise le système existant si disponible)
 * @param {string} message - Message à afficher
 * @param {string} type - Type de toast (success, error, info)
 */
function showToast(message, type = 'info') {
    // Essayer d'utiliser le système de toast existant
    if (window.showToast && typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }

    // Fallback : toast simple
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--color-${type}, #333);
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialisation automatique
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWAInstallPrompt);
} else {
    initPWAInstallPrompt();
}

