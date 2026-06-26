/**
 * @module AgUpnpRendererCard
 * @description UPnP Control Point card molecule for the sources view.
 * Discovers UPnP MediaRenderer devices on the network, connects to one,
 * and exposes volume control. Playback controls (play/pause/seek) live in
 * the main player (mini + fullscreen) — this card handles routing setup only.
 *
 * Self-contained: loads its own state and listens to the `renderer-status-update`
 * SSE event dispatched by sse.js whenever the backend publishes `renderer_status`.
 * The parent organism only needs to render `<ag-upnp-renderer-card>`.
 *
 * @element ag-upnp-renderer-card
 *
 * @fires renderer-connected    - Bubbles when a renderer is connected.
 * @fires renderer-disconnected - Bubbles when the renderer is disconnected.
 *
 * @dependency css/components/library-sources.css (lib-hqp-* and lib-rdr-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPut, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import { subscribeRendererStatus } from '../../library-store.js';
import { iconWifi, iconCast } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';
import '../atoms/ag-switch.js';
import './ag-volume-popover.js';

class AgUpnpRendererCard extends LitElement {

    static properties = {
        _connection:  { state: true },  // RendererConnection from API
        _status:      { state: true },  // RendererStatus from SSE
        _loading:     { state: true },
        _scanning:    { state: true },
        _discovered:  { state: true },  // List<DiscoveredRenderer> | null
        _volume:      { state: true },  // optimistic volume for responsive slider
    };

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._connection = null;
        this._status     = null;
        this._loading    = true;
        this._scanning   = false;
        this._discovered = null;
        this._volume     = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadConnection();
        this._unsubscribeRenderer = subscribeRendererStatus(this._onStatusEvent.bind(this));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribeRenderer?.();
    }

    // ── Data fetching ────────────────────────────────────────────────────────

    /** Fetch current connection and status from the backend. */
    async _loadConnection() {
        await loadConnection(this, async () => {
            const conn = await apiGet('/upnp-renderer/connection');
            if (conn?.available) {
                try {
                    this._status  = await apiGet('/upnp-renderer/status');
                    this._volume  = this._status?.volume ?? null;
                } catch (_) { /* will arrive via SSE */ }
            }
            return conn;
        }, 'upnp-renderer');
    }

    /** Scan the network for UPnP MediaRenderer devices. */
    async _scan() {
        this._scanning   = true;
        this._discovered = null;
        try {
            this._discovered = await apiGet('/upnp-renderer/discover?timeout=6');
        } catch (e) {
            console.warn('[renderer] Discovery failed:', e.message);
            this._discovered = [];
        }
        this._scanning = false;
    }

    /**
     * Connect to a discovered renderer.
     * @param {{udn:string, friendly_name:string, location:string, manufacturer:string, model_name:string}} renderer
     */
    async _connect(renderer) {
        try {
            this._connection = await apiPut('/upnp-renderer/connection', {
                udn:           renderer.udn,
                friendly_name: renderer.friendly_name,
                location:      renderer.location,
                manufacturer:  renderer.manufacturer || '',
                model_name:    renderer.model_name   || '',
            });
            this._discovered = null;
            if (this._connection?.available) {
                try {
                    this._status = await apiGet('/upnp-renderer/status');
                    this._volume = this._status?.volume ?? null;
                } catch (_) { /* will arrive via SSE */ }
            }
            this.dispatchEvent(new CustomEvent('renderer-connected', { bubbles: true }));
        } catch (e) {
            console.warn('[renderer] Connect failed:', e.message);
        }
    }

    /** Disconnect from the current renderer. */
    async _disconnect() {
        try {
            await apiDelete('/upnp-renderer/connection');
        } catch (e) {
            console.warn('[renderer] Disconnect failed:', e.message);
        }
        this._connection = null;
        this._status     = null;
        this._discovered = null;
        this._volume     = null;
        this.dispatchEvent(new CustomEvent('renderer-disconnected', { bubbles: true }));
    }

    /**
     * Toggle bypass mode — keeps the renderer connected but suspends routing.
     * @param {boolean} bypassed
     */
    async _setBypass(bypassed) {
        try {
            await apiPut('/upnp-renderer/bypass', { bypassed });
        } catch (e) {
            console.warn('[renderer] Bypass toggle failed:', e.message);
            // Force re-render so the toggle snaps back to its actual state
            // (_status?.bypassed has not changed, so Lit would not re-render otherwise).
            this.requestUpdate();
        }
    }

    // ── SSE ──────────────────────────────────────────────────────────────────

    /**
     * Handle renderer_status SSE events dispatched by sse.js.
     * @param {object} data
     */
    _onStatusEvent(data) {
        if (!data) return;
        if (data.renderer_udn !== undefined) {
            this._connection = {
                ...(this._connection || {}),
                udn:           data.renderer_udn,
                friendly_name: data.renderer_name,
                location:      data.renderer_location,
                available:     data.connected,
            };
        }
        this._status = data;
        if (data.volume !== null && data.volume !== undefined) {
            this._volume = data.volume;
        }
    }

    // ── Volume ────────────────────────────────────────────────────────────────

    async _onVolumeChange(e) {
        const vol = e.detail.volume;
        this._volume = vol;
        try {
            await apiPut('/upnp-renderer/volume', { volume: vol });
        } catch (e) {
            console.warn('[renderer] Volume failed:', e.message);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    render() {
        if (this._loading) {
            return html`<div class="lib-empty" style="padding:12px 0">Loading…</div>`;
        }
        if (!this._connection?.available && !this._connection?.udn) {
            return this._renderDiscovery();
        }
        return this._renderCard();
    }

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

                ${this._discovered?.map(r => html`
                    <div class="lib-hqp-card" @click=${() => this._connect(r)} style="cursor:pointer">
                        <div class="lib-hqp-card-hd">
                            <div class="lib-hqp-ic lib-rdr-ic">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">${iconCast}</svg>
                            </div>
                            <div class="lib-hqp-col">
                                <div class="lib-hqp-name">${r.friendly_name}</div>
                                <div class="lib-hqp-desc">${r.manufacturer || ''} ${r.model_name || ''}</div>
                            </div>
                            <ag-status-indicator state="down" label="Available"></ag-status-indicator>
                        </div>
                    </div>
                `)}

                ${this._discovered?.length === 0 ? html`
                    <div class="lib-empty" style="padding:12px 0">No UPnP renderer found on the network</div>
                ` : nothing}
            </div>
        `;
    }

    _renderCard() {
        const available = this._connection?.available ?? false;
        const bypassed  = this._status?.bypassed ?? false;
        const state     = this._status?.transport_state ?? null;
        const vol       = this._volume ?? this._status?.volume ?? null;

        return html`
            <div class="lib-hqp-card ${available ? 'connected' : ''}">
                <div class="lib-hqp-card-hd">
                    <div class="lib-hqp-ic lib-rdr-ic ${bypassed ? 'bypassed' : ''}">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">${iconCast}</svg>
                    </div>
                    <div class="lib-hqp-col">
                        <div class="lib-hqp-name">${this._connection?.friendly_name || 'UPnP Renderer'}</div>
                        <div class="lib-hqp-desc">${bypassed ? 'bypassed — routing to local' : state ? state.replace(/_/g, ' ').toLowerCase() : 'idle'}</div>
                    </div>
                    ${available
                        ? html`<ag-status-indicator state="up" label="Connected"></ag-status-indicator>`
                        : html`<ag-status-indicator state="down" label="Offline"></ag-status-indicator>`
                    }
                </div>

                <div class="lib-hqp-actions">
                    <button class="action-btn compact secondary" @click=${this._disconnect}>
                        Disconnect
                    </button>
                    ${available ? html`
                        <ag-switch
                            .checked=${bypassed}
                            variant="notification"
                            title="${bypassed ? 'Enable renderer routing' : 'Bypass renderer — play locally'}"
                            @ag-change=${(e) => this._setBypass(e.detail.checked)}
                        ></ag-switch>
                        <span class="lib-rdr-bypass-label">Bypass</span>
                    ` : nothing}
                    ${available && vol !== null ? html`
                        <ag-volume-popover
                            style="margin-left:auto"
                            .volume=${vol}
                            @volume-change=${this._onVolumeChange}
                        ></ag-volume-popover>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-upnp-renderer-card', AgUpnpRendererCard);

export { AgUpnpRendererCard };
