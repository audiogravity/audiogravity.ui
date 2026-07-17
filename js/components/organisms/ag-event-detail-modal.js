/**
 * @module AgEventDetailModal
 * @description Modal for displaying JSON details of system events.
 */

import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import './ag-modal.js';

/**
 * Event Detail Modal Web Component
 * @element ag-event-detail-modal
 * 
 * @property {Boolean} isOpen - Modal visibility state
 * @property {Object} eventPayload - The event data to display in JSON format
 * 
 * @fires close-request - Dispatched when the modal requests to close
 * 
 * @dependency ag-modal
 * @dependency css/system.css - Defines .json-viewer, .json-key, .json-string classes
 */
export class AgEventDetailModal extends LitElement {
    static properties = {
        isOpen: { type: Boolean, attribute: 'is-open' },
        eventPayload: { type: Object }
    };

    constructor() {
        super();
        this.isOpen = false;
        this.eventPayload = null;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS (modal classes, json formatting)
    }

    /**
     * Public API to open the modal with specific payload
     * @param {Object} payload 
     */
    open(payload) {
        this.eventPayload = payload;
        this.isOpen = true;
    }

    _handleClose() {
        this.isOpen = false;
        this.dispatchEvent(new CustomEvent('close-request', { bubbles: true, composed: true }));
    }

    /**
     * Syntax-highlight a JSON object into HTML spans.
     * SECURITY NOTE: unsafeHTML is safe here because _highlightJson() systematically escapes
     * &, <, > via .replace() BEFORE injecting any <span> tags. The only HTML inserted
     * are hardcoded CSS class span wrappers — no user/API data reaches the HTML unescaped.
     */
    _highlightJson(obj) {
        if (!obj) return '';
        const json = JSON.stringify(obj, null, 2);
        const highlighted = json
            .replace(/&/g, '&amp;')   // Must be first
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(
                /(\"(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*\"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
                (match) => {
                    let cls = 'json-number';
                    if (/^"/.test(match)) {
                        cls = /:$/.test(match) ? 'json-key' : 'json-string';
                    } else if (/true|false/.test(match)) {
                        cls = 'json-boolean';
                    } else if (/null/.test(match)) {
                        cls = 'json-null';
                    }
                    return `<span class="${cls}">${match}</span>`;
                }
            );
        return highlighted;
    }

    render() {
        const highlightedHtml = this._highlightJson(this.eventPayload);

        return html`
            <ag-modal 
                ?show=${this.isOpen} 
                @modal-close=${this._handleClose}
                title="Event Details"
                size="large"
                .bodyTemplate=${html`
                    <pre class="json-viewer">${unsafeHTML(highlightedHtml)}</pre>
                `}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-event-detail-modal', AgEventDetailModal);
