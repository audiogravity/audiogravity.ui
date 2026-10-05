/**
 * @module AgBadge
 * @description Atomic badge component
 * Represents status, labels, or tags.
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * Badge Web Component
 * @element ag-badge
 *
 * @attr {string} type - Variant type: 'info', 'success', 'warning', 'error', 'neutral', 'critical' (default: 'info')
 * @attr {string} label - Text to display inside the badge
 * @attr {boolean} pill - If true, displays as a fully rounded pill
 * @attr {boolean} filled - If true, uses a solid background instead of the tint of a tag
 *   (or the outline of a clickable badge)
 * @attr {boolean} pulse - If true, the tint (or the outline) breathes; the label never
 *   fades. No effect on a filled badge, whose label sits on the fill.
 * @attr {boolean} clickable - If true, adds hover effects and cursor pointer
 *
 * @dependency css/components/badge.css - Classes .badge, .info, .success, etc.
 * @fires badge-click - Fired when a clickable badge is clicked
 *
 * @example
 * <ag-badge type="success" label="Active"></ag-badge>
 * <ag-badge type="info" label="LIVE" pulse></ag-badge>
 */
export class AgBadge extends LitElement {
    static properties = {
        type: { type: String },
        label: { type: String },
        pill: { type: Boolean },
        filled: { type: Boolean },
        pulse: { type: Boolean },
        clickable: { type: Boolean }
    };

    constructor() {
        super();
        this.type = 'info';
        this.label = '';
        this.pill = false;
        this.filled = false;
        this.pulse = false;
        this.clickable = false;
    }

    // Light DOM to use global existing badge.css
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    _handleClick(e) {
        if (this.clickable) {
            this.dispatchEvent(new CustomEvent('badge-click', {
                bubbles: true,
                composed: true,
                detail: { type: this.type, label: this.label }
            }));
        }
    }

    render() {
        const classes = {
            'badge': true,
            [this.type]: true,
            'pill': this.pill,
            'filled': this.filled,
            'animate-pulse': this.pulse,
            'clickable': this.clickable
        };

        // Clickable, it is a real button (drawn as a badge by plain-btn): the browser
        // gives it the keyboard and announces it. type="button" keeps it from
        // submitting a form it might one day sit in.
        if (this.clickable) {
            return html`
                <button type="button" class=${classMap({ ...classes, 'plain-btn': true })}
                    @click=${this._handleClick}>
                    ${this.label}
                </button>
            `;
        }
        return html`
            <span class=${classMap(classes)}>
                ${this.label}
            </span>
        `;
    }
}

// Define the custom element
customElements.define('ag-badge', AgBadge);
