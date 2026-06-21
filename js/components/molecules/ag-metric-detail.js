/**
 * @module AgMetricDetail
 * @description Molecule component representing a detailed metric chart for a service.
 * Used when a user expands a metric box on the service card.
 *
 * @element ag-metric-detail
 *
 * @attr {String} label - Label for the metric
 * @attr {String} color - CSS color variable or value
 * @attr {String} unit - Unit to format ('%', 'mem', 'rate', or '')
 * @prop {Array} data - Array of historical values (e.g., 30 data points)
 *
 * @dependency ag-sparkline - SVG sparkline chart component
 * @dependency js/utils.js - formatRate, formatMemory, safeToFixed helpers
 */

import { LitElement, html } from 'lit';
import { formatRate, formatMemory, safeToFixed } from '../utils-lit.js';


export class AgMetricDetail extends LitElement {
    static properties = {
        label: { type: String },
        color: { type: String },
        unit: { type: String },
        data: { type: Array }
    };

    constructor() {
        super();
        this.label = '';
        this.color = 'var(--text-primary)';
        this.unit = '';
        this.data = [];
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    createRenderRoot() {
        return this; // Light DOM to reuse global CSS like .detailed-chart, .detailed-chart-value
    }

    _formatValue(value) {
        const safeValue = value || 0;
        switch (this.unit) {
            case 'rate':
                return formatRate(safeValue);
            case 'mem':
                return formatMemory(safeValue);
            case '%':
                return safeToFixed(safeValue, 1) + '%';
            default:
                return safeToFixed(safeValue, 1);
        }
    }

    render() {
        if (!this.data || this.data.length === 0) return html``;

        const width = 100;
        const height = 60;
        const max = Math.max(...this.data, 0.1);

        // Generate line points
        const points = this.data.map((value, index) => {
            const x = (index / (this.data.length - 1)) * width;
            const y = height - (value / max) * height;
            return `${x},${y}`;
        }).join(' ');

        // Generate area path
        const areaPoints = this.data.map((value, index) => {
            const x = (index / (this.data.length - 1)) * width;
            const y = height - (value / max) * height;
            return `${x},${y}`;
        });
        const areaPath = `M 0,${height} L ${areaPoints.join(' L ')} L ${width},${height} Z`;

        // Generate unique gradient ID to avoid conflicts
        const cleanLabel = this.label.replace(/<[^>]+>/g, ''); // Remove HTML tags
        const gradientId = `gradient-${cleanLabel.replace(/[^a-z0-9]/gi, '-')}-${Math.random().toString(36).substr(2, 5)}`;

        const currentValue = this.data[this.data.length - 1] || 0;
        const formattedValue = this._formatValue(currentValue);

        return html`
            <div class="detailed-chart">
                <div class="detailed-chart-header">
                    <span class="detailed-chart-label">${this.label}</span>
                    <span class="detailed-chart-value" style="color: ${this.color};">${formattedValue}</span>
                </div>
                <svg class="detailed-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:${this.color};stop-opacity:0.2" />
                            <stop offset="100%" style="stop-color:${this.color};stop-opacity:0.05" />
                        </linearGradient>
                    </defs>
                    <!-- Area fill -->
                    <path
                        d="${areaPath}"
                        fill="url(#${gradientId})"
                    />
                    <!-- Line -->
                    <polyline
                        points="${points}"
                        fill="none"
                        stroke="${this.color}"
                        stroke-width="1.5"
                        vector-effect="non-scaling-stroke"
                    />
                </svg>
            </div>
        `;
    }
}

customElements.define('ag-metric-detail', AgMetricDetail);
