/**
 * @module AgTooltip
 * @description Atomic tooltip component
 * Wraps content and displays a tooltip on hover. Works in Light DOM.
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * Tooltip Web Component
 * @element ag-tooltip
 *
 * @attr {string} text - The tooltip text to display
 * @attr {string} position - Tooltip position class (e.g., 'tooltip-top', 'tooltip-bottom-right')
 *
 * @dependency css/components/tooltip.css - Classes .has-tooltip, .tooltip
 *
 * @example
 * <ag-tooltip text="Action detail here" position="tooltip-top">
 *     <ag-button label="Hover Me"></ag-button>
 * </ag-tooltip>
 */
export class AgTooltip extends LitElement {
    static properties = {
        text: { type: String },
        position: { type: String }
    };

    constructor() {
        super();
        this.text = '';
        this.position = 'tooltip-top';
        this._capturedChildren = [];
    }

    // Light DOM to use global existing tooltip.css
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';

        // Capture initial light DOM children before first render clears them
        if (this._capturedChildren.length === 0) {
            this._capturedChildren = Array.from(this.childNodes);
        }
    }

    firstUpdated() {
        // Manually inject the captured children into our wrapper slot
        const slotDest = this.querySelector('.ag-light-slot');
        if (slotDest) {
            this._capturedChildren.forEach(child => slotDest.appendChild(child));
        }
    }

    render() {
        const tooltipClasses = {
            'tooltip': true,
            [this.position]: !!this.position
        };

        return html`
            <div class="has-tooltip">
                <span class="ag-light-slot"></span>
                <div class=${classMap(tooltipClasses)}>
                    ${this.text}
                </div>
            </div>
        `;
    }
}

// Define the custom element
customElements.define('ag-tooltip', AgTooltip);
