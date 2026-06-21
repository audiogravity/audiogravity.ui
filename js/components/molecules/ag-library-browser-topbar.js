/**
 * @module AgLibraryBrowserTopbar
 * @description Sticky topbar of a library hierarchical browser (Roon / UPnP):
 * back chevron, current level title, refresh button. Icon props match
 * `ag-lib-tabbar` (22×22, stroke 1.7, linecap+linejoin round) so the two
 * library topbar rows align visually.
 *
 * @element ag-library-browser-topbar
 *
 * @attr {string} title - Current browse-level title.
 *
 * @fires browser-back    - Bubbles. Back button clicked.
 * @fires browser-refresh - Bubbles. Refresh button clicked.
 *
 * @dependency css/components/library-browser.css
 */

import { LitElement, html } from 'lit';
import { emit } from '../utils-lit.js';
import { iconBack, iconRefresh } from '../../ag-icons.js';

export class AgLibraryBrowserTopbar extends LitElement {
    static properties = {
        title: { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.title = '';
    }

    _onBack    = () => emit(this, 'browser-back');
    _onRefresh = () => emit(this, 'browser-refresh');

    render() {
        return html`
            <div class="lib-browser-topbar">
                <button class="lib-browser-back-btn" @click=${this._onBack}
                    aria-label="Back">
                    <svg viewBox="0 0 24 24" style="width:22px;height:22px;flex-shrink:0"
                        fill="none" stroke="currentColor" stroke-width="1.7"
                        stroke-linecap="round" stroke-linejoin="round">
                        ${iconBack}
                    </svg>
                </button>
                <span class="lib-browser-title">${this.title || 'Browse'}</span>
                <button class="lib-browser-refresh-btn" @click=${this._onRefresh}
                    title="Refresh" aria-label="Refresh">
                    <svg viewBox="0 0 24 24" style="width:22px;height:22px;flex-shrink:0"
                        fill="none" stroke="currentColor" stroke-width="1.7"
                        stroke-linecap="round" stroke-linejoin="round">
                        ${iconRefresh}
                    </svg>
                </button>
            </div>
        `;
    }
}

customElements.define('ag-library-browser-topbar', AgLibraryBrowserTopbar);
