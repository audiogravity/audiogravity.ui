/**
 * @module AgDocsModal
 * @description Full-screen modal for displaying documentation (e.g. the Swagger API reference) in an iframe.
 * 
 * @element ag-docs-modal
 * 
 * @attr {boolean} is-open - Modal visibility state
 * @attr {string} title - Page title for the viewer
 * @attr {string} src - URL of the document to load in the iframe
 * 
 * @dependency css/components/modal.css - Docs modal and viewer styles
 * 
 * @fires docs-close - Dispatched when the modal is closed
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

export class AgDocsModal extends LitElement {
    static properties = {
        isOpen: { type: Boolean, attribute: 'is-open' },
        title: { type: String },
        src: { type: String }
    };

    constructor() {
        super();
        this.isOpen = false;
        this.title = 'Documentation';
        this.src = '';
        this._handleKeyDown = this._handleKeyDown.bind(this);
    }

    createRenderRoot() {
        return this; // Light DOM — picks up .docs-modal from modal.css
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this._handleKeyDown);

        // Ensure base classes are present
        this.classList.add('docs-modal');
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this._handleKeyDown);
    }

    updated(changedProperties) {
        if (changedProperties.has('isOpen')) {
            if (this.isOpen) {
                this.classList.add('show');
            } else {
                this.classList.remove('show');
                // Clear the src after transition to stop any processes in iframe
                setTimeout(() => {
                    this.src = '';
                }, 300);
            }
        }
    }

    open(title, src) {
        this.title = title || 'Documentation';
        this.src = src;
        this.isOpen = true;
    }

    close() {
        this.isOpen = false;
        this.dispatchEvent(new CustomEvent('docs-close', { bubbles: true, composed: true }));
    }

    _handleKeyDown(e) {
        if (this.isOpen && e.key === 'Escape') {
            this.close();
        }
    }

    render() {
        return html`
            <div class="docs-modal-header">
                <h3>${this.title}</h3>
                <button class="modal-close" @click=${this.close} aria-label="Close">&times;</button>
            </div>
            <div class="docs-modal-content">
                <iframe src="${this.src}" style="border: 0;" loading="lazy"></iframe>
            </div>
        `;
    }
}

customElements.define('ag-docs-modal', AgDocsModal);
