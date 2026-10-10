/**
 * @module ConfirmDialog
 * @description Lit-based confirm/modal dialog Web Component
 * Replaces the vanilla JS showConfirm function with a reactive Web Component
 */

import { LitElement, html } from 'lit';
import './ag-modal.js';

/**
 * Confirm Dialog Web Component
 * @element ag-confirm-dialog
 *
 * @attr {string} title - Dialog title
 * @attr {string} message - Dialog message, shown as text (markup: set `messageTemplate`
 *   to a Lit TemplateResult)
 * @attr {boolean} show - Controls visibility
 * @attr {boolean} info-mode - If true, hides cancel button (info modal)
 * @attr {boolean} destructive - The action deletes or removes something: OK is orange,
 *   the colour of every button that destroys, and Cancel is the one focused on opening,
 *   so that Enter does not delete
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
        destructive: { type: Boolean },
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
        this.destructive = false;
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
            // After the animation, focus what Enter should do: a field to fill when the
            // message holds one (a password), else OK — or Cancel when OK destroys. It
            // looked for `.action-btn.primary`, which the buttons never wore, so nothing
            // was ever focused.
            setTimeout(() => {
                const target = this.querySelector('.modal-body input, .modal-body textarea, .modal-body select')
                    ?? this.querySelector(`[data-dialog="${this.destructive && !this.infoMode ? 'cancel' : 'ok'}"]`);
                target?.focus();
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
                        ${this.messageTemplate ? this.messageTemplate : (this.message || '')}
                    </div>
                `}
                .footerTemplate=${html`
                    ${!this.infoMode ? html`
                        <button class="action-btn secondary" data-dialog="cancel" @click=${() => this._handleCancel()}>
                            ${this.cancelLabel}
                        </button>
                    ` : ''}
                    <button class="action-btn ${this.destructive ? 'warning' : 'primary'}" data-dialog="ok"
                        @click=${() => this._handleConfirm()}>
                        ${this.okLabel}
                    </button>
                `}>
            </ag-modal>
        `;
    }
}

// Define the custom element
customElements.define('ag-confirm-dialog', AgConfirmDialog);
