/**
 * @module AgStatBox
 * @description Atomic component for displaying a metric or static value with an optional state color.
 * Replaces hardcoded .stat-box and .metric-box HTML structures.
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * Stat Box component
 * @element ag-stat-box
 *
 * @attr {string} label - The label for the statistic
 * @attr {string} value - The value to display
 * @attr {string} state - Activity coloring ('low', 'medium', 'high', 'active', 'warning', 'error', 'success')
 * @attr {string} unit - Optional unit string to append
 * @attr {string} variant - Box styling ('secondary', 'tertiary', etc.)
 * @attr {string} customClass - Additional CSS classes to apply to the box (for animations, etc.)
 * @attr {string} customStyle - Inline styles to apply (e.g., "--delay-index: 1")
 *
 * @dependency css/components/metrics.css
 */
export class AgStatBox extends LitElement {
    static properties = {
        label: { type: String },
        value: { type: Object }, // Can be string, number, etc.
        state: { type: String },
        unit: { type: String },
        variant: { type: String },
        customClass: { type: String, attribute: 'custom-class' },
        customStyle: { type: String, attribute: 'custom-style' },
        valueClass: { type: String, attribute: 'value-class' } // For monospace, xlarge, etc.
    };

    constructor() {
        super();
        this.label = '';
        this.value = '--';
        this.state = '';
        this.unit = '';
        this.variant = '';
        this.customClass = '';
        this.customStyle = '';
        this.valueClass = '';
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS access (.metric-box, etc.)
    }

    render() {
        // Map states to existing metric classes if needed, or stick to literal class names
        const valueClasses = {
            'metric-value': true,
            'stat-value': true // compatibility alias
        };

        if (this.state) {
            // Support exact class names like "active", "warning", or pre-mapped "activity-high"
            if (this.state === 'low') valueClasses['activity-low'] = true;
            else if (this.state === 'medium') valueClasses['activity-medium'] = true;
            else if (this.state === 'high') valueClasses['activity-high'] = true;
            else valueClasses[this.state] = true;
        }

        // Add custom value classes (monospace, xlarge, etc.)
        if (this.valueClass) {
            this.valueClass.split(' ').forEach(cls => {
                if (cls.trim()) valueClasses[cls.trim()] = true;
            });
        }

        const boxClasses = {
            'metric-box': true,
            'stat-box': true // compatibility alias
        };

        if (this.variant) {
            boxClasses[this.variant] = true;
        }

        // Add custom classes if provided (for animations like stagger-item, etc.)
        if (this.customClass) {
            this.customClass.split(' ').forEach(cls => {
                if (cls.trim()) boxClasses[cls.trim()] = true;
            });
        }

        return html`
            <div class=${classMap(boxClasses)} style=${this.customStyle || ''}>
                <!-- Note: customStyle allows dynamic CSS variables (e.g., --delay-index) that cannot be predefined -->
                <div class="metric-label">${this.label}</div>
                <div class=${classMap(valueClasses)}>
                    ${this.value}${this.unit ? html`&nbsp;${this.unit}` : ''}
                </div>
                <slot></slot>
            </div>
        `;
    }
}

customElements.define('ag-stat-box', AgStatBox);
