/**
 * @module ToastNotification
 * @description Lit-based toast notification Web Component
 * Replaces the vanilla JS showToast function with a reactive Web Component
 */

import { LitElement, html } from 'lit';
import { iconCheck, iconCircleX, iconClose, iconWarning, iconInfo } from '../../ag-icons.js';

/**
 * The types that stay until they are closed: a problem is read to the end, however long
 * that takes, instead of being timed out half-way (user decision, 2026-10-27).
 */
const STICKY_TYPES = new Set(['error', 'warning']);

/** What a screen reader says before a toast's words, for what its colour and icon show. */
const TYPE_LABELS = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Information',
};

/**
 * Toast Notification Web Component
 * @element ag-toast-notification
 *
 * @attr {string} type - Type of toast: 'success', 'error', 'warning', 'info' (default: 'info')
 * @attr {string} heading - Toast title (the `title` property; `title` would be a tooltip)
 * @attr {string} message - Toast message
 * @attr {number} duration - Duration in ms before a success or an info hides itself
 *   (default: 3000; 0 keeps it). An error or a warning stays until it is closed.
 * @attr {boolean} show - Controls visibility
 *
 * @dependency css/components/toast.css - Classes .toast, .show, and variant types
 * @fires toast-close - Fired when toast is closed
 *
 * The countdown stops while a pointer or a finger rests on the toast, or the focus is in
 * it, and starts again from the full duration once neither does.
 *
 * @example
 * <toast-notification type="success" heading="Saved" message="Configuration saved successfully" show></toast-notification>
 */
export class AgToastNotification extends LitElement {
    static properties = {
        type: { type: String },
        title: { type: String, attribute: 'heading' },
        message: { type: String },
        duration: { type: Number },
        show: { type: Boolean, reflect: true }
    };

    constructor() {
        super();
        this.type = 'info';
        this.title = '';
        this.message = '';
        this.duration = 3000;
        this.show = false;
        this._timeoutId = null;
        /** What holds the toast on screen: 'pointer' (a pointer or a finger), 'focus'. */
        this._holders = new Set();
        this._closing = false;
    }

    // Désactive Shadow DOM pour utiliser les CSS globaux (toast.css)
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
        // No live region here. One inserted already filled is not announced reliably, and this
        // one also held a hidden copy of its own words, so a reader that did announce it read
        // the toast twice. showToast says each toast once, in the page's persistent regions.
    }

    updated(changedProperties) {
        if (changedProperties.has('show') && this.show) {
            this._startAutoHide();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._clearAutoHide();
    }

    /** True from the moment the toast starts leaving: it no longer counts as on screen. */
    get closing() {
        return this._closing;
    }

    /** The toast's words as a screen reader says them: its type, then title and message. */
    get announcement() {
        return `${TYPE_LABELS[this.type] || TYPE_LABELS.info}: ${this.title}. ${this.message ?? ''}`.trim();
    }

    /**
     * Turn this toast into another message — an operation's result taking the place of its
     * "in progress" notice — and give it that message's time. (Not `update`: that name is
     * LitElement's own render step, which this would silently replace.)
     *
     * @param {string} type - 'success', 'error', 'warning' or 'info'.
     * @param {string} title - The new title.
     * @param {string} message - The new message.
     * @param {number} [duration] - Milliseconds before a success or an info hides itself;
     *   the toast's own when left out.
     */
    setMessage(type, title, message, duration) {
        this.type = type;
        this.title = title;
        this.message = message;
        if (duration !== undefined) this.duration = duration;
        if (this.show) this._startAutoHide();
    }

    _startAutoHide() {
        this._clearAutoHide();
        if (this._holders.size || STICKY_TYPES.has(this.type)) return;
        if (this.duration > 0) {
            this._timeoutId = setTimeout(() => {
                this.hide();
            }, this.duration);
        }
    }

    _clearAutoHide() {
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = null;
        }
    }

    /**
     * A pointer, a finger or the focus rests on the toast: it stays while it does.
     * @param {FocusEvent|PointerEvent} e
     */
    _hold(e) {
        this._holders.add(e?.type === 'focusin' ? 'focus' : 'pointer');
        this._clearAutoHide();
    }

    /**
     * The pointer, the finger or the focus has left: the countdown starts again once
     * neither holds the toast — a pointer passing over it while the focus is in it, from
     * the keyboard, does not send it away.
     * @param {FocusEvent|PointerEvent} e
     */
    _release(e) {
        const focus = e?.type === 'focusout';
        // Focus moving between two parts of the toast has not left it.
        if (focus && this.contains(e.relatedTarget)) return;
        this._holders.delete(focus ? 'focus' : 'pointer');
        if (this.show && !this._closing) this._startAutoHide();
    }

    hide() {
        if (this._closing) return;
        this._closing = true;
        this._clearAutoHide();
        this.show = false;
        this.dispatchEvent(new CustomEvent('toast-close', {
            bubbles: true,
            composed: true
        }));

        // Remove from DOM after animation
        setTimeout(() => {
            this.remove();
        }, 300);
    }

    _getIconSvg() {
        // A circled X for an error: the bare X is the button that closes the toast.
        const icons = {
            success: iconCheck,
            error:   iconCircleX,
            warning: iconWarning,
            info:    iconInfo
        };
        return icons[this.type] || icons.info;
    }

    render() {
        // Ajoute la classe du type (success, error, warning, info) + show si visible
        const classes = `toast ${this.type} ${this.show ? 'show' : ''}`;
        return html`
            <div class="${classes}"
                @pointerenter=${this._hold} @pointerleave=${this._release}
                @focusin=${this._hold} @focusout=${this._release}>
                <div class="toast-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${this._getIconSvg()}</svg>
                </div>
                <div class="toast-content">
                    <div class="toast-title">${this.title}</div>
                    <div class="toast-message">${this.message}</div>
                </div>
                <button type="button" class="toast-close plain-btn" aria-label="Dismiss" @click=${this.hide}>
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconClose}</svg>
                </button>
            </div>
        `;
    }
}

// Define the custom element
customElements.define('ag-toast-notification', AgToastNotification);
