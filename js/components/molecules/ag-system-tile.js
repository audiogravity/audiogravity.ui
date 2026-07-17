import { LitElement, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { iconWifi, iconCpu, iconThermometer, iconMemory, iconHardDrive, iconConnection, iconClock } from '../../ag-icons.js';
import '../atoms/ag-sparkline.js';

/** Map from legacy icomoon class name to SVG icon template. */
const ICON_MAP = {
    'icon-wifi':        iconWifi,
    'icon-chip':        iconCpu,
    'icon-thermometer': iconThermometer,
    'icon-memory':      iconMemory,
    'icon-drive':       iconHardDrive,
    'icon-connection':  iconConnection,
    'icon-clock':       iconClock,
};

/**
 * System Meter/Metric Tile
 * @element ag-system-tile
 * 
 * @prop {string} title
 * @prop {string} icon - icon class name (e.g. icon-chip)
 * @prop {string} value
 * @prop {string} unit
 * @prop {string} detail
 * @prop {string} type - 'metric' (default) or 'connection'
 * @prop {boolean} connected - for type="connection"
 * @prop {string} connectionId - for type="connection"
 * @prop {string} sparklineColor
 * @prop {string} sparklineFill
 * @prop {Array} sparklineData
 * 
 * @dependency css/system.css - Uses .system-tile, .metric-large, .connection-status-large
 * @dependency ag-sparkline - Uses ag-sparkline for metric visualization
 */
export class AgSystemTile extends LitElement {
    static properties = {
        title: { type: String },
        icon: { type: String },
        value: { type: String },
        unit: { type: String },
        detail: { type: String },
        type: { type: String },
        connected: { type: Boolean },
        connectionId: { type: String },
        sparklineColor: { type: String, attribute: 'sparkline-color' },
        sparklineFill: { type: String, attribute: 'sparkline-fill' },
        sparklineData: { type: Array }
    };

    constructor() {
        super();
        this.type = 'metric';
        this.title = '';
        this.icon = '';
        this.value = '--';
        this.unit = '';
        this.detail = '';
        this.connected = false;
        this.connectionId = '';
        this.sparklineData = [];
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();
        // Do NOT add 'display-contents' - breaks grid layout
        // Grid CSS expects ag-system-tile to exist as a container
    }

    /**
     * Proxy method to update the internal sparkline.
     * If simple querySelector fails (not yet in DOM), it tries to find it.
     */
    async addDataPoint(val) {
        // Ensure we've rendered at least once
        if (this.updateComplete) await this.updateComplete;

        const spark = this.querySelector('ag-sparkline');
        if (spark && typeof spark.addDataPoint === 'function') {
            spark.addDataPoint(val);
        }
    }

    _renderIcon(iconClass) {
        const svgContent = ICON_MAP[iconClass];
        if (svgContent) {
            return html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
        }
        return html`<span class="${iconClass}"></span>`;
    }

    render() {
        if (this.type === 'connection') {
            return html`
                <div class="system-tile">
                    <h3>${this._renderIcon(this.icon || 'icon-wifi')} ${this.title || 'SSE Stream'}</h3>
                    <div class="connection-status-large">
                        <div class="connection-dot-large ${this.connected ? 'connected' : ''}"></div>
                        <div class="connection-text-large">${this.connected ? 'Connected' : 'Disconnected'}</div>
                    </div>
                    <div class="metric-detail">${this.connected ? (this.connectionId ? `ID: ${this.connectionId}` : 'Real-time updates active') : 'Connecting...'}</div>
                </div>
            `;
        }

        return html`
            <div class="system-tile">
                <h3>${this._renderIcon(this.icon)} ${this.title}</h3>
                <div class="metric-large">${this.value}</div>
                <div class="metric-unit">${this.unit}</div>
                
                ${this.sparklineColor ? html`
                    <div class="sparkline-container">
                        <ag-sparkline 
                            .data=${this.sparklineData}
                            line-color="${this.sparklineColor}" 
                            fill-color="${this.sparklineFill || 'transparent'}" 
                            smooth 
                            auto-scale>
                        </ag-sparkline>
                    </div>
                ` : nothing}
                
                <div class="metric-detail">${this.detail}</div>
            </div>
        `;
    }
}

customElements.define('ag-system-tile', AgSystemTile);
