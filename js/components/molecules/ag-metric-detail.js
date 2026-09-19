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
 * @attr {Number} slots - Window capacity: values fill it from the right, as in the
 *   sparkline this view expands. 0 (default) spreads them over the whole width.
 * @prop {Array} data - Historical values, oldest first; null = not measured (a gap).
 *
 * @dependency ag-sparkline - placeOnSlots / measuredRuns, shared with the small chart
 * @dependency js/utils.js - formatRate, formatMemory, safeToFixed helpers
 */

import { LitElement, html, svg } from 'lit';
import { formatRate, formatMemory, safeToFixed } from '../utils-lit.js';
import { placeOnSlots, measuredRuns } from '../atoms/ag-sparkline.js';


export class AgMetricDetail extends LitElement {
    static properties = {
        label: { type: String },
        color: { type: String },
        unit: { type: String },
        slots: { type: Number },
        data: { type: Array }
    };

    constructor() {
        super();
        this.label = '';
        this.color = 'var(--text-primary)';
        this.unit = '';
        this.slots = 0;
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
        // Only what was measured: a null is a gap, not a zero, and a measurement alone
        // between gaps (the very first one included) is drawn as a point.
        const { count, points } = placeOnSlots(this.data, this.slots);
        if (points.length === 0) return html``;

        const width = 100;
        const height = 60;
        const max = Math.max(...points.map(p => p.value), 0.1);
        const x = slot => (count > 1 ? (slot / (count - 1)) * width : width);
        const y = value => height - (value / max) * height;
        const runs = measuredRuns(points).map(run => run.map(p => [x(p.slot), y(p.value)]));

        // Generate unique gradient ID to avoid conflicts
        const cleanLabel = this.label.replace(/<[^>]+>/g, ''); // Remove HTML tags
        const gradientId = `gradient-${cleanLabel.replace(/[^a-z0-9]/gi, '-')}-${Math.random().toString(36).substr(2, 5)}`;

        // The big figure is the current value, so it is shown only when the newest slot
        // holds a measurement; an older one would be presented as current.
        const latest = points[points.length - 1];
        const formattedValue = latest.slot === count - 1 ? this._formatValue(latest.value) : '—';

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
                    ${runs.map(run => run.length === 1 ? svg`
                        <!-- A lone measurement: a zero-length stroke with round caps is a dot,
                             and non-scaling it stays round in this stretched viewBox. -->
                        <path class="detailed-chart-point"
                            d="M ${run[0][0]},${run[0][1]} h 0.001"
                            fill="none"
                            stroke="${this.color}"
                            stroke-width="4"
                            stroke-linecap="round"
                            vector-effect="non-scaling-stroke"
                        />
                    ` : svg`
                        <!-- Area fill -->
                        <path
                            d="M ${run[0][0]},${height} L ${run.map(p => p.join(',')).join(' L ')} L ${run[run.length - 1][0]},${height} Z"
                            fill="url(#${gradientId})"
                        />
                        <!-- Line -->
                        <polyline
                            points="${run.map(p => p.join(',')).join(' ')}"
                            fill="none"
                            stroke="${this.color}"
                            stroke-width="1.5"
                            vector-effect="non-scaling-stroke"
                        />
                    `)}
                </svg>
            </div>
        `;
    }
}

customElements.define('ag-metric-detail', AgMetricDetail);
