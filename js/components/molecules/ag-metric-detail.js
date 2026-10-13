/**
 * @module AgMetricDetail
 * @description Molecule component representing a detailed metric chart for a service.
 * Used when a user expands a metric box on the service card.
 *
 * Drawn in bars, as the System tiles are (user's choice, 2026-10-13): one bar per
 * measurement, the newest one full, a gap where one is missing, the scale from zero and
 * the highest measurement written above. It used to draw its own area curve, in the
 * status colour it was given — writes in red, egress in orange — with the figure in that
 * colour too, 2.0 to 3.8:1 in the light themes. The figure is now in the text colour, and
 * the card hands each chart a colour of the theme's chart palette.
 *
 * @element ag-metric-detail
 *
 * @attr {String} label - Label for the metric
 * @attr {String} color - CSS colour of the bars: a --chart-* token
 * @attr {String} unit - Unit to format ('%', 'mem', 'rate', or '')
 * @attr {Number} slots - Window capacity: values fill it from the right, as in the
 *   sparkline this view expands. 0 (default) spreads them over the whole width.
 * @prop {Array} data - Historical values, oldest first; null = not measured (a gap).
 *
 * @dependency ag-sparkline - draws the bars ('bars' variant); placeOnSlots, shared with it
 * @dependency js/utils.js - formatRate, formatMemory, safeToFixed helpers
 */

import { LitElement, html } from 'lit';
import { formatRate, formatMemory, safeToFixed } from '../utils-lit.js';
import { placeOnSlots } from '../atoms/ag-sparkline.js';


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
        // Only what was measured: a null is a gap, not a zero. The bars are the small
        // chart's, which draws a measurement alone between gaps, the first one included.
        const { count, points } = placeOnSlots(this.data, this.slots);
        if (points.length === 0) return html``;

        // The big figure is the current value, so it is shown only when the newest slot
        // holds a measurement; an older one would be presented as current.
        const latest = points[points.length - 1];
        const formattedValue = latest.slot === count - 1 ? this._formatValue(latest.value) : '—';
        const highest = Math.max(...points.map(p => p.value));

        return html`
            <div class="detailed-chart">
                <div class="detailed-chart-header">
                    <span class="detailed-chart-label">${this.label}</span>
                    <span class="detailed-chart-value">${formattedValue}</span>
                </div>
                <div class="detailed-chart-bars">
                    <ag-sparkline
                        variant="bars"
                        slots=${this.slots}
                        .data=${this.data}
                        line-color=${this.color}
                        caption-start=${`max ${this._formatValue(highest)}`}
                        auto-scale>
                    </ag-sparkline>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-metric-detail', AgMetricDetail);
