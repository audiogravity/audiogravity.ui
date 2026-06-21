/**
 * @module ToastNotification
 * @description Lit-based toast notification Web Component
 * Replaces the vanilla JS showToast function with a reactive Web Component
 */

import { LitElement, html } from 'lit';
import { iconCheck, iconClose, iconWarning, iconInfo } from '../../ag-icons.js';

/**
 * Toast Notification Web Component
 * @element ag-toast-notification
 *
 * @attr {string} type - Type of toast: 'success', 'error', 'warning', 'info' (default: 'info')
 * @attr {string} title - Toast title
 * @attr {string} message - Toast message
 * @attr {number} duration - Duration in ms before auto-hide (default: 3000)
 * @attr {boolean} show - Controls visibility
 *
 * @dependency css/components/toast.css - Classes .toast, .show, and variant types
 * @fires toast-close - Fired when toast is closed
 *
 * @example
 * <toast-notification type="success" title="Saved" message="Configuration saved successfully" show></toast-notification>
 */
export class AgToastNotification extends LitElement {
    static properties = {
        type: { type: String },
        title: { type: String },
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
    }

    // Désactive Shadow DOM pour utiliser les CSS globaux (toast.css)
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
        // Set ARIA attributes
        this.setAttribute('role', 'status');
        this.setAttribute('aria-live', this.type === 'error' ? 'assertive' : 'polite');
        this.setAttribute('aria-atomic', 'true');
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

    _startAutoHide() {
        this._clearAutoHide();
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

    hide() {
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
        const icons = {
            success: iconCheck,
            error:   iconClose,
            warning: iconWarning,
            info:    iconInfo
        };
        return icons[this.type] || icons.info;
    }

    _getAriaLabel() {
        const labels = {
            success: 'Success notification',
            error: 'Error notification',
            warning: 'Warning notification',
            info: 'Information notification'
        };
        return labels[this.type] || labels.info;
    }

    render() {
        // Ajoute la classe du type (success, error, warning, info) + show si visible
        const classes = `toast ${this.type} ${this.show ? 'show' : ''}`;
        return html`
            <div class="${classes}">
                <div class="toast-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${this._getIconSvg()}</svg>
                </div>
                <div class="toast-content">
                    <div class="toast-title">${this.title}</div>
                    <div class="toast-message">${this.message}</div>
                </div>
                <span class="sr-only">${this._getAriaLabel()}: ${this.title}. ${this.message}</span>
            </div>
        `;
    }
}

// Define the custom element
customElements.define('ag-toast-notification', AgToastNotification);
