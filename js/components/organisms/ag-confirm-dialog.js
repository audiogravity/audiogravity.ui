/**
 * @module ConfirmDialog
 * @description Lit-based confirm/modal dialog Web Component
 * Replaces the vanilla JS showConfirm function with a reactive Web Component
 */

import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import './ag-modal.js';

/**
 * Confirm Dialog Web Component
 * @element ag-confirm-dialog
 *
 * @attr {string} title - Dialog title
 * @attr {string} message - Dialog message (supports HTML)
 * @attr {boolean} show - Controls visibility
 * @attr {boolean} info-mode - If true, hides cancel button (info modal)
 * @ok-label {string} - Label for OK button (default: "OK")
 * @cancel-label {string} - Label for Cancel button (default: "Cancel")
 *
 * @dependency ag-modal
 * @dependency css/components/button.css, css/components/modal.css - Button and modal styles
 * @fires dialog-confirm - Fired when user clicks OK
 * @fires dialog-cancel - Fired when user clicks Cancel or closes
 *
 * @example
 * const dialog = document.createElement('ag-confirm-dialog');
 * dialog.title = "Confirm Action";
 * dialog.message = "Are you sure?";
 * dialog.show = true;
 * dialog.addEventListener('dialog-confirm', () => console.log('Confirmed'));
 */
export class AgConfirmDialog extends LitElement {
    static properties = {
        title: { type: String },
        message: { type: String },
        messageTemplate: { attribute: false },
        show: { type: Boolean, reflect: true },
        infoMode: { type: Boolean, attribute: 'info-mode' },
        okLabel: { type: String, attribute: 'ok-label' },
        cancelLabel: { type: String, attribute: 'cancel-label' }
    };

    constructor() {
        super();
        this.title = '';
        this.message = '';
        this.messageTemplate = null;
        this.show = false;
        this.infoMode = false;
        this.okLabel = 'OK';
        this.cancelLabel = 'Cancel';
        this._previousFocus = null;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    updated(changedProperties) {
        if (changedProperties.has('show') && this.show) {
            // Focus OK button after animation
            setTimeout(() => {
                // In Light DOM, the primary button is directly inside this element
                const okBtn = this.querySelector('.action-btn.primary');
                if (okBtn) okBtn.focus();
            }, 100);
        }
    }

    _handleCancel() {
        this.show = false;
        this.dispatchEvent(new CustomEvent('dialog-cancel', {
            bubbles: true,
            composed: true
        }));
    }

    _handleConfirm() {
        this.show = false;
        this.dispatchEvent(new CustomEvent('dialog-confirm', {
            bubbles: true,
            composed: true
        }));
    }

    _handleModalClose() {
        this._handleCancel();
    }

    render() {
        // Apply modal-info to ag-modal host to trigger components/modal.css specific center alignment
        // for info modals
        const modalClasses = this.infoMode ? 'modal-info' : '';

        return html`
            <ag-modal
                class=${modalClasses}
                .title=${this.title}
                .show=${this.show}
                @modal-close=${() => this._handleModalClose()}
                .bodyTemplate=${html`
                    <div id="dialogMessage">
                        ${this.messageTemplate ? this.messageTemplate : unsafeHTML(this.message || '')}
                    </div>
                `}
                .footerTemplate=${html`
                    ${!this.infoMode ? html`
                        <button class="btn-action" @click=${() => this._handleCancel()}>
                            ${this.cancelLabel}
                        </button>
                    ` : ''}
                    <button class="btn-action" @click=${() => this._handleConfirm()}>
                        ${this.okLabel}
                    </button>
                `}>
            </ag-modal>
        `;
    }
}

// Define the custom element
customElements.define('ag-confirm-dialog', AgConfirmDialog);
