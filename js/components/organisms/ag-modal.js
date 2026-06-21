/**
 * @module AgModal
 * @description Generic Modal Web Component using Lit
 * Functions as a container for other modal contents (like form or logs).
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * Generic Modal Web Component
 * @element ag-modal
 *
 * @attr {string} title - Dialog title
 * @attr {boolean} show - Controls visibility
 * @attr {string} size - Modal size ('normal', 'large', 'premium')
 * @attr {boolean} no-backdrop-close - Prevent closing when clicking outside
 * @attr {boolean} no-escape-close - Prevent closing with Escape key
 *
 * @prop {Object|Array} bodyTemplate - Lit template or DOM node for the modal body
 * @prop {Object|Array} footerTemplate - Lit template or DOM node for the footer buttons
 *
 * @dependency css/components/modal.css - Modal overlay and dialog styles
 * @fires modal-close - Fired when the user intents to close the modal (cross, backdrop, or escape)
 */
export class AgModal extends LitElement {
    static properties = {
        title: { type: String },
        show: { type: Boolean, reflect: true },
        size: { type: String },
        noBackdropClose: { type: Boolean, attribute: 'no-backdrop-close' },
        noEscapeClose: { type: Boolean, attribute: 'no-escape-close' },
        bodyTemplate: { type: Object },
        footerTemplate: { type: Object },
        _previousFocus: { state: true }
    };

    constructor() {
        super();
        this.title = '';
        this.show = false;
        this.size = 'normal';
        this.noBackdropClose = false;
        this.noEscapeClose = false;
        this.bodyTemplate = null;
        this.footerTemplate = null;
        this._previousFocus = null;
    }

    createRenderRoot() {
        return this; // Light DOM to use global CSS
    }

    connectedCallback() {
        super.connectedCallback();
        this.setAttribute('role', 'dialog');
        this.setAttribute('aria-modal', 'true');

        // The host element itself acts as the overlay wrapper, so it must always have this class
        this.classList.add('modal-overlay');

        // Handle backdrop click
        this.addEventListener('click', (e) => {
            // If the element clicked is the ag-modal itself (which acts as the overlay)
            if (e.target === this && !this.noBackdropClose) {
                this._requestClose();
            }
        });
    }

    updated(changedProperties) {
        if (changedProperties.has('show')) {
            if (this.show) {
                this._saveFocus();
                if (!this.noEscapeClose) {
                    this._setupKeyboardTrap();
                }
                this.classList.add('show');
                if (this.size === 'premium') this.classList.add('modal-premium');
            } else {
                this._restoreFocus();
                this._removeKeyboardTrap();
                this.classList.remove('show', 'modal-premium');
            }
        }
    }

    _saveFocus() {
        this._previousFocus = document.activeElement;
    }

    _restoreFocus() {
        if (this._previousFocus && this._previousFocus.focus) {
            this._previousFocus.focus();
        }
    }

    _setupKeyboardTrap() {
        this._handleEscape = (e) => {
            if (e.key === 'Escape') {
                this._requestClose();
            }
        };
        // Use capture phase to ensure it runs before focused elements handle it
        document.addEventListener('keydown', this._handleEscape, true);
    }

    _removeKeyboardTrap() {
        if (this._handleEscape) {
            document.removeEventListener('keydown', this._handleEscape, true);
        }
    }

    _requestClose() {
        this.dispatchEvent(new CustomEvent('modal-close', {
            bubbles: true,
            composed: true
        }));
    }

    render() {
        const dialogClasses = {
            'modal-dialog': true,
            [`modal-${this.size}`]: this.size !== 'normal'
        };

        return html`
            <div class=${classMap(dialogClasses)} role="document" @click=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h3>${this.title}</h3>
                    <button
                        class="modal-close"
                        @click=${this._requestClose}
                        aria-label="Close dialog">
                        ×
                    </button>
                </div>
                <div class="modal-body">
                    ${this.bodyTemplate || ''}
                </div>
                <div class="modal-footer">
                    ${this.footerTemplate || ''}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-modal', AgModal);
