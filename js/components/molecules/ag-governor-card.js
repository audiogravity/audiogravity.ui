import { LitElement, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { isGuest } from '../../auth.js';
import '../atoms/ag-sparkline.js';

/**
 * CPU Governor Card Molecule
 * @element ag-governor-card
 *
 * @prop {Object} cpu - CPU core data (id, frequency, driver, governors, throttle_count)
 * @prop {number} delayIndex - Index for staggered animations
 * @prop {number} usage - Current CPU usage percentage
 * @prop {number} temp - Current CPU temperature in °C
 * @prop {Array} usageHistory - Historical usage values for sparkline
 *
 * @fires governor-change - Emitted when a new governor is selected
 * @dependency css/performance.css - Uses .governor-tile layout and .throttled-badge
 */
export class AgGovernorCard extends LitElement {
    static properties = {
        cpu: { type: Object },
        delayIndex: { type: Number },
        usage: { type: Number },
        temp: { type: Number },
        usageHistory: { type: Array },
        _isThrottled: { type: Boolean, state: true }
    };

    constructor() {
        super();
        this.usage = 0;
        this.temp = null;
        this.usageHistory = [];
        this._isThrottled = false;
        this._prevThrottleCount = null;
        this._throttledTimer = null;
    }

    createRenderRoot() {
        // Use light DOM for global CSS access
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Do NOT add 'display-contents' - breaks grid layout
        // Grid CSS expects ag-governor-card to exist as a container
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._throttledTimer) {
            clearTimeout(this._throttledTimer);
            this._throttledTimer = null;
        }
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('cpu') && this.cpu?.throttle_count !== undefined) {
            const current = this.cpu.throttle_count;
            if (this._prevThrottleCount !== null && current > this._prevThrottleCount) {
                this._isThrottled = true;
                if (this._throttledTimer) clearTimeout(this._throttledTimer);
                // Clear badge after 10 seconds
                this._throttledTimer = setTimeout(() => {
                    this._isThrottled = false;
                    this._throttledTimer = null;
                }, 10000);
            }
            this._prevThrottleCount = current;
        }
    }

    handleChange(e) {
        const newGovernor = e.target.value;
        this.dispatchEvent(new CustomEvent('governor-change', {
            detail: {
                cpuId: this.cpu.cpu_id,
                governor: newGovernor
            },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (!this.cpu) return nothing;

        const frequency = this.cpu.current_frequency !== undefined && this.cpu.current_frequency !== null
            ? `${this.cpu.current_frequency.toFixed(0)} MHz`
            : 'N/A';

        let freqRange = nothing;
        if (this.cpu.min_frequency !== undefined && this.cpu.max_frequency !== undefined) {
            freqRange = html`<div class="cpu-freq-range">${this.cpu.min_frequency} - ${this.cpu.max_frequency} MHz</div>`;
        }

        const driverInfo = this.cpu.scaling_driver
            ? html`<div class="cpu-driver">${this.cpu.scaling_driver}</div>`
            : nothing;

        const tileClasses = {
            'governor-tile': true,
            'stagger-delay': this.delayIndex !== undefined,
            'is-sibling': this.cpu.isSibling
        };

        // Note: style used only for dynamic CSS variables which cannot be predefined
        const styles = [];
        if (this.delayIndex !== undefined) styles.push(`--delay-index: ${this.delayIndex}`);
        if (this.cpu.coreGroupIndex !== undefined) styles.push(`--group-index: ${this.cpu.coreGroupIndex}`);
        const tileStyle = styles.join('; ');

        return html`
            <div class=${classMap(tileClasses)} style=${tileStyle}>
                <div class="governor-header">
                    <div>
                        <div class="cpu-id">CPU ${this.cpu.cpu_id}</div>
                        <div class="cpu-details">Socket: ${this.cpu.physical_id}, Core: ${this.cpu.core_id}${this.cpu.threadLabel || ''}</div>
                    </div>
                    ${this._isThrottled ? html`<span class="throttled-badge">THROTTLED</span>` : nothing}
                </div>
                
                <div class="cpu-metrics-row">
                    <div class="cpu-freq">${frequency}</div>
                    ${this.temp !== null ? html`
                        <div class="cpu-temp ${this.temp > 70 ? 'hot' : this.temp > 50 ? 'warm' : 'cool'}">
                            ${this.temp.toFixed(1)}°C
                        </div>
                    ` : nothing}
                </div>

                <div class="cpu-usage-container">
                    <div class="cpu-usage-label">
                        <span>Load</span>
                        <span>${this.usage.toFixed(1)}%</span>
                    </div>
                    <div class="cpu-sparkline">
                        <ag-sparkline 
                            .data=${this.usageHistory} 
                            line-color="var(--chart-cpu)" 
                            line-width="1.5" 
                            auto-scale 
                            min-value="0" 
                            max-value="100">
                        </ag-sparkline>
                    </div>
                </div>

                ${freqRange}
                ${driverInfo}
                <select class="governor-select" 
                        .value=${this.cpu.current_governor || ''}
                        @change=${this.handleChange} 
                        ?disabled=${isGuest()}>
                    ${(this.cpu.available_governors || []).map(gov => html`
                        <option value="${gov}" ?selected=${gov === this.cpu.current_governor}>
                            ${gov}
                        </option>
                    `)}
                </select>
            </div>
        `;
    }
}

customElements.define('ag-governor-card', AgGovernorCard);
