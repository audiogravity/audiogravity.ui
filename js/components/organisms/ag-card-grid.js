/**
 * @module AgCardGrid
 * @description Smart grid container for rendering lists of cards/tiles with loading and empty states.
 *
 * @element ag-card-grid
 *
 * @attr {boolean} loading - Forces the loading state manually
 * @attr {string} error - Displays an error message inside the grid
 * @attr {string} empty-message - Message to display when the grid is empty
 * @attr {string} grid-class - CSS class applied to the internal grid container
 * @attr {number} skeleton-count - How many skeleton loaders to show (default 3)
 * @attr {string} skeleton-class - CSS class for the skeleton tile (e.g., system-tile)
 *
 * @prop {Array|null} items - The array of items to render. Null indicates loading state.
 * @prop {Function} renderItem - Function (item, index) => TemplateResult (Lit HTML template)
 *
 * @dependency ag-skeleton-loader - Loading state component
 * @dependency css/components/grid.css - Classes .card-grid, .error-message, .empty-message
 */

import { LitElement, html } from 'lit';
import '../molecules/ag-skeleton-loader.js';

export class AgCardGrid extends LitElement {
    static properties = {
        items: { type: Array },
        loading: { type: Boolean },
        error: { type: String },
        emptyMessage: { type: String, attribute: 'empty-message' },
        gridClass: { type: String, attribute: 'grid-class' },
        skeletonCount: { type: Number, attribute: 'skeleton-count' },
        skeletonClass: { type: String, attribute: 'skeleton-class' },
        renderItem: { attribute: false }
    };

    constructor() {
        super();
        this.items = null;
        this.loading = false;
        this.error = null;
        this.emptyMessage = 'No items found.';
        this.gridClass = '';
        this.skeletonCount = 3;
        this.skeletonClass = '';
        this.renderItem = () => html``;
    }

    createRenderRoot() {
        return this; // Light DOM to inherit CSS Layout (Grid) naturally
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    render() {
        if (this.error) {
            return html`<div class="error-message">${this.error}</div>`;
        }

        if (this.loading || this.items === null) {
            return html`
                <div class=${this.gridClass}>
                    <ag-skeleton-loader type="tile" count=${this.skeletonCount} extraClass=${this.skeletonClass}></ag-skeleton-loader>
                </div>
            `;
        }

        if (this.items.length === 0) {
            return html`<div class="empty-message">${this.emptyMessage}</div>`;
        }

        return html`
            <div class=${this.gridClass}>
                ${this.items.map((item, index) => this.renderItem(item, index))}
            </div>
        `;
    }
}

customElements.define('ag-card-grid', AgCardGrid);
