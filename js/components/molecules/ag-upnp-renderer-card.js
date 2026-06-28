/**
 * @module AgUpnpRendererCard
 * @description Audio output selector card for the Sources page.
 *
 * Shows all known audio outputs:
 *   - Local DAC (always first)
 *   - Known UPnP renderers (from GET /upnp-renderer/known)
 *
 * Clicking an output switches to it:
 *   - Local DAC → DELETE /upnp-renderer/{udn}/connection (disconnect active renderer)
 *   - Renderer   → PUT  /upnp-renderer/{udn}/connection
 *
 * "Scan network" discovers new renderers via GET /upnp-renderer/discover.
 * Volume control is shown for the active renderer when reachable.
 *
 * @element ag-upnp-renderer-card
 *
 * @fires renderer-connected    - Bubbles when a renderer becomes active.
 * @fires renderer-disconnected - Bubbles when the active renderer is disconnected.
 *
 * @dependency css/components/library-sources.css (lib-hqp-* and lib-rdr-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPut, apiDelete } from '../../api.js';
import { subscribeRendererStatus } from '../../library-store.js';
import { iconWifi, iconCast, iconOutput } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';
import './ag-volume-popover.js';

class AgUpnpRendererCard extends LitElement {

    static properties = {
        _known:      { state: true },   // List<RendererEntry> from GET /upnp-renderer/known
        _status:     { state: true },   // RendererStatus from SSE (active renderer)
        _volume:     { state: true },   // optimistic volume for responsive slider
        _loading:    { state: true },
        _scanning:   { state: true },
        _discovered: { state: true },   // List<DiscoveredRenderer> | null (after scan)
        _switching:  { state: true },   // UDN (or 'local') being switched to
    };

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._known      = [];
        this._status     = null;
        this._volume     = null;
        this._loading    = true;
        this._scanning   = false;
        this._discovered = null;
        this._switching  = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        this._unsubscribeRenderer = subscribeRendererStatus(this._onStatusEvent.bind(this));
        // Reload known list when SSE reconnects — the backend publishes renderer_status
        // right after startup/reconnect, but the event arrives before the SSE stream is
        // re-established, so we miss it.  Reloading the REST endpoint on reconnect closes
        // the gap without needing a manual refresh.
        this._onConnectionStatus = ({ connected }) => { if (connected) this._load(); };
        if (window.EventEmitter) {
            window.EventEmitter.on('connection-status', this._onConnectionStatus);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribeRenderer?.();
        if (window.EventEmitter && this._onConnectionStatus) {
            window.EventEmitter.off('connection-status', this._onConnectionStatus);
        }
        this._onConnectionStatus = null;
    }

    // ── Derived state ─────────────────────────────────────────────────────────

    /** UDN of the currently active renderer, or null when Local DAC is the output. */
    get _activeUdn() {
        return this._known.find(r => r.active)?.udn ?? null;
    }

    // ── Data fetching ─────────────────────────────────────────────────────────

    /** Load known renderers and the active renderer status. */
    async _load() {
        this._loading = true;
        try {
            this._known = await apiGet('/upnp-renderer/known') ?? [];
            const activeUdn = this._activeUdn;
            if (activeUdn) {
                try {
                    this._status = await apiGet(`/upnp-renderer/${activeUdn}/status`);
                    this._volume = this._status?.volume ?? null;
                } catch (_) { /* will arrive via SSE */ }
            }
        } catch (e) {
            console.warn('[renderer] Load failed:', e.message);
            this._known = [];
        } finally {
            this._loading = false;
        }
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

    // ── Output selection ──────────────────────────────────────────────────────

    /**
     * Switch to Local DAC: disconnect the currently active renderer.
     * No-op if Local DAC is already active.
     */
    async _selectLocal() {
        const udn = this._activeUdn;
        if (!udn) return;
        this._switching = 'local';
        try {
            await apiDelete(`/upnp-renderer/${udn}/connection`);
            this._status = null;
            this._volume = null;
            await this._load();
            this.dispatchEvent(new CustomEvent('renderer-disconnected', { bubbles: true }));
        } catch (e) {
            console.warn('[renderer] Disconnect failed:', e.message);
        } finally {
            this._switching = null;
        }
    }

    /**
     * Switch to a known renderer.
     * @param {{udn:string, friendly_name:string, location:string, manufacturer:string, model_name:string}} renderer
     */
    async _selectRenderer(renderer) {
        if (renderer.udn === this._activeUdn) return;
        this._switching = renderer.udn;
        try {
            await apiPut(`/upnp-renderer/${renderer.udn}/connection`, {
                udn:           renderer.udn,
                friendly_name: renderer.friendly_name,
                location:      renderer.location     ?? '',
                manufacturer:  renderer.manufacturer ?? '',
                model_name:    renderer.model_name   ?? '',
            });
            await this._load();
            this.dispatchEvent(new CustomEvent('renderer-connected', { bubbles: true }));
        } catch (e) {
            console.warn('[renderer] Switch failed:', e.message);
        } finally {
            this._switching = null;
        }
    }

    /**
     * Connect to a newly discovered renderer (not yet in the known list).
     * @param {{udn:string, friendly_name:string, location:string, manufacturer:string, model_name:string}} renderer
     */
    async _connectNew(renderer) {
        this._switching  = renderer.udn;
        this._discovered = null;
        try {
            await apiPut(`/upnp-renderer/${renderer.udn}/connection`, {
                udn:           renderer.udn,
                friendly_name: renderer.friendly_name,
                location:      renderer.location     ?? '',
                manufacturer:  renderer.manufacturer ?? '',
                model_name:    renderer.model_name   ?? '',
            });
            await this._load();
            this.dispatchEvent(new CustomEvent('renderer-connected', { bubbles: true }));
        } catch (e) {
            console.warn('[renderer] Connect failed:', e.message);
        } finally {
            this._switching = null;
        }
    }

    // ── SSE ───────────────────────────────────────────────────────────────────

    /**
     * Handle renderer_status SSE events dispatched by sse.js.
     * @param {object} data
     */
    _onStatusEvent(data) {
        if (!data) return;
        this._status = data;
        if (data.volume !== null && data.volume !== undefined) {
            this._volume = data.volume;
        }
        // Sync reachable/active in the known list without a full reload.
        // When a renderer becomes connected, clear active on all others to avoid stale "double active".
        if (data.renderer_udn !== undefined) {
            const isNowActive = !!data.connected;
            this._known = this._known.map(r => ({
                ...r,
                active:    r.udn === data.renderer_udn ? isNowActive : (isNowActive ? false : r.active),
                reachable: r.udn === data.renderer_udn ? !!(data.reachable ?? r.reachable) : r.reachable,
            }));
        }
    }

    // ── Volume ────────────────────────────────────────────────────────────────

    async _onVolumeChange(e) {
        const vol = e.detail.volume;
        const udn = this._activeUdn;
        this._volume = vol;
        try {
            if (udn) await apiPut(`/upnp-renderer/${udn}/volume`, { volume: vol });
        } catch (err) {
            console.warn('[renderer] Volume failed:', err.message);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    render() {
        if (this._loading) {
            return html`<div class="lib-empty" style="padding:12px 0">Loading…</div>`;
        }
        return html`
            ${this._renderLocalRow()}
            ${this._known.map(r => this._renderRendererRow(r))}
            ${this._renderScanSection()}
        `;
    }

    /** Local DAC row — always first. */
    _renderLocalRow() {
        const isActive    = this._activeUdn === null;
        const isSwitching = this._switching === 'local';

        return html`
            <div class="lib-hqp-card ${isActive ? 'connected' : ''}"
                 style="${!isActive ? 'cursor:pointer' : ''}"
                 @click=${!isActive ? this._selectLocal : undefined}>
                <div class="lib-hqp-card-hd">
                    <div class="lib-hqp-ic lib-rdr-ic">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                             stroke="currentColor" stroke-width="1.5">${iconOutput}</svg>
                    </div>
                    <div class="lib-hqp-col">
                        <div class="lib-hqp-name">Local DAC</div>
                        <div class="lib-hqp-desc">${isActive ? 'active output' : 'direct to DAC'}</div>
                    </div>
                    ${isSwitching
                        ? html`<span class="lib-hqp-desc">Switching…</span>`
                        : html`<ag-status-indicator
                                .state=${isActive ? 'up' : 'down'}
                                .label=${isActive ? 'Active' : 'Idle'}>
                           </ag-status-indicator>`
                    }
                </div>
            </div>
        `;
    }

    /**
     * Row for a known renderer.
     * @param {{udn:string, friendly_name:string, reachable:boolean, active:boolean}} renderer
     */
    _renderRendererRow(renderer) {
        const { udn, friendly_name, reachable, active } = renderer;
        const isSwitching = this._switching === udn;

        const statusState = active && reachable ? 'up' : active && !reachable ? 'pending' : 'down';
        const statusLabel = active && reachable ? 'Active' : active ? 'Reconnecting' : 'Idle';

        const state = this._status?.transport_state ?? null;
        const desc  = active
            ? (!reachable ? 'reconnecting…' : state ? state.replace(/_/g, ' ').toLowerCase() : 'idle')
            : (reachable ? 'available' : 'offline');

        const vol = active ? (this._volume ?? this._status?.volume ?? null) : null;

        return html`
            <div class="lib-hqp-card ${active ? 'connected' : ''}"
                 style="${!active ? 'cursor:pointer' : ''}"
                 @click=${!active && !isSwitching ? () => this._selectRenderer(renderer) : undefined}>
                <div class="lib-hqp-card-hd">
                    <div class="lib-hqp-ic lib-rdr-ic">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                             stroke="currentColor" stroke-width="1.5">${iconCast}</svg>
                    </div>
                    <div class="lib-hqp-col">
                        <div class="lib-hqp-name">${friendly_name || udn}</div>
                        <div class="lib-hqp-desc">${desc}</div>
                    </div>
                    ${isSwitching
                        ? html`<span class="lib-hqp-desc">Switching…</span>`
                        : html`<ag-status-indicator
                                .state=${statusState}
                                .label=${statusLabel}>
                           </ag-status-indicator>`
                    }
                </div>

                ${active ? html`
                    <div class="lib-hqp-actions">
                        <button class="action-btn compact secondary"
                                @click=${e => { e.stopPropagation(); this._selectLocal(); }}>
                            Disconnect
                        </button>
                        ${reachable && vol !== null ? html`
                            <ag-volume-popover
                                style="margin-left:auto"
                                .volume=${vol}
                                @volume-change=${this._onVolumeChange}>
                            </ag-volume-popover>
                        ` : nothing}
                    </div>
                ` : nothing}
            </div>
        `;
    }

    /** Scan button + discovered renderers not yet in the known list. */
    _renderScanSection() {
        const newFound = this._discovered?.filter(
            d => !this._known.some(k => k.udn === d.udn)
        ) ?? [];

        return html`
            <div class="lib-hqp-discover">
                <button class="action-btn compact"
                        @click=${this._scan}
                        ?disabled=${this._scanning}>
                    ${this._scanning
                        ? 'Scanning…'
                        : html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                                    stroke="currentColor" stroke-width="2">${iconWifi}</svg>
                               Scan network`
                    }
                </button>

                ${newFound.map(r => html`
                    <div class="lib-hqp-card"
                         style="cursor:pointer; margin-top:var(--spacing-xs)"
                         @click=${() => this._connectNew(r)}>
                        <div class="lib-hqp-card-hd">
                            <div class="lib-hqp-ic lib-rdr-ic">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                                     stroke="currentColor" stroke-width="1.5">${iconCast}</svg>
                            </div>
                            <div class="lib-hqp-col">
                                <div class="lib-hqp-name">${r.friendly_name}</div>
                                <div class="lib-hqp-desc">${r.manufacturer || ''} ${r.model_name || ''}</div>
                            </div>
                            <ag-status-indicator state="down" label="Available"></ag-status-indicator>
                        </div>
                    </div>
                `)}

                ${this._discovered !== null && newFound.length === 0 && !this._scanning ? html`
                    <div class="lib-empty" style="padding:8px 0">
                        ${this._known.length > 0 ? 'No new renderer found' : 'No UPnP renderer found on the network'}
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-upnp-renderer-card', AgUpnpRendererCard);

export { AgUpnpRendererCard };
