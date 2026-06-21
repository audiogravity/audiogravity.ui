/**
 * @module AgSkeletonLoader
 * @description Lit-based skeleton loader Web Component
 * Replaces the vanilla JS SkeletonLoader with a reactive Web Component.
 * Styles are managed in frontend/css/components/skeleton.css.
 */

import { LitElement, html } from 'lit';

/**
 * Skeleton Loader Web Component
 * @element ag-skeleton-loader
 *
 * @attr {string} type - Type of skeleton: 'tile', 'list', or 'spinner' (default: 'tile')
 * @attr {number} count - Number of skeleton items to render (default: 3)
 * @attr {string} message - Loading message for spinner type (default: 'Loading...')
 * @attr {string} extraClass - Additional CSS class for tile type
 * 
 * @dependency css/components/skeleton.css - Skeleton animation and layout styles
 */
export class AgSkeletonLoader extends LitElement {
    static properties = {
        type: { type: String },
        count: { type: Number },
        message: { type: String },
        extraClass: { type: String }
    };

    constructor() {
        super();
        this.type = 'tile';
        this.count = 3;
        this.message = 'Loading...';
        this.extraClass = '';
    }

    // Désactive Shadow DOM pour utiliser les CSS globaux
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    renderTile() {
        const tiles = [];
        for (let i = 0; i < this.count; i++) {
            tiles.push(html`
                <div class="tile ${this.extraClass}">
                    <div class="tile-header">
                        <div class="skeleton-text skeleton-title"></div>
                    </div>
                    <div class="tile-body">
                        <div class="skeleton-text skeleton-line"></div>
                        <div class="skeleton-text skeleton-line"></div>
                        <div class="skeleton-text skeleton-line short"></div>
                    </div>
                    <div class="tile-footer">
                        <div class="skeleton-button"></div>
                    </div>
                </div>
            `);
        }
        return tiles;
    }

    renderList() {
        const items = [];
        for (let i = 0; i < this.count; i++) {
            items.push(html`
                <div class="history-item skeleton">
                    <div class="skeleton-text skeleton-line"></div>
                </div>
            `);
        }
        return items;
    }

    renderSpinner() {
        return html`
            <div class="loading">
                <div class="spinner"></div>
                <span>${this.message}</span>
            </div>
        `;
    }

    render() {
        switch (this.type) {
            case 'list':
                return this.renderList();
            case 'spinner':
                return this.renderSpinner();
            case 'tile':
            default:
                return this.renderTile();
        }
    }
}

// Define the custom element
customElements.define('ag-skeleton-loader', AgSkeletonLoader);
