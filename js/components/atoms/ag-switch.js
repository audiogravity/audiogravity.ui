/**
 * @module AgSwitch
 * @description Atomic switch toggle component.
 * Encapsulates the .switch CSS structure for forms/settings.
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * Switch Toggle Web Component
 * @element ag-switch
 *
 * @attr {boolean} checked - Whether the switch is checked
 * @attr {boolean} disabled - Whether the switch is disabled
 * @attr {boolean} compact - Whether the switch is in compact mode
 * @attr {string} variant - CSS variant class (e.g. 'notification' for orange)
 * 
 * @dependency css/components/forms.css - Classes .switch, .slider
 * @fires ag-change - Dispatched when the switch value changes
 */
export class AgSwitch extends LitElement {
    static properties = {
        checked: { type: Boolean, reflect: true },
        disabled: { type: Boolean },
        compact: { type: Boolean },
        variant: { type: String }
    };

    constructor() {
        super();
        this.checked = false;
        this.disabled = false;
        this.compact = false;
        this.variant = '';
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    connectedCallback() {
        super.connectedCallback();
        // Display inline-block now handled by CSS (components/forms.css)
    }

    handleChange(e) {
        if (this.disabled) return;
        e.stopPropagation(); // Prevent native event from bubbling
        this.checked = e.target.checked;

        // Dispatch custom change event
        this.dispatchEvent(new CustomEvent('ag-change', {
            detail: { checked: this.checked },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        const switchClasses = {
            'switch': true,
            'disabled': this.disabled,
            'compact': this.compact,
            [this.variant]: !!this.variant
        };

        return html`
            <label class=${classMap(switchClasses)}>
                <input
                    type="checkbox"
                    .checked=${this.checked}
                    ?disabled=${this.disabled}
                    @change=${this.handleChange}
                >
                <span class="slider"></span>
            </label>
        `;
    }
}

customElements.define('ag-switch', AgSwitch);
