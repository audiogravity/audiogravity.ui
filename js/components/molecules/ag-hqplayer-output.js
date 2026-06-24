/**
 * @module AgHqplayerOutput
 * @description HQPlayer output card molecule for the sources view.
 * Shows connection state, discovery panel (local-subnet scan + manual IP
 * entry for cross-subnet hosts), DSP controls (filter, shaper, mode
 * dropdowns + volume slider), and disconnect action.
 *
 * Self-contained: fetches its own state from the /hqplayer/* endpoints.
 * The parent organism only needs to render `<ag-hqplayer-output>`.
 *
 * @element ag-hqplayer-output
 *
 * @fires hqp-connected    - Bubbles when HQPlayer connection is established.
 * @fires hqp-disconnected - Bubbles when HQPlayer connection is removed.
 *
 * @dependency css/components/library-sources.css (lib-hqp-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPut, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import { iconSliders, iconChevronDown, iconWifi } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';

class AgHqplayerOutput extends LitElement {

    static properties = {
        _connection:  { state: true },
        _loading:     { state: true },
        _scanning:    { state: true },
        _discovered:  { state: true },
        _manualHost:  { state: true },
        _filters:     { state: true },
        _shapers:     { state: true },
        _modes:       { state: true },
        _status:      { state: true },
        _dspExpanded:  { state: true },
        _applying:     { state: true },
        _useAsOutput:  { state: true },
    };

    constructor() {
        super();
        this._connection  = null;
        this._loading     = true;
        this._scanning    = false;
        this._discovered  = null;
        this._manualHost  = '';
        this._filters     = [];
        this._shapers     = [];
        this._modes       = [];
        this._status      = null;
        this._dspExpanded = false;
        this._applying    = false;
        this._useAsOutput = localStorage.getItem('hqplayer_output') === 'true';
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._loadConnection();
        this._boundHandleNaaMetrics = this._handleNaaMetrics.bind(this);
        if (window.EventEmitter) {
            window.EventEmitter.on('service-metrics-sse', this._boundHandleNaaMetrics);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.EventEmitter && this._boundHandleNaaMetrics) {
            window.EventEmitter.off('service-metrics-sse', this._boundHandleNaaMetrics);
        }
    }

    /**
     * Update naa_available in-place when a services_metrics SSE event arrives
     * for the networkaudiod service — no round-trip to /hqplayer/connection.
     * @param {{ serviceId: string, metrics: { state: string } }} param
     */
    _handleNaaMetrics({ serviceId, metrics }) {
        if (serviceId !== 'networkaudiod' || !this._connection) return;
        const naaActive = metrics?.state === 'active';
        if (this._connection.naa_available !== naaActive) {
            this._connection = { ...this._connection, naa_available: naaActive };
        }
    }

    // ── Data fetching ──────────────────────────────────────────────────────

    /** Fetch current connection state. DSP options loaded lazily on panel open. */
    async _loadConnection() {
        await loadConnection(this, () => apiGet('/hqplayer/connection'), 'hqplayer');
    }

    /** Scan the local subnet for HQPlayer instances. */
    async _scan() {
        this._scanning = true;
        this._discovered = null;
        try {
            this._discovered = await apiGet('/hqplayer/discover');
        } catch (e) {
            console.warn('[hqplayer] Discovery failed:', e.message);
            this._discovered = [];
        }
        this._scanning = false;
    }

    /** Connect to a discovered HQPlayer instance. */
    async _connect(instance) {
        try {
            this._connection = await apiPut('/hqplayer/connection', {
                host: instance.host,
                port: instance.port,
            });
            this._discovered = null;
            if (this._connection.available) {
                await Promise.all([this._loadDspOptions(), this._loadStatus()]);
            }
            this.dispatchEvent(new CustomEvent('hqp-connected', { bubbles: true }));
        } catch (e) {
            console.warn('[hqplayer] Connect failed:', e.message);
        }
    }

    /**
     * Connect to a manually entered HQPlayer host.
     *
     * Used when auto-discovery cannot reach the instance — typically a
     * cross-subnet setup where HQPlayer lives outside the local /24 that
     * `discover()` scans. The host is routable but not found by the subnet
     * sweep, so the user supplies its IP directly. Port is fixed at 4321
     * (HQPlayer's only control port).
     */
    async _connectManual() {
        const host = this._manualHost.trim();
        if (!host) return;
        await this._connect({ host, port: 4321 });
        this._manualHost = '';
    }

    /** Remove the HQPlayer connection. */
    async _disconnect() {
        try {
            await apiDelete('/hqplayer/connection');
        } catch (e) {
            console.warn('[hqplayer] Disconnect failed:', e.message);
        }
        this._connection   = null;
        this._discovered   = null;
        this._status       = null;
        this._filters      = [];
        this._shapers      = [];
        this._modes        = [];
        this._dspExpanded  = false;
        this._useAsOutput  = false;
        localStorage.removeItem('hqplayer_output');
        this.dispatchEvent(new CustomEvent('hqp-disconnected', { bubbles: true }));
    }

    /** Fetch filter/shaper/mode lists in parallel. */
    async _loadDspOptions() {
        try {
            const [filters, shapers, modes] = await Promise.all([
                apiGet('/hqplayer/filters'),
                apiGet('/hqplayer/shapers'),
                apiGet('/hqplayer/modes'),
            ]);
            this._filters = filters;
            this._shapers = shapers;
            this._modes   = modes;
        } catch (e) {
            console.debug('[hqplayer] DSP options load failed:', e.message);
        }
    }

    /** Fetch current HQPlayer status (active filter/shaper/mode/volume). */
    async _loadStatus() {
        try {
            this._status = await apiGet('/hqplayer/status');
        } catch (e) {
            console.debug('[hqplayer] Status load failed:', e.message);
            this._status = null;
        }
    }

    // ── DSP control ────────────────────────────────────────────────────────

    /** @param {Event} e */
    async _setFilter(e) {
        await this._applyDsp('filter', '/hqplayer/filter', { value: parseInt(e.target.value) });
    }

    /** @param {Event} e */
    async _setShaper(e) {
        await this._applyDsp('shaper', '/hqplayer/shaper', { value: parseInt(e.target.value) });
    }

    /** @param {Event} e */
    async _setMode(e) {
        await this._applyDsp('mode', '/hqplayer/mode', { value: parseInt(e.target.value) });
    }

    /** @param {Event} e */
    async _setVolume(e) {
        await this._applyDsp('volume', '/hqplayer/volume', { db: parseFloat(e.target.value) });
    }

    /**
     * Send a DSP change, refresh status, and flash the field to confirm.
     * @param {string} field  - CSS selector suffix for the flash target.
     * @param {string} endpoint - Backend PUT endpoint.
     * @param {object} body   - Request body.
     */
    async _applyDsp(field, endpoint, body) {
        this._applying = true;
        try {
            await apiPut(endpoint, body);
            await this._loadStatus();
            this._flashField(field);
        } catch (e) {
            console.warn('[hqplayer] DSP change failed:', e.message);
        }
        this._applying = false;
    }

    /**
     * Briefly flash a DSP field green to confirm the change was applied.
     * @param {string} field - Field identifier (filter|shaper|mode|volume).
     */
    _flashField(field) {
        const el = this.querySelector(`[data-field="${field}"]`);
        if (!el) return;
        el.classList.add('lib-hqp-applied');
        setTimeout(() => el.classList.remove('lib-hqp-applied'), 1200);
    }

    /**
     * Reset persisted DSP config and re-snapshot from HQPlayer defaults.
     */
    async _resetDsp() {
        this._applying = true;
        try {
            await apiDelete('/hqplayer/dsp');
            await this._loadStatus();
        } catch (e) {
            console.warn('[hqplayer] DSP reset failed:', e.message);
        }
        this._applying = false;
    }

    /** Toggle HQPlayer as the active audio output for library plays. */
    _toggleOutput(e) {
        this._useAsOutput = e.detail.checked;
        localStorage.setItem('hqplayer_output', this._useAsOutput ? 'true' : 'false');
    }

    /** Reload connection + DSP options + status from HQPlayer. */
    async _refresh() {
        await this._loadConnection();
        if (this._connection?.available && this._dspExpanded) {
            await Promise.all([this._loadDspOptions(), this._loadStatus()]);
        }
    }

    /**
     * Clear the output flag whenever the connection transitions to NAA-offline.
     * Uses Lit's updated() lifecycle so it fires on every _connection change
     * regardless of the source (connectedCallback, _refresh, _connect, SSE).
     * Uses === false (not falsy) to avoid clearing on a transient null connection
     * (fetch failure) where naa_available is undefined, not confirmed false.
     * @param {Map} changedProps
     */
    updated(changedProps) {
        if (changedProps.has('_connection') &&
            this._useAsOutput &&
            this._connection?.naa_available === false) {
            this._useAsOutput = false;
            localStorage.removeItem('hqplayer_output');
        }
    }

    async _toggleDsp() {
        this._dspExpanded = !this._dspExpanded;
        if (this._dspExpanded && this._filters.length === 0) {
            await Promise.all([this._loadDspOptions(), this._loadStatus()]);
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────

    render() {
        if (this._loading) {
            return html`<div class="lib-empty" style="padding:12px 0">Loading…</div>`;
        }

        if (!this._connection?.host) {
            return this._renderDiscovery();
        }

        return this._renderCard();
    }

    /** Render the discovery panel (no connection configured). */
    _renderDiscovery() {
        return html`
            <div class="lib-hqp-discover">
                <button class="action-btn compact"
                        @click=${this._scan}
                        ?disabled=${this._scanning}>
                    ${this._scanning
                        ? 'Scanning…'
                        : html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${iconWifi}</svg> Scan network`
                    }
                </button>

                ${this._discovered?.map(inst => html`
                    <div class="lib-hqp-card" @click=${() => this._connect(inst)} style="cursor:pointer">
                        <div class="lib-hqp-card-hd">
                            <div class="lib-hqp-ic">
                                <img src="/pics/hqplayer.webp" alt="HQPlayer" width="24" height="24" />
                            </div>
                            <div class="lib-hqp-col">
                                <div class="lib-hqp-name">HQPlayer</div>
                                <div class="lib-hqp-desc">
                                    ${inst.host}:${inst.port}
                                    ${inst.active_mode ? ` · ${inst.active_mode}` : ''}
                                </div>
                            </div>
                            <ag-status-indicator state="down" label="Available"></ag-status-indicator>
                        </div>
                    </div>
                `)}

                ${this._discovered?.length === 0 ? html`
                    <div class="lib-empty" style="padding:12px 0">No HQPlayer found on the network</div>
                ` : nothing}

                <div class="lib-inline-row">
                    <input
                        class="lib-inline-input"
                        type="text"
                        placeholder="HQPlayer IP (e.g. 10.0.4.200)"
                        .value=${this._manualHost}
                        @input=${(e) => { this._manualHost = e.target.value; }}
                        @keydown=${(e) => e.key === 'Enter' && this._connectManual()}
                    />
                    <button
                        class="action-btn compact"
                        @click=${this._connectManual}
                        ?disabled=${!this._manualHost.trim()}
                    >
                        Connect
                    </button>
                </div>
                <p class="lib-inline-help">
                    Discovery only scans the local subnet. For a HQPlayer on a
                    different subnet (still routable), enter its IP manually.
                </p>
            </div>
        `;
    }

    /** Render the connected/offline HQPlayer card with optional DSP panel. */
    _renderCard() {
        const available     = this._connection.available;
        const naaAvailable  = this._connection.naa_available;
        const fullyConnected = available && naaAvailable;

        return html`
            <div class="lib-hqp-card ${fullyConnected ? 'connected' : ''}">
                <div class="lib-hqp-card-hd">
                    <div class="lib-hqp-ic">
                        <img src="/pics/hqplayer.webp" alt="HQPlayer" width="24" height="24" />
                    </div>
                    <div class="lib-hqp-col">
                        <div class="lib-hqp-name">HQPlayer</div>
                        <div class="lib-hqp-desc">
                            ${this._connection.host}:${this._connection.port}
                            ${this._status?.active_mode ? ` · ${this._status.active_mode}` : ''}
                            ${this._status?.active_rate ? ` · ${this._formatRate(this._status.active_rate)}` : ''}
                        </div>
                    </div>
                    ${this._applying
                        ? html`<ag-status-indicator state="pending" label="Applying"></ag-status-indicator>`
                        : fullyConnected
                            ? html`<ag-status-indicator state="up" label="Connected"></ag-status-indicator>`
                            : available
                                ? html`<ag-status-indicator state="down" label="NAA offline"></ag-status-indicator>`
                                : html`<ag-status-indicator state="down" label="Offline"></ag-status-indicator>`
                    }
                </div>

                ${fullyConnected ? html`
                    <div class="lib-hqp-output-toggle">
                        <span class="lib-hqp-output-label">Use as output</span>
                        <ag-switch .checked=${this._useAsOutput} @ag-change=${this._toggleOutput}></ag-switch>
                    </div>
                ` : nothing}

                <div class="lib-hqp-actions">
                    ${available ? html`
                        <button class="action-btn compact" @click=${this._toggleDsp}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${iconSliders}</svg>
                            DSP
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"
                                 class="lib-hqp-chevron ${this._dspExpanded ? 'open' : ''}">${iconChevronDown}</svg>
                        </button>
                    ` : nothing}
                    <button class="action-btn compact secondary" @click=${this._disconnect}>
                        Disconnect
                    </button>
                </div>

                ${this._dspExpanded && available ? this._renderDsp() : nothing}
            </div>
        `;
    }

    /** Render the DSP controls panel (filter, shaper, mode dropdowns + volume slider). */
    _renderDsp() {
        const filterIdx = this._filters.find(f => f.name === this._status?.active_filter)?.value;
        const shaperIdx = this._shapers.find(s => s.name === this._status?.active_shaper)?.value;
        const modeIdx   = this._modes.find(m => m.name === this._status?.active_mode)?.value;

        return html`
            <div class="lib-hqp-dsp">
                <div class="lib-hqp-field" data-field="filter">
                    <label class="lib-hqp-label">Filter</label>
                    <select class="lib-hqp-select"
                            .value=${String(filterIdx ?? '')}
                            @change=${this._setFilter}>
                        ${this._filters.map(f => html`
                            <option value=${f.value} ?selected=${f.value === filterIdx}>${f.name}</option>
                        `)}
                    </select>
                </div>
                <div class="lib-hqp-field" data-field="shaper">
                    <label class="lib-hqp-label">Shaper</label>
                    <select class="lib-hqp-select"
                            .value=${String(shaperIdx ?? '')}
                            @change=${this._setShaper}>
                        ${this._shapers.map(s => html`
                            <option value=${s.value} ?selected=${s.value === shaperIdx}>${s.name}</option>
                        `)}
                    </select>
                </div>
                <div class="lib-hqp-field" data-field="mode">
                    <label class="lib-hqp-label">Mode</label>
                    <select class="lib-hqp-select"
                            .value=${String(modeIdx ?? '')}
                            @change=${this._setMode}>
                        ${this._modes.map(m => html`
                            <option value=${m.value} ?selected=${m.value === modeIdx}>${m.name}</option>
                        `)}
                    </select>
                </div>
                <div class="lib-hqp-field" data-field="volume">
                    <label class="lib-hqp-label">
                        Volume
                        <span class="lib-hqp-vol-val">${this._status?.volume_db ?? 0} dB</span>
                    </label>
                    <input class="lib-hqp-slider" type="range"
                           min="-60" max="0" step="0.5"
                           .value=${String(this._status?.volume_db ?? 0)}
                           aria-label="HQPlayer volume"
                           @change=${this._setVolume}
                    />
                </div>
                <div class="lib-hqp-reset">
                    <button class="action-btn compact secondary" @click=${this._resetDsp}>
                        Reset to HQPlayer defaults
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Format a sample rate for display.
     * @param {number} rate - Sample rate in Hz (e.g. 5644800).
     * @returns {string} Formatted string (e.g. "DSD128" or "192 kHz").
     */
    _formatRate(rate) {
        if (rate >= 2822400) {
            const dsdMultiplier = Math.round(rate / 44100);
            return `DSD${dsdMultiplier}`;
        }
        return `${(rate / 1000).toFixed(0)} kHz`;
    }
}

customElements.define('ag-hqplayer-output', AgHqplayerOutput);

export { AgHqplayerOutput };
