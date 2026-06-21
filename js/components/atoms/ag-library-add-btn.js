/**
 * @module AgLibraryAddBtn
 * @description Compact "+" button used in library list rows and album cards to
 * add an item to the queue without navigating into it. Pure presentational atom —
 * the consumer attaches `@click` and handles event.stopPropagation() to prevent
 * the parent row's own click handler from firing.
 *
 * @element ag-library-add-btn
 *
 * @attr {string} label - aria-label and tooltip text (default: "Add to queue")
 * @attr {string} variant - "row" (default, 14px icon inline) | "card" (24×24 overlay with hover fade)
 *
 * @dependency css/components/library-cover.css
 *
 * @example
 * <ag-library-add-btn @click=${(e) => { e.stopPropagation(); add(); }}></ag-library-add-btn>
 */

import { LitElement, html } from 'lit';
import { iconPlus } from '../../ag-icons.js';

export class AgLibraryAddBtn extends LitElement {
    static properties = {
        label:   { type: String },
        variant: { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.label   = 'Add to queue';
        this.variant = 'row';
    }

    render() {
        const cls = this.variant === 'card' ? 'lib-ac-add' : 'lib-lr-add';
        return html`
            <button class=${cls} title=${this.label} aria-label=${this.label}>
                <svg viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    ${iconPlus}
                </svg>
            </button>
        `;
    }
}

customElements.define('ag-library-add-btn', AgLibraryAddBtn);
