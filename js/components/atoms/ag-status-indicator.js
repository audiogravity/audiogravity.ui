/**
 * @module AgStatusIndicator
 * @description Atomic component for status dots (UP/DOWN/ACTIVE).
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * Status Indicator Web Component
 * @element ag-status-indicator
 *
 * @attr {string} state - The status state: 'up', 'down', 'active', 'inactive' (default: 'down')
 * @attr {string} label - Optional text label to display next to the dot
 * @attr {string} type - Context type: 'service' or 'profile' (affects CSS classes, default: 'service')
 *
 * @dependency css/components/status-indicator.css - Classes .service-state-dot, .profile-status-dot, etc.
 *
 * @example
 * <ag-status-indicator state="up" label="Running"></ag-status-indicator>
 * <ag-status-indicator type="profile" state="active"></ag-status-indicator>
 */
export class AgStatusIndicator extends LitElement {
    static properties = {
        state: { type: String },
        label: { type: String },
        type: { type: String }
    };

    constructor() {
        super();
        this.state = 'down';
        this.label = '';
        this.type = 'service';
    }

    // Light DOM to use global existing status-indicator.css
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    render() {
        const isProfile = this.type === 'profile';

        const containerClass = isProfile ? 'profile-status-indicator' : 'service-state-indicator';

        const dotClasses = {
            [isProfile ? 'profile-status-dot' : 'service-state-dot']: true,
            [this.state]: true
        };

        const textClasses = {
            [isProfile ? 'profile-status-text' : 'service-state-text']: true,
            [this.state]: true
        };

        return html`
            <div class=${containerClass}>
                <span class=${classMap(dotClasses)}></span>
                ${this.label ? html`<span class=${classMap(textClasses)}>${this.label}</span>` : ''}
            </div>
        `;
    }
}

// Define the custom element
customElements.define('ag-status-indicator', AgStatusIndicator);
