/**
 * @module AgFilterBar
 * @description Atomic filter bar component. Renders a row of toggle buttons
 * where exactly one option is active at a time. Generic — reusable across all tabs.
 */

import { LitElement, html } from 'lit';

/**
 * Filter Bar Web Component
 * @element ag-filter-bar
 *
 * @attr {Array<{label: string, value: string}>} options - List of filter options to display
 * @attr {string} value - Currently selected filter value
 *
 * @dependency css/components/filter-bar.css - Classes .filter-bar, .filter-btn, .filter-btn.active
 *
 * @fires filter-change - Fired when the selected filter changes. Detail: { value: string }
 *
 * @example
 * <ag-filter-bar
 *     .options=${[{ label: 'ALL', value: 'all' }, { label: 'ACTIVE', value: 'active' }]}
 *     value="all"
 *     @filter-change=${e => console.log(e.detail.value)}>
 * </ag-filter-bar>
 */
export class AgFilterBar extends LitElement {
    static properties = {
        options: { type: Array },
        value:   { type: String }
    };

    constructor() {
        super();
        this.options = [];
        this.value   = '';
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    /**
     * Handles a button click and dispatches filter-change if the value changed.
     * @param {string} val - The selected filter value
     */
    _select(val) {
        if (val === this.value) return;
        this.value = val;
        this.dispatchEvent(new CustomEvent('filter-change', {
            detail: { value: val },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="filter-bar">
                ${this.options.map(opt => html`
                    <button
                        class="filter-btn ${this.value === opt.value ? 'active' : ''}"
                        @click=${() => this._select(opt.value)}>
                        ${opt.label}
                    </button>
                `)}
            </div>
        `;
    }
}

customElements.define('ag-filter-bar', AgFilterBar);
