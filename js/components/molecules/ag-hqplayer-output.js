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
 * While this box's own HQPlayer runs (HQPlayer Embedded, `connection.local`),
 * the core plays through it whatever the card says: the card shows it as
 * "This box", with its output switch locked on, and names the instance chosen
 * here, which the core returns to when it stops — with that instance's own
 * "use as output" setting, so the music goes to it only if that was on. The card
 * follows it starting and stopping from the service-state events.
 *
 * @element ag-hqplayer-output
 *
 * @fires sources-changed - Bubbles when the HQPlayer connection is created or removed.
 *
 *
 * @dependency css/components/library-sources.css (lib-hqp-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPut, apiPost, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import { showToast } from '../../ui-helpers.js';
import { iconSliders, iconChevronDown, iconWifi, iconExternalLink } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';
import '../atoms/ag-switch.js';

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
        this._useAsOutput = false;  // seeded from the server in _loadConnection()
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._loadConnection();
        this._boundHandleNaaMetrics = this._handleNaaMetrics.bind(this);
        this._boundHandleLocalMetrics = this._handleLocalHqplayerMetrics.bind(this);
        if (window.EventEmitter) {
            window.EventEmitter.on('service-metrics-sse', this._boundHandleNaaMetrics);
            window.EventEmitter.on('service-metrics-sse', this._boundHandleLocalMetrics);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.EventEmitter && this._boundHandleNaaMetrics) {
            window.EventEmitter.off('service-metrics-sse', this._boundHandleNaaMetrics);
            window.EventEmitter.off('service-metrics-sse', this._boundHandleLocalMetrics);
        }
    }

    /**
     * Update naa_available in-place when a services_metrics SSE event arrives
     * for the networkaudiod service — no round-trip to /hqplayer/connection.
     * @param {{ serviceId: string, metrics: { state: string } }} param
     */
    _handleNaaMetrics({ serviceId, metrics }) {
        // `naa`, not `hqplayer`: this is the LOCAL adaptor's service id, as
        // audio-config.json names it. The word `hqplayer` in this file means the
        // remote player everywhere else — which is why the id was renamed.
        if (serviceId !== 'naa' || !this._connection) return;
        const naaActive = metrics?.state === 'active';
        if (this._connection.naa_available !== naaActive) {
            this._connection = { ...this._connection, naa_available: naaActive };
        }
    }

    /**
     * Reload the connection when this box's own HQPlayer starts or stops.
     *
     * While it runs the core plays through it, and when it stops the core
     * returns to the instance chosen in this card — so either change moves what
     * the card must show. Only a CHANGE reloads, judged against where the card
     * last knew it stood: first what it loaded (see _loadConnection), then each
     * event. State events come every 10 to 30 s on a quiet box, so a start
     * between the load and the first of them, taken for the starting point,
     * left the card on the other instance (measured on the dev box, 2026-09-22).
     * A state that stays put must not turn every tick into a request.
     * @param {{ serviceId: string, metrics: { state: string } }} param
     */
    _handleLocalHqplayerMetrics({ serviceId, metrics }) {
        if (serviceId !== 'hqplayerd') return;
        const running = metrics?.state === 'active';
        const changed = this._localRunning !== undefined && running !== this._localRunning;
        this._localRunning = running;
        if (changed) this._loadConnection();
    }

    // ── Data fetching ──────────────────────────────────────────────────────

    /** Fetch current connection state. DSP options loaded lazily on panel open. */
    async _loadConnection() {
        await loadConnection(this, () => apiGet('/hqplayer/connection'), 'hqplayer');
        // The "use as output" choice is server-side: adopt whatever it says, so
        // every client shows the same state (it used to be per-browser).
        this._useAsOutput = !!this._connection?.use_as_output;
        // Where the box's own HQPlayer stands, from the first answer only. Seeded
        // on every load, a core that does not see it running while its unit runs
        // (no declaration) would have the next event reload again, for ever.
        if (this._localRunning === undefined && this._connection) {
            this._localRunning = !!this._connection.local;
        }
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
            this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
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
        // No explicit stop here: the backend stops HQPlayer itself before
        // clearing the host, because the invariant belongs to it — its NAA holds
        // the exclusive sound card until then, and any other client (an older
        // build, a script) would otherwise leave the card stuck.
        let remaining = null;
        try {
            remaining = await apiDelete('/hqplayer/connection');
        } catch (e) {
            console.warn('[hqplayer] Disconnect failed:', e.message);
        }
        // What forgetting the chosen instance leaves: this box's own HQPlayer,
        // while it runs, is still the one the core plays through.
        if (remaining?.local) {
            this._connection  = remaining;
            this._useAsOutput = !!remaining.use_as_output;
            this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
            return;
        }
        this._connection   = null;
        this._discovered   = null;
        this._status       = null;
        this._filters      = [];
        this._shapers      = [];
        this._modes        = [];
        this._dspExpanded  = false;
        this._useAsOutput  = false;   // the backend clears it with the connection
        this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
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
        // The filters and shapers HQPlayer offers depend on the mode, and what it
        // takes is a POSITION in that list. Kept from the previous mode, picking a
        // filter applied a different one, silently — measured on HQPlayer Embedded
        // 6.0.4: 77 filters in SDM, 67 in PCM, with the same names at other places.
        await this._loadDspOptions();
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

    /** Toggle HQPlayer as the destination for library playback. */
    async _toggleOutput(e) {
        // One write at a time: two quick flips used to race, and the SLOWER
        // response won, leaving the switch showing the opposite of the stored
        // setting until the next connection reload.
        if (this._switching) return;
        this._switching = true;
        try {
            await this._setUseAsOutput(e.detail.checked);
        } finally {
            this._switching = false;
        }
    }

    /**
     * Persist the "use as output" choice on the backend.
     *
     * The setting is server-side so every client agrees on where the music
     * should go — it used to live in this browser's localStorage, which let a
     * phone and a laptop disagree. The backend also releases the local sound
     * card when disabling: its NAA holds the exclusive device for as long as a
     * track is loaded (even paused), so without that release local playback
     * would fail with `Device or resource busy`.
     *
     * Optimistic, then reconciled with the server's answer.
     * @param {boolean} enabled - Route library playback through HQPlayer.
     */
    async _setUseAsOutput(enabled) {
        this._useAsOutput = enabled;
        try {
            // The response carries ONLY the flag: overwriting _connection from
            // another endpoint's payload used to drop naa_available, which made
            // the NAA-offline guard below fire and switch the toggle straight
            // back off.
            const state = await apiPut('/hqplayer/use-as-output', { enabled });
            this._useAsOutput = !!state?.use_as_output;
        } catch (e) {
            console.warn('[hqp] could not change the HQPlayer output setting:', e);
            this._useAsOutput = !enabled;   // revert — the server refused
            showToast('error', 'HQPlayer output unchanged',
                      e?.message || 'The core refused the change.', 5000);
        }
    }

    /** Reload connection + DSP options + status from HQPlayer. */
    async _refresh() {
        await this._loadConnection();
        if (this._connection?.available && this._dspExpanded) {
            await Promise.all([this._loadDspOptions(), this._loadStatus()]);
        }
    }

    // The NAA-offline guard that used to live here (an updated() hook clearing
    // the flag) was removed: since the setting moved server-side it no longer
    // cleared a local preference but WROTE to the box, so any browser merely
    // displaying this panel during a transient networkaudiod restart — the
    // steering restarts it on every ALSA output switch — silently turned the
    // output off for every client. A view must not mutate shared state.
    // The backend now owns the invariant: it refuses to enable without a live
    // NAA, and refuses to route a play to a dead one (core.playback_output),
    // explaining why instead of changing the user's choice behind their back.

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
                                <img src="./pics/hqplayer.webp" alt="HQPlayer" width="24" height="24" />
                            </div>
                            <div class="lib-hqp-col">
                                <div class="lib-hqp-name">HQPlayer</div>
                                <div class="lib-hqp-desc">
                                    ${inst.host}:${inst.port}
                                    ${this._identity(inst.product, inst.engine_version)
                                        ? ` · ${this._identity(inst.product, inst.engine_version)}` : ''}
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

    /**
     * Short label for an instance: what it is, and which engine it runs.
     *
     * HQPlayer answers `Signalyst HQPlayer Desktop`, and the only part worth
     * the width is the last word — Desktop or Embedded, which is how you tell
     * two instances apart on one network. A product that does not carry the
     * expected prefix is shown whole rather than trimmed on a guess.
     *
     * @param {string|null} product        - `product` as HQPlayer reports it.
     * @param {string|null} engineVersion  - `engine_version`, e.g. `5.28.1`.
     * @returns {string} The label, or an empty string when nothing is known.
     */
    _identity(product, engineVersion) {
        const PREFIX = 'Signalyst HQPlayer ';
        const kind = product?.startsWith(PREFIX)
            ? product.slice(PREFIX.length)
            : (product || '');
        return [kind, engineVersion].filter(Boolean).join(' ');
    }

    /**
     * Where this box's own HQPlayer serves its settings page, or null.
     *
     * What this card does not do — the DSD rate, the licence key, the fine
     * settings — is done there, and the manual already sends the reader to it.
     *
     * Built here rather than by the core, which cannot know how the browser
     * reached this box: the host in the address bar is the one that works,
     * whether that is a name, a LAN address or a tunnel. Only the port comes
     * from the core (`connection.web_port`), and only for the instance running
     * on this box — an HQPlayer on the network serves no page of ours.
     *
     * Offered even when HQPlayer does not answer: its web port keeps answering
     * while its control port refuses (measured on an expired trial), and that
     * page is exactly where a licence key is entered to end the refusal.
     *
     * It is http:// while the app may be https://. That is a navigation, not
     * mixed content, so the browser opens it — and says "not secure" about
     * HQPlayer's page, which serves no https of its own.
     *
     * @returns {string|null} The page's address, or null when there is none.
     */
    _webInterfaceUrl() {
        const port = this._connection?.local ? this._connection.web_port : null;
        const host = window.location.hostname;
        return port && host ? `http://${host}:${port}` : null;
    }

    /** Render the connected/offline HQPlayer card with optional DSP panel. */
    _renderCard() {
        const local         = !!this._connection.local;
        const available     = this._connection.available;
        const naaAvailable  = this._connection.naa_available;
        // This box's own HQPlayer plays straight to the DAC: no NAA to wait for.
        const fullyConnected = available && (local || naaAvailable);
        const chosen = this._connection.configured_host
            ? `${this._connection.configured_host}:${this._connection.configured_port}` : null;

        return html`
            <div class="lib-hqp-card ${fullyConnected ? 'connected' : ''}">
                <div class="lib-hqp-card-hd">
                    <div class="lib-hqp-ic">
                        <img src="./pics/hqplayer.webp" alt="HQPlayer" width="24" height="24" />
                    </div>
                    <div class="lib-hqp-col">
                        <div class="lib-hqp-name">
                            ${local
                                ? ['HQPlayer', this._identity(this._connection.product, this._connection.engine_version)]
                                    .filter(Boolean).join(' ')
                                : html`HQPlayer${this._connection.engine_version
                                    ? ` ${this._connection.engine_version}` : ''}`}
                        </div>
                        <div class="lib-hqp-desc">
                            ${local ? 'This box' : `${this._connection.host}:${this._connection.port}`}
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

                <!--
                  Also shown while the setting is ON but HQPlayer is unreachable,
                  otherwise the user is trapped: the setting lives server-side and
                  keeps routing every play to an HQPlayer that cannot answer, while
                  the only control able to turn it off is hidden. Nothing else
                  turns it off on their behalf — a view must not mutate shared
                  state, see the note above _toggleDsp.
                  Still hidden when OFF and unreachable: nothing to act on.
                -->
                ${this._connection.pairing_ok === false ? html`
                    <div class="lib-hqp-pairing" role="status">
                        This box runs <strong>NAA ${this._connection.naa_version}</strong>,
                        which does not work with <strong>HQPlayer ${this._connection.major}.x</strong>.
                        Install the matching line from <strong>Audio Software</strong> —
                        Audiogravity now offers it there. Until then HQPlayer cannot be
                        used as the output.
                    </div>
                ` : nothing}

                ${local ? html`
                    <div class="lib-hqp-output-toggle">
                        <span class="lib-hqp-output-label">Use as output</span>
                        <ag-switch .checked=${true} disabled></ag-switch>
                    </div>
                    <p class="lib-hqp-note">
                        HQPlayer is running on this box: the music plays through it until it stops.
                        ${chosen ? `The card then returns to HQPlayer at ${chosen}, with its own output setting.` : ''}
                    </p>
                ` : fullyConnected || this._useAsOutput ? html`
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
                    ${this._webInterfaceUrl() ? html`
                        <a class="action-btn compact secondary" href="${this._webInterfaceUrl()}"
                           target="_blank" rel="noopener noreferrer">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${iconExternalLink}</svg>
                            Web interface
                        </a>
                    ` : nothing}
                    ${!local ? html`
                        <button class="action-btn compact secondary" @click=${this._disconnect}>
                            Disconnect
                        </button>
                    ` : chosen ? html`
                        <button class="action-btn compact secondary" @click=${this._disconnect}>
                            Forget ${chosen}
                        </button>
                    ` : nothing}
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
                        <span class="lib-hqp-vol-val">${Number(this._status?.volume_db ?? 0).toFixed(1)} dB</span>
                    </label>
                    <input class="lib-hqp-slider" type="range"
                           min="-60" max="0" step="0.1"
                           .value=${Number(this._status?.volume_db ?? 0).toFixed(1)}
                           aria-label="HQPlayer volume"
                           @change=${this._setVolume}
                    />
                </div>
                ${this._connection?.local ? nothing : html`
                    <!-- It drops the settings Audiogravity keeps, which belong to the
                         HQPlayer chosen in the card — none are kept for this box's own. -->
                    <div class="lib-hqp-reset">
                        <button class="action-btn compact secondary" @click=${this._resetDsp}>
                            Reset to HQPlayer defaults
                        </button>
                    </div>
                `}
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
