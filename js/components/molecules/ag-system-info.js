import { LitElement, html, nothing } from 'lit';
/**
 * System Information Molecule
 * @element ag-system-info
 * 
 * @prop {Object} system - Operating system details (hostname, kernel, etc.)
 * @prop {Object} cpu - CPU details (model, cores)
 * @prop {string} bootTime - System boot timestamp
 * @prop {Array} loadAvg - CPU load average [1m, 5m, 15m]
 * 
 * @dependency css/system.css - Uses .property-grid, .property-item classes
 */
export class AgSystemInfo extends LitElement {
    static properties = {
        system: { type: Object },
        cpu: { type: Object },
        bootTime: { type: String },
        loadAvg: { type: Array }
    };

    constructor() {
        super();
        this.system = null;
        this.cpu = null;
        this.bootTime = null;
        this.loadAvg = null;
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    render() {
        if (!this.system || !this.cpu) return nothing;

        return html`
            <div class="property-grid compact">
                <div class="property-item">
                    <div class="property-label">Hostname</div>
                    <div class="property-value" title="${this.system.hostname}">${this.system.hostname}</div>
                </div>
                <div class="property-item">
                    <div class="property-label">OS</div>
                    <div class="property-value" title="${this.system.operating_system}">${this.system.operating_system}</div>
                </div>
                <div class="property-item">
                    <div class="property-label">Kernel</div>
                    <div class="property-value" title="${this.system.kernel}">${this.system.kernel}</div>
                </div>
                <div class="property-item">
                    <div class="property-label">Arch</div>
                    <div class="property-value">${this.system.architecture}</div>
                </div>
                <div class="property-item">
                    <div class="property-label">CPU Model</div>
                    <div class="property-value" title="${this.cpu.model}">${this.cpu.model}</div>
                </div>
                <div class="property-item">
                    <div class="property-label">Cores</div>
                    <div class="property-value">${this.cpu.physical_cores}P / ${this.cpu.logical_cores}L</div>
                </div>
                <div class="property-item">
                    <div class="property-label">Boot Time</div>
                    <div class="property-value">${this.bootTime ? new Date(this.bootTime).toLocaleString() : '--'}</div>
                </div>
                ${Array.isArray(this.loadAvg) ? html`
                    <div class="property-item">
                        <div class="property-label">Load Average</div>
                        <div class="property-value" id="prop-load-avg">${this.loadAvg.map(n => typeof n === 'number' ? n.toFixed(2) : n).join(', ')}</div>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-system-info', AgSystemInfo);
