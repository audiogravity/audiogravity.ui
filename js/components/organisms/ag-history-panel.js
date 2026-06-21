/**
 * @module AgHistoryPanel
 * @description Organism component for displaying action history lists.
 * Supports different types (profiles, services, etc.) and virtual scrolling.
 *
 * @element ag-history-panel
 *
 * @attr {string} type - History category (e.g., 'profile', 'service', 'systemd')
 * @attr {string} title - Panel title
 * @attr {Array} items - History items array: [{ timestamp, action, success }]
 * @attr {number} maxItems - Maximum visible items
 * @attr {boolean} collapsible - Enables collapse/expand toggle button
 *
 * @dependency css/components/history-panel.css - History zone, header and item styles
 *
 * @fires clear-history - Dispatched when Clear button is clicked
 * @fires panel-collapse - Dispatched when panel is collapsed
 * @fires panel-expand - Dispatched when panel is expanded
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { formatTimestamp } from '../utils-lit.js';
import { iconTrash, iconCheck, iconClose } from '../../ag-icons.js';

export class AgHistoryPanel extends LitElement {
    static properties = {
        type: { type: String },
        title: { type: String },
        items: { type: Array },
        maxItems: { type: Number },
        collapsible: { type: Boolean },
        _collapsed: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.type = 'general';
        this.title = 'HISTORY';
        this.items = [];
        this.maxItems = 20;
        this.collapsible = false;
        this._collapsed = false;
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

    _toggleCollapse() {
        this._collapsed = !this._collapsed;
        this.dispatchEvent(new CustomEvent(
            this._collapsed ? 'panel-collapse' : 'panel-expand',
            { bubbles: true, composed: true }
        ));
    }

    _formatTimestamp(ts) {
        return formatTimestamp(ts);
    }

    render() {
        if (this.collapsible && this._collapsed) {
            return html`
                <div class="history-zone tab-zone" style="width: 32px; min-width: 32px; padding: 8px 0; display: flex; flex-direction: column; align-items: center; gap: 10px; overflow: hidden;">
                    <button
                        class="clear-btn compact"
                        style="width: 24px; height: 24px; padding: 0; font-size: 14px; display: flex; align-items: center; justify-content: center;"
                        title="Expand panel"
                        @click=${this._toggleCollapse}
                    >›</button>
                    <span style="writing-mode: vertical-rl; transform: rotate(180deg); color: var(--text-tertiary); font-size: 9px; font-weight: 700; letter-spacing: 1px; white-space: nowrap; margin-top: 4px;">${this.title}</span>
                </div>
            `;
        }

        return html`
            <div class="history-zone tab-zone">
                <div class="history-header">
                    <h2>${this.title}</h2>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${this.collapsible ? html`
                            <button
                                class="clear-btn compact"
                                style="opacity: 0.7;"
                                title="Collapse panel"
                                @click=${this._toggleCollapse}
                            >‹</button>
                        ` : ''}
                        <button class="clear-btn compact" @click=${this._handleClear}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTrash}</svg> Clear
                        </button>
                    </div>
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
