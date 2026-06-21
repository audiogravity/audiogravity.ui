import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

// Toast durations (ms)
const TOAST_DURATION_DEFAULT = 4000;
const TOAST_DURATION_LONG = 6000;
const TOAST_ANIMATION_DELAY = 10;
const TOAST_REMOVE_DELAY = 300;

// User-friendly error messages (ENGLISH)
const ErrorMessages = {
    'Failed to fetch': 'Unable to connect to server. Please check your connection.',
    'NetworkError': 'Network error. Please check your internet connection.',
    'HTTP 401': 'Invalid API key. Please check your configuration.',
    'HTTP 403': 'Access denied. Insufficient permissions.',
    'HTTP 404': 'Resource not found.',
    'HTTP 500': 'Server error. Please try again later.',
    'HTTP 502': 'Bad gateway. Server is temporarily unavailable.',
    'HTTP 503': 'Service temporarily unavailable. Please try again later.',
    'HTTP 504': 'Gateway timeout. Server took too long to respond.'
};

/**
 * Get a user-friendly error message from an Error object
 * @param {Error} error - The error object
 * @returns {string} - User-friendly message
 */
export function getUserFriendlyError(error) {
    const message = error.message || '';

    // Check for specific error patterns
    for (const [key, friendlyMsg] of Object.entries(ErrorMessages)) {
        if (message.includes(key)) {
            return friendlyMsg;
        }
    }

    // Default message: use the error's own detail or message if available
    return error.detail || error.message || 'An unexpected error occurred. Please try again.';
}

/**
 * Handle errors globally by logging and showing a toast
 * @param {Error} error - Error object
 * @param {string} context - Context where the error occurred
 */
export function handleError(error, context = '') {
    console.error(`Error ${context}:`, error);

    const friendlyMessage = getUserFriendlyError(error);
    const title = context || 'Error';

    showToast('error', title, friendlyMessage, TOAST_DURATION_LONG);
}

// =====================
// TOAST NOTIFICATIONS (Lit Web Component wrapper)
// =====================

/**
 * Show a toast notification using Lit Web Component
 * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {number} duration - Duration in ms before auto-hide
 */
export function showToast(type, title, message, duration = TOAST_DURATION_DEFAULT) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Create Lit Web Component
    const toast = document.createElement('ag-toast-notification');
    toast.type = type;
    toast.title = title;
    toast.message = message;
    toast.duration = duration;

    container.appendChild(toast);

    // Trigger show animation
    setTimeout(() => {
        toast.show = true;
    }, TOAST_ANIMATION_DELAY);
}

// =====================
// CONFIRM MODAL
// =====================

/**
 * Show a confirm dialog using Lit Web Component
 * @param {string} title - Dialog title
 * @param {string|TemplateResult} message - Dialog message (supports HTML or Lit TemplateResult)
 * @param {object|string} options - Options: { isInfo: boolean, okLabel: string, cancelLabel: string } or legacy okLabel
 * @param {string} [cancelLabel_legacy] - Legacy cancel label if options was a string
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
export function showConfirm(title, message, options = {}, cancelLabel_legacy = null) {
    return new Promise((resolve) => {
        // Create Lit Web Component
        const dialog = document.createElement('ag-confirm-dialog');
        const opts = typeof options === 'string' ? { okLabel: options, cancelLabel: cancelLabel_legacy } : options;
        
        dialog.title = title;
        // SECURITY: Si le message est une string, on la convertit en TemplateResult Lit
        // après avoir sanitisé les données dynamiques.
        // Cela évite que unsafeHTML dans ag-confirm-dialog ne reçoive des données brutes.
        // Les messages qui sont déjà des TemplateResult Lit (html`...`) restent inchangés.
        if (typeof message === 'string') {
            // SECURITY: Les strings passées à showConfirm sont wrappées dans un TemplateResult Lit
            // via unsafeHTML. La responsabilité de sanitiser les variables dynamiques appartient
            // à l'appelant (escapeHtml sur les données backend avant interpolation).
            // Ce chemin évite que dialog.message ne soit utilisé, ce qui court-circuitait le
            // système de templates Lit dans ag-confirm-dialog.
            dialog.messageTemplate = html`${unsafeHTML(message)}`;
        } else {
            dialog.messageTemplate = message;
        }
        dialog.infoMode = opts.isInfo || false;
        if (opts.okLabel) dialog.okLabel = opts.okLabel;
        if (opts.cancelLabel) dialog.cancelLabel = opts.cancelLabel;

        // Event listeners
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            dialog.removeEventListener('dialog-confirm', handleConfirm);
            dialog.removeEventListener('dialog-cancel', handleCancel);
            // Remove from DOM after animation
            setTimeout(() => {
                if (dialog.parentNode) {
                    dialog.remove();
                }
            }, TOAST_REMOVE_DELAY);
        };

        dialog.addEventListener('dialog-confirm', handleConfirm);
        dialog.addEventListener('dialog-cancel', handleCancel);

        // Append to body
        document.body.appendChild(dialog);

        // Show after a tick to trigger animation
        setTimeout(() => {
            dialog.show = true;
        }, TOAST_ANIMATION_DELAY);
    });
}

/**
 * Show a temporary "HUD" overlay with the active tab name.
 * Uses a permanent #hud-container element (already in the DOM) to avoid
 * create/remove timing issues that cause flickering.
 * @param {string} label - The tab label to display
 */
export function showTabHUD(label) {
    const hud = document.querySelector('#hud-container .tab-hud');
    if (!hud) return;

    // Cancel any pending dismiss
    if (hud._dismissTimer) clearTimeout(hud._dismissTimer);

    // Update label and show — element is persistent in DOM so transition fires directly
    hud.textContent = label;
    hud.classList.add('show');

    // Dismiss after 1s
    hud._dismissTimer = setTimeout(() => {
        hud.classList.remove('show');
    }, 1000);
}

/**
 * Show a confirmation dialog that requires the user to enter their password.
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message (HTML string)
 * @returns {Promise<string|null>} Resolves with the entered password, or null if cancelled
 */
export function showPasswordConfirm(title, message) {
    return new Promise((resolve) => {
        const dialog = document.createElement('ag-confirm-dialog');
        dialog.title = title;
        dialog.okLabel = 'Confirm';

        const inputId = `pwd-confirm-${Date.now()}`;
        dialog.messageTemplate = html`
            <p style="margin: 0 0 var(--spacing-md);">${unsafeHTML(message)}</p>
            <input
                id=${inputId}
                type="password"
                placeholder="Enter your password"
                autocomplete="current-password"
                style="width: 100%; padding: var(--spacing-sm); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); background: var(--bg-secondary); color: var(--text-primary); font-size: var(--font-size-sm); box-sizing: border-box;"
                @keydown=${(e) => { if (e.key === 'Enter') dialog._handleConfirm?.(); }}
            />
        `;

        const handleConfirm = () => {
            const value = dialog.querySelector(`#${inputId}`)?.value ?? null;
            cleanup();
            resolve(value || null);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            dialog.removeEventListener('dialog-confirm', handleConfirm);
            dialog.removeEventListener('dialog-cancel', handleCancel);
            setTimeout(() => { if (dialog.parentNode) dialog.remove(); }, TOAST_REMOVE_DELAY);
        };

        dialog.addEventListener('dialog-confirm', handleConfirm);
        dialog.addEventListener('dialog-cancel', handleCancel);

        document.body.appendChild(dialog);
        setTimeout(() => {
            dialog.show = true;
            setTimeout(() => dialog.querySelector(`#${inputId}`)?.focus(), 150);
        }, TOAST_ANIMATION_DELAY);
    });
}

/**
 * Copy text to the clipboard, with execCommand fallback for HTTP contexts.
 * navigator.clipboard requires HTTPS; execCommand works on plain HTTP.
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
    if (navigator.clipboard) {
        try { await navigator.clipboard.writeText(text); return; } catch { /* fall through */ }
    }
    const ta = Object.assign(document.createElement('textarea'), {
        value: text,
        readOnly: true,
    });
    Object.assign(ta.style, { position: 'fixed', top: '-9999px', left: '-9999px', opacity: '0' });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

// Global attachment for legacy code
if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.showConfirm = showConfirm;
}
