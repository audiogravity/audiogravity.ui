import { html } from 'lit';
import { isNetworkError, isGatewayError } from './net-errors.js';

// Toast timings (ms). The duration is a success's or an info's: an error or a warning stays
// until it is closed (ag-toast-notification.js).
const TOAST_DURATION_DEFAULT = 4000;
const TOAST_ANIMATION_DELAY = 10;
const TOAST_REMOVE_DELAY = 300;

/** At most this many toasts on screen: past it, the oldest gives way (user decision, 2026-10-27). */
const TOAST_MAX_VISIBLE = 3;

/** The announcements a screen reader region keeps: room for a burst, and no more. */
const TOAST_ANNOUNCEMENTS_KEPT = 3;

/**
 * Counts each time a toast is said — shown, said again as a twin, or updated. A toast keeps
 * the turn it was last said at: the lowest is the oldest, which gives way first, and only
 * the handle given that turn may still change or close it.
 */
let toastTurn = 0;

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

    showToast('error', title, friendlyMessage);
}

// =====================
// TOAST NOTIFICATIONS (Lit Web Component wrapper)
// =====================

/**
 * A type the component styles, else 'info' and a report of the call.
 * @param {string} type
 * @returns {string}
 */
function toastType(type) {
    // A wrong string is still a string: seven calls once passed (message, type) and rendered an
    // unstyled notice headed "success" or "error". Say so where it can be seen, and still show
    // something; js/toast-calls.test.js keeps the calls themselves in order.
    if (TOAST_TYPES.has(type)) return type;
    console.error(`[toast] "${type}" is not a toast type — the call is showToast(type, title, message)`);
    return 'info';
}

/**
 * Say a toast to screen readers, once: an error at once, anything else when the reader is
 * free. The two regions are in index.html from the start — one created with its words
 * already in is not announced reliably. Each toast goes in as a line of its own, after the
 * others: a reader says what is added, so the same words twice are said twice, and two
 * toasts that come together are both said — emptying the region for each one dropped the
 * first. The regions are not atomic (index.html), or every line kept would be said again.
 * @param {HTMLElement & {type: string, announcement: string}} toast
 */
function announceToast(toast) {
    const region = document.getElementById(toast.type === 'error' ? 'toastAlert' : 'toastStatus');
    if (!region) return;
    const line = document.createElement('div');
    line.textContent = toast.announcement;
    region.append(line);
    while (region.childElementCount > TOAST_ANNOUNCEMENTS_KEPT) region.firstElementChild.remove();
}

/**
 * @typedef {object} ToastHandle
 * @property {(type: string, title: string, message: string, duration?: number) => ToastHandle} update
 *   Turn the toast into another message — an operation's result taking the place of its
 *   "in progress" notice. When that toast is no longer this handle's — closed, pushed out
 *   by newer ones, or said again by another call, which then owns it — the message is
 *   shown as a new toast instead, which the handle follows from then on.
 * @property {() => void} close - Close the toast now, if it is still this handle's.
 */

/**
 * @typedef {object} ToastPlace
 * @property {(HTMLElement & {turn: number, closing: boolean, show: boolean,
 *   setMessage: Function, hide: Function})|null} toast - The toast said; null on a page
 *   without a toast container.
 * @property {number} turn - The turn it was said at, which only this placing holds.
 */

/**
 * The handle of a toast just said.
 * @param {ToastPlace} place
 * @returns {ToastHandle}
 */
function toastHandle(place) {
    let { toast, turn } = place;
    // Its own toast still: not gone, not leaving, and said last by this handle — two plays
    // that shared one "Starting playback" each told their outcome in it, and the second
    // replaced the first's failure.
    const owns = () => toast?.isConnected && !toast.closing && toast.turn === turn;
    const handle = {
        update(type, title, message, duration = TOAST_DURATION_DEFAULT) {
            if (!owns()) {
                ({ toast, turn } = placeToast(type, title, message, duration));
                return handle;
            }
            toast.turn = turn = ++toastTurn;
            toast.setMessage(toastType(type), title, message, duration);
            // Not shown yet: it is said as it appears, in these words.
            if (toast.show) announceToast(toast);
            return handle;
        },
        close() {
            if (owns()) toast.hide();
        },
    };
    return handle;
}

/**
 * Put a toast on screen, or say again the identical one already there.
 * @param {string} type
 * @param {string} title
 * @param {string} message
 * @param {number} duration
 * @returns {ToastPlace}
 */
function placeToast(type, title, message, duration) {
    type = toastType(type);
    const turn = ++toastTurn;
    const container = document.getElementById('toastContainer');
    if (!container) return { toast: null, turn };

    const shown = [...container.querySelectorAll('ag-toast-notification')].filter((t) => !t.closing);
    const twin = shown.find((t) => t.type === type && t.title === title && t.message === message);
    if (twin) {
        twin.turn = turn;
        twin.setMessage(type, title, message, duration);
        return { toast: twin, turn };
    }
    // Said longest ago first, not first on the page: a toast said again is as new as its twin.
    shown.sort((a, b) => a.turn - b.turn);
    for (const oldest of shown.slice(0, Math.max(0, shown.length - TOAST_MAX_VISIBLE + 1))) oldest.hide();

    // Create Lit Web Component
    const toast = document.createElement('ag-toast-notification');
    toast.type = type;
    toast.title = title;
    toast.message = message;
    toast.duration = duration;
    toast.turn = turn;

    container.appendChild(toast);

    // Trigger show animation
    setTimeout(() => {
        toast.show = true;
        announceToast(toast);
    }, TOAST_ANIMATION_DELAY);
    return { toast, turn };
}

/**
 * Show a toast notification using Lit Web Component.
 *
 * A success or an info leaves after `duration`; an error or a warning stays until it is
 * closed. A toast identical to one still on screen is not added again — that one starts
 * its time over — and past TOAST_MAX_VISIBLE the one said longest ago gives way.
 *
 * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {number} [duration] - Milliseconds before a success or an info leaves; 0 keeps it
 *   until it is closed or updated — an operation's "in progress" notice.
 * @returns {ToastHandle} What turns the toast into the operation's result, or closes it —
 *   one that shows nothing on a page without a toast container.
 */
export function showToast(type, title, message, duration = TOAST_DURATION_DEFAULT) {
    return toastHandle(placeToast(type, title, message, duration));
}

// =====================
// CONFIRM MODAL
// =====================

/** A tag, opening or closing: what a text message is not expected to hold. */
const MARKUP = /<\/?[a-zA-Z][\w-]*(\s[^<>]*)?>/;

/**
 * Say in the console that a text message looks like markup: it is shown as
 * text, tags included. Mirrors showToast's wrong-type report — the dialog still
 * opens, the mistake is visible where a developer looks.
 *
 * @param {string} caller - The helper that received the message.
 * @param {string} message - The text message.
 */
function reportMarkup(caller, message) {
    if (MARKUP.test(message)) {
        console.error(`[${caller}] a text message is shown as text, tags included — `
            + `pass an html\`\` template for markup: ${message.slice(0, 80)}`);
    }
}

/**
 * Show a confirm dialog using Lit Web Component
 *
 * A string message is shown as TEXT: a name typed by a user, a label from the
 * network, a `<` — all displayed, never read as markup. A message that needs
 * markup (`<strong>`, a list) is a Lit `html\`…\`` template, whose
 * interpolations Lit renders as text too. Nothing here goes through unsafeHTML,
 * so no caller has to escape anything — and none may, or `&lt;` would show.
 *
 * @param {string} title - Dialog title
 * @param {string|TemplateResult} message - Plain text, or a Lit TemplateResult for markup
 * @param {object|string} options - Options: { isInfo: boolean, okLabel: string, cancelLabel: string,
 *   destructive: boolean } or legacy okLabel. `destructive` — the action deletes or removes
 *   something, or throws away unsaved changes: OK is orange and Cancel is focused.
 * @param {string} [cancelLabel_legacy] - Legacy cancel label if options was a string
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
export function showConfirm(title, message, options = {}, cancelLabel_legacy = null) {
    return new Promise((resolve) => {
        // Create Lit Web Component
        const dialog = document.createElement('ag-confirm-dialog');
        const opts = typeof options === 'string' ? { okLabel: options, cancelLabel: cancelLabel_legacy } : options;
        
        dialog.title = title;
        // A string interpolated by Lit is text; a TemplateResult (html`…`) is passed
        // through unchanged. Going through messageTemplate keeps a single rendering
        // path in ag-confirm-dialog.
        if (typeof message === 'string') {
            reportMarkup('showConfirm', message);
            dialog.messageTemplate = html`${message}`;
        } else {
            dialog.messageTemplate = message;
        }
        dialog.infoMode = opts.isInfo || false;
        dialog.destructive = opts.destructive || false;
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
 * Ask before taking one item out of a list: "Remove <name> from <list>?".
 *
 * A Lit template, for the `<strong>` around the name; Lit renders the name
 * itself as text. The names asked about here come from the network — a station
 * from the Radio Browser catalogue, the friendly name any UPnP device announces
 * — and must be shown as text, not read as markup.
 *
 * @param {string} title - Dialog title, e.g. 'Remove station'.
 * @param {string} name - The item, as its row shows it.
 * @param {string} list - The list it leaves, as the screen names it.
 * @param {string} [note] - A sentence after the question, when removing costs
 *   more than the row.
 * @returns {Promise<boolean>} True when the user confirmed.
 */
export function confirmRemoval(title, name, list, note = '') {
    return showConfirm(
        title,
        html`Remove <strong>${name}</strong> from ${list}?${note ? html` ${note}` : ''}`,
        { okLabel: 'Remove', destructive: true },
    );
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
 * @param {string|TemplateResult} message - Plain text, shown as text — or a Lit
 *   TemplateResult for markup, as for {@link showConfirm}
 * @param {{destructive?: boolean}} [options] - `destructive`: the action deletes or
 *   removes something — Confirm is orange (see showConfirm)
 * @returns {Promise<string|null>} Resolves with the entered password, or null if cancelled
 */
export function showPasswordConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        const dialog = document.createElement('ag-confirm-dialog');
        dialog.title = title;
        dialog.okLabel = 'Confirm';
        dialog.destructive = options.destructive || false;

        const inputId = `pwd-confirm-${Date.now()}`;
        if (typeof message === 'string') reportMarkup('showPasswordConfirm', message);
        dialog.messageTemplate = html`
            <p style="margin: 0 0 var(--spacing-md);">${message}</p>
            <input
                id=${inputId}
                class="form-control form-control--raised"
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
        // The dialog focuses the field itself once shown (ag-confirm-dialog.updated).
        setTimeout(() => { dialog.show = true; }, TOAST_ANIMATION_DELAY);
    });
}

/**
 * Copy text to the clipboard, with execCommand fallback for HTTP contexts.
 * navigator.clipboard requires HTTPS; execCommand works on plain HTTP.
 *
 * Rejects when nothing was copied. The fallback reports failure by RETURNING false, not
 * by throwing, and that value used to be ignored: every caller — which all show "Copied"
 * unless this throws — told the reader their text was on the clipboard when it was not.
 * @param {string} text
 * @returns {Promise<void>}
 * @throws {Error} when neither the Clipboard API nor the fallback copied the text
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
    let copied = false;
    try {
        ta.select();
        copied = document.execCommand('copy');
    } finally {
        document.body.removeChild(ta);
    }
    if (!copied) throw new Error('The browser refused to copy to the clipboard');
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
