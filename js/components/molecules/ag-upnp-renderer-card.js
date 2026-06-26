/**
 * @module AgUpnpRendererCard
 * @description UPnP Control Point card molecule for the sources view.
 * Discovers UPnP MediaRenderer devices on the network, connects to one,
 * and provides playback controls (play/pause/stop/volume).
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
import { apiGet, apiPut, apiPost, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import { subscribeRendererStatus } from '../../library-store.js';
import { iconWifi, iconPlay, iconPause, iconStop, iconVolume, iconConnection } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';

class AgUpnpRendererCard extends LitElement {

    static properties = {
        _connection:  { state: true },  // RendererConnection from API
        _status:      { state: true },  // RendererStatus from SSE
        _loading:     { state: true },
        _scanning:    { state: true },
        _discovered:  { state: true },  // List<DiscoveredRenderer> | null
        _acting:      { state: true },  // true while a control command is in-flight
        _volume:      { state: true },  // local volume state for slider responsiveness
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
        this._acting     = false;
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
                } catch (_) { /* status may not be available yet */ }
            }
            return conn;
        }, 'upnp-renderer');
    }

    /** Scan the network for UPnP MediaRenderer devices. */
    async _scan() {
        this._scanning  = true;
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
     * Connect to a discovered renderer and persist the connection.
     * @param {{udn:string, friendly_name:string, location:string, manufacturer:string, model_name:string}} renderer
     */
    async _connect(renderer) {
        try {
            this._connection = await apiPut('/upnp-renderer/connection', {
                udn:          renderer.udn,
                friendly_name: renderer.friendly_name,
                location:     renderer.location,
                manufacturer: renderer.manufacturer || '',
                model_name:   renderer.model_name   || '',
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

    // ── SSE ──────────────────────────────────────────────────────────────────

    /**
     * Handle renderer_status SSE events dispatched by sse.js.
     * @param {CustomEvent} e
     */
    _onStatusEvent(e) {
        const data = e.detail;
        if (!data) return;

        // Update connection info if the renderer changed
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

    // ── Playback controls ─────────────────────────────────────────────────────

    /**
     * Resume playback of the current URI on the renderer.
     * No-op when current_uri is null (button is disabled in that state).
     */
    async _play() {
        const uri = this._status?.current_uri;
        if (!uri) return;
        // Include title/artist so the now-playing system can display metadata
        // when this resume command reaches MPD via upmpdcli.
        await this._act(() => apiPost('/upnp-renderer/play', {
            uri,
            title:  this._status?.title  || '',
            artist: this._status?.artist || '',
            album:  this._status?.album  || '',
        }));
    }

    async _pause() {
        await this._act(() => apiPost('/upnp-renderer/pause'));
    }

    async _stop() {
        await this._act(() => apiPost('/upnp-renderer/stop'));
    }

    async _setVolume(e) {
        const vol = parseInt(e.target.value, 10);
        this._volume = vol;
        await this._act(() => apiPut('/upnp-renderer/volume', { volume: vol }));
    }

    /**
     * Wrap a control API call with the _acting guard.
     * @param {() => Promise<any>} fn
     */
    async _act(fn) {
        if (this._acting) return;
        this._acting = true;
        try {
            await fn();
        } catch (e) {
            console.warn('[renderer] Control failed:', e.message);
        }
        this._acting = false;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Format seconds into M:SS display.
     * @param {number|null} secs
     * @returns {string}
     */
    _fmt(secs) {
        if (secs == null || isNaN(secs)) return '--:--';
        const s = Math.floor(secs);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    /** Progress as a percentage (0–100). */
    _progress() {
        const pos = this._status?.position;
        const dur = this._status?.duration;
        if (!pos || !dur || dur <= 0) return 0;
        return Math.min(100, (pos / dur) * 100);
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
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">${iconConnection}</svg>
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
        const state     = this._status?.transport_state ?? null;
        const isPlaying = state === 'PLAYING';
        const title     = this._status?.title   || null;
        const artist    = this._status?.artist  || null;
        const vol       = this._volume ?? this._status?.volume ?? null;

        return html`
            <div class="lib-hqp-card ${available ? 'connected' : ''}">
                <div class="lib-hqp-card-hd">
                    <div class="lib-hqp-ic lib-rdr-ic">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">${iconConnection}</svg>
                    </div>
                    <div class="lib-hqp-col">
                        <div class="lib-hqp-name">${this._connection?.friendly_name || 'UPnP Renderer'}</div>
                        <div class="lib-hqp-desc">${state ? state.replace('_', ' ').toLowerCase() : 'idle'}</div>
                    </div>
                    ${available
                        ? html`<ag-status-indicator state="up" label="Connected"></ag-status-indicator>`
                        : html`<ag-status-indicator state="down" label="Offline"></ag-status-indicator>`
                    }
                </div>

                ${available && (title || artist) ? html`
                    <div class="lib-rdr-track">
                        ${title  ? html`<div class="lib-rdr-title">${title}</div>`  : nothing}
                        ${artist ? html`<div class="lib-rdr-artist">${artist}</div>` : nothing}
                        <div class="lib-rdr-progress">
                            <div class="lib-rdr-bar" style="width:${this._progress()}%"></div>
                        </div>
                        <div class="lib-rdr-time">
                            <span>${this._fmt(this._status?.position)}</span>
                            <span>${this._fmt(this._status?.duration)}</span>
                        </div>
                    </div>
                ` : nothing}

                ${available ? html`
                    <div class="lib-hqp-actions lib-rdr-controls">
                        ${isPlaying
                            ? html`<button class="action-btn compact" @click=${this._pause} ?disabled=${this._acting} aria-label="Pause">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${iconPause}</svg>
                              </button>`
                            : html`<button class="action-btn compact" @click=${this._play}
                                          ?disabled=${this._acting || !this._status?.current_uri}
                                          title=${this._status?.current_uri ? 'Resume' : 'No track loaded'}
                                          aria-label="Play">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${iconPlay}</svg>
                              </button>`
                        }
                        <button class="action-btn compact" @click=${this._stop} ?disabled=${this._acting} aria-label="Stop">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${iconStop}</svg>
                        </button>
                        ${vol !== null ? html`
                            <div class="lib-rdr-volume">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">${iconVolume}</svg>
                                <input class="lib-hqp-slider lib-rdr-vol-slider" type="range"
                                       min="0" max="100" step="1"
                                       .value=${String(vol)}
                                       aria-label="Renderer volume"
                                       @change=${this._setVolume}
                                />
                                <span class="lib-hqp-vol-val">${vol}%</span>
                            </div>
                        ` : nothing}
                        <button class="action-btn compact secondary" @click=${this._disconnect}>
                            Disconnect
                        </button>
                    </div>
                ` : html`
                    <div class="lib-hqp-actions">
                        <button class="action-btn compact secondary" @click=${this._disconnect}>
                            Remove
                        </button>
                    </div>
                `}
            </div>
        `;
    }
}

customElements.define('ag-upnp-renderer-card', AgUpnpRendererCard);

export { AgUpnpRendererCard };
