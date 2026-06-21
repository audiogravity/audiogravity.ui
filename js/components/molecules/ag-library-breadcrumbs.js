/**
 * @module AgLibraryBreadcrumbs
 * @description Breadcrumb trail for a library hierarchical browser (Roon / UPnP).
 * Renders a clickable root label followed by `›`-separated stack titles; the
 * deepest entry gets the `.current` class. Hidden when the stack is empty.
 *
 * @element ag-library-breadcrumbs
 *
 * @attr {string} root-label - Label of the root crumb (default: "Root")
 * @prop {Array<{title: string}>} stack - Ordered breadcrumb entries (deepest last)
 *
 * @fires breadcrumb-root - Bubbles. Root crumb clicked.
 *
 * @dependency css/components/library-browser.css
 */

import { LitElement, html, nothing } from 'lit';
import { emit } from '../utils-lit.js';

export class AgLibraryBreadcrumbs extends LitElement {
    static properties = {
        rootLabel: { type: String, attribute: 'root-label' },
        stack:     { attribute: false },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.rootLabel = 'Root';
        this.stack     = [];
    }

    _onRoot = () => emit(this, 'breadcrumb-root');

    render() {
        if (!this.stack || this.stack.length === 0) return nothing;
        return html`
            <div class="lib-browser-crumbs">
                <span class="lib-browser-crumb-root" @click=${this._onRoot}>
                    ${this.rootLabel}
                </span>
                ${this.stack.map((s, i) => html`
                    <span class="lib-browser-crumb-sep">›</span>
                    <span class="lib-browser-crumb ${i === this.stack.length - 1 ? 'current' : ''}">
                        ${s.title}
                    </span>
                `)}
            </div>
        `;
    }
}

customElements.define('ag-library-breadcrumbs', AgLibraryBreadcrumbs);
