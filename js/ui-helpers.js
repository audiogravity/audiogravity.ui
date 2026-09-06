import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { isNetworkError, isGatewayError } from './net-errors.js';

// Toast durations (ms)
const TOAST_DURATION_DEFAULT = 4000;
const TOAST_DURATION_LONG = 6000;
const TOAST_ANIMATION_DELAY = 10;
const TOAST_REMOVE_DELAY = 300;

// User-friendly error messages (ENGLISH)
//
// Keyed on message text, so only for errors that carry no status. A transport failure is not
// recognised here by its wording — every fetch in this codebase goes through the boundary in
// net-errors.js, which tags it, and getUserFriendlyError reads the tag. Gateway statuses are
// left to isGatewayError for the same reason: the two must not classify the same 502 in
// opposite directions. Note that isGatewayError claims a 502, 503 or 504 only when it carries
// no message — the core words its own, and those must reach the reader rather than be replaced
// by "check your connection".
const ErrorMessages = {
    'HTTP 401': 'Invalid API key. Please check your configuration.',
    'HTTP 403': 'Access denied. Insufficient permissions.',
    'HTTP 404': 'Resource not found.',
    'HTTP 500': 'Server error. Please try again later.'
};

/** The same four, keyed by status — read first, so a message is never searched for a number. */
const StatusMessages = { 401: ErrorMessages['HTTP 401'], 403: ErrorMessages['HTTP 403'],
                         404: ErrorMessages['HTTP 404'], 500: ErrorMessages['HTTP 500'] };

/** The four toast types the component styles; anything else is a wrong argument order. */
const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);

/**
 * Get a user-friendly error message from an Error object
 * @param {Error} error - The error object
 * @returns {string} - User-friendly message
 */
export function getUserFriendlyError(error) {
    // Shape before wording: nothing answered, or only a proxy did on behalf of a stopped core.
    if (isNetworkError(error) || isGatewayError(error)) {
        return 'Unable to connect to server. Please check your connection.';
    }

    // Status first, and only then the wording. The table matches a SUBSTRING, and a
    // provider's own message can contain one: the core relays "HRA API HTTP 404 for
    // /albums" as the detail of a 503, and searching that for "HTTP 404" answered
    // "Resource not found." — the provider's fault reported as the box's. A status,
    // when there is one, says what happened without reading anything.
    if (error?.status && StatusMessages[error.status]) return StatusMessages[error.status];

    // `error?.` and not `error.`: the shape guard above returns false for null, and this line then
    // threw — so the error reporter crashed instead of the error, taking the screen with it.
    const message = error?.message || '';

    // No status: the wording is all there is. Kept for errors thrown outside the fetch
    // boundary, which is the only way one reaches here without one.
    if (!error?.status) {
        for (const [key, friendlyMsg] of Object.entries(ErrorMessages)) {
            if (message.includes(key)) {
                return friendlyMsg;
            }
        }
    }

    // Default message: use the error's own detail or message if available
    return error?.detail || error?.message || 'An unexpected error occurred. Please try again.';
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
    // A wrong string is still a string: six calls once passed (message, type) and rendered an
    // unstyled notice headed "success". Say so where it can be seen, and still show something.
    if (!TOAST_TYPES.has(type)) {
        console.error(`[toast] "${type}" is not a toast type — the call is showToast(type, title, message)`);
        type = 'info';
    }
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
 *
 * The field MUST carry its styling through `.form-control`, never an inline
 * `style` attribute: an inline declaration outranks every selector, so a
 * font-size written there escapes the mobile anti-zoom rule in base.css and
 * mobile Safari zooms the page in on focus — which pushes the dialog's Confirm
 * button off-screen (site#6).
 *
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
                class="form-control form-control--dialog"
                type="password"
                placeholder="Enter your password"
                autocomplete="current-password"
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

/**
 * Save a Blob to a file on the visitor's machine.
 *
 * Two details decide whether this works or only looks like it does:
 *
 * 1. **The anchor must be in the document.** A detached `<a download>` is ignored by
 *    some browsers, and `click()` then does nothing at all — silently.
 * 2. **The object URL must outlive the click.** Revoking it on the next statement
 *    races the browser, which may not have started reading the blob yet: the click
 *    reports success and no file is ever written. It is released on a later turn of
 *    the event loop instead, so the memory is still freed.
 *
 * Takes a Blob so binary payloads go through the same two guarantees — a response
 * body, a licence file — instead of each caller rewriting the dance for itself.
 *
 * @param {Blob} blob - Contents to save.
 * @param {string} filename - Name proposed to the visitor.
 * @returns {void}
 */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), { href: url, download: filename });
    anchor.style.display = 'none';
    // In the document, not detached: several browsers ignore a programmatic click on
    // an element that is not part of the page, and report nothing when they do.
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Deferred by one turn, never on the next line: click() does not download, it asks
    // the browser to. Revoking straight after races the browser to the data and wins
    // often enough — the click "succeeds", no error is raised, and no file is written.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Offer text to the user as a file download.
 *
 * @param {string} text - File contents.
 * @param {string} filename - Name offered to the browser.
 * @param {string} [mimeType] - MIME type of the blob.
 */
export function downloadTextFile(text, filename, mimeType = 'text/plain;charset=utf-8') {
    downloadBlob(new Blob([text], { type: mimeType }), filename);
}

// Global attachment for legacy code
if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.showConfirm = showConfirm;
}
