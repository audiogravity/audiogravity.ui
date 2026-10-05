/**
 * @module AgHistoryPanel
 * @description Organism component for displaying action history lists.
 * Supports different types (profiles, services, etc.) and virtual scrolling.
 *
 * @element ag-history-panel
 *
 * @attr {string} type - History category (e.g., 'profile', 'service', 'systemd')
 * @attr {string} heading - Panel title (the `title` property). Never `title`: on the element it
 *   is a tooltip over the whole panel.
 * @attr {Array} items - History items array: [{ timestamp, action, success }]
 * @attr {number} maxItems - Maximum visible items
 *
 * @dependency css/components/history-panel.css - History zone, header and item styles
 *
 * @fires clear-history - Dispatched when Clear button is clicked
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { formatTimestamp } from '../utils-lit.js';
import { iconTrash, iconCheck, iconClose } from '../../ag-icons.js';

export class AgHistoryPanel extends LitElement {
    static properties = {
        type: { type: String },
        title: { type: String, attribute: 'heading' },
        items: { type: Array },
        maxItems: { type: Number },
    };

    constructor() {
        super();
        this.type = 'general';
        this.title = 'HISTORY';
        this.items = [];
        this.maxItems = 20;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS compliance
    }

    _handleClear() {
        this.dispatchEvent(new CustomEvent('clear-history', {
            detail: { type: this.type },
            bubbles: true,
            composed: true
        }));
    }

    _formatTimestamp(ts) {
        return formatTimestamp(ts);
    }

    render() {
        return html`
            <div class="history-zone tab-zone">
                <div class="history-header">
                    <h2>${this.title}</h2>
                    <button class="clear-btn compact" @click=${this._handleClear}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTrash}</svg> Clear
                    </button>
                </div>

                <div class="history-list" id="${this.type}History">
                    ${this.items.length === 0 ? html`
                        <div class="history-empty">No history yet</div>
                    ` : html`
                        ${this.items.map(item => html`
                            <div class="history-item ${item.success ? 'success' : 'error'}">
                                <div class="history-item-time">${this._formatTimestamp(item.timestamp)}</div>
                                <div class="history-item-action">${item.action}</div>
                                <div class="history-status">
                                    <span class="status-icon">
                                        ${item.success
                                            ? html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCheck}</svg>`
                                            : html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconClose}</svg>`}
                                    </span>
                                </div>
                            </div>
                        `)}
                    `}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-history-panel', AgHistoryPanel);
