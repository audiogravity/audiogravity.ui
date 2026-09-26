/**
 * @module AgEventDetailModal
 * @description Modal for displaying JSON details of system events.
 */

import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import './ag-modal.js';
import { highlightJson } from '../../core/code-highlight.js';

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
 * @dependency css/system.css - Defines .json-viewer and the colours of its .hl-* tokens
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
     * Syntax-highlight a JSON object into HTML spans, with the colourer the manual's code
     * blocks use (core/code-highlight.js).
     * SECURITY NOTE: unsafeHTML is safe here because highlightJson() escapes every character
     * of the text it is given (&, <, >) and inserts nothing but its own token <span>s — no
     * user/API data reaches the HTML unescaped.
     * @param {?Object} obj - the event payload
     * @returns {string} the highlighted HTML, empty when there is no payload
     */
    _highlightJson(obj) {
        if (!obj) return '';
        return highlightJson(JSON.stringify(obj, null, 2));
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
