/**
 * @module AgHealthBar
 * @description Atomic component displaying a segmented health bar with optional counters.
 * Visualizes active / failed / idle counts as proportional colored segments.
 * Generic — usable for services, profiles, packages, or any countable resource.
 */

import { LitElement, html } from 'lit';

/**
 * Health Bar Web Component
 * @element ag-health-bar
 *
 * @attr {number}  active        - Count of active / running items
 * @attr {number}  failed        - Count of failed items
 * @attr {number}  idle          - Count of idle / inactive items
 * @attr {boolean} showCounters  - When set, renders counters (e.g. "2 running · 3 stopped") beside the bar
 *
 * @dependency css/components/health-bar.css - Classes .health-bar, .health-segment, .health-bar-row, …
 *
 * @example
 * <ag-health-bar active="3" failed="1" idle="2"></ag-health-bar>
 * <ag-health-bar active="3" failed="1" idle="2" show-counters></ag-health-bar>
 */
export class AgHealthBar extends LitElement {
    static properties = {
        active:       { type: Number },
        failed:       { type: Number },
        idle:         { type: Number },
        showCounters: { type: Boolean, attribute: 'show-counters' }
    };

    constructor() {
        super();
        this.active       = 0;
        this.failed       = 0;
        this.idle         = 0;
        this.showCounters = false;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'block';
    }

    _renderCounters() {
        return html`
            <span class="health-bar-counters">
                ${this.active ? html`<span class="health-count running">${this.active} running</span>` : ''}
                ${this.active && (this.idle || this.failed) ? html`<span class="health-count-sep">·</span>` : ''}
                ${this.idle   ? html`<span class="health-count idle">${this.idle} stopped</span>` : ''}
                ${this.failed ? html`
                    <span class="health-count-sep">·</span>
                    <span class="health-count failed">${this.failed} failed</span>
                ` : ''}
            </span>
        `;
    }

    render() {
        const total = this.active + this.failed + this.idle;
        if (!total) return html``;

        const pct = (n) => `${(n / total * 100).toFixed(1)}%`;

        const bar = html`
            <div class="health-bar">
                ${this.active ? html`<span class="health-segment active" style="width:${pct(this.active)}"></span>` : ''}
                ${this.failed ? html`<span class="health-segment failed" style="width:${pct(this.failed)}"></span>` : ''}
                ${this.idle   ? html`<span class="health-segment idle"   style="width:${pct(this.idle)}"></span>`   : ''}
            </div>
        `;

        if (!this.showCounters) return bar;

        return html`
            <div class="health-bar-row">
                ${bar}
                ${this._renderCounters()}
            </div>
        `;
    }
}

customElements.define('ag-health-bar', AgHealthBar);
