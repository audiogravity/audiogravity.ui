/**
 * @module AgLibrarySources
 * @description Source switcher view. Lists all available audio sources
 * and lets the user select the active library source.
 * For Roon sources, expands to show available zones fetched from GET /api/library/roon-zones.
 * Source list is fetched from GET /api/player/state/snapshot (sources[] field).
 * UPnP servers are loaded from GET /api/library/upnp-known-servers (backend-persisted) on mount;
 * a manual scan calls GET /api/library/upnp-servers and the backend auto-saves results.
 *
 * @element ag-library-sources
 *
 * @attr {string} source-id - Currently active source ID
 * @attr {string} zone-id   - Currently active zone ID (Roon)
 *
 * @fires lib-source-change - Bubbles. detail: { sourceId, zoneId }
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet, apiDelete } from '../../api.js';
import { loadWithState } from '../utils-lit.js';
import { getSnapshot } from '../../library-store.js';
import { iconWifi } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';
import '../molecules/ag-library-source-card.js';

// Distance (px) past which a left-swipe commits as "remove".
const _SWIPE_COMMIT_PX = 140;
// Dead-zone before interpreting a move as a swipe (not a tap).
const _SWIPE_SLOP_PX   = 8;

export class AgLibrarySources extends LitElement {
    static properties = {
        sourceId:        { type: String, attribute: 'source-id' },
        zoneId:          { type: String, attribute: 'zone-id' },
        zoneDisplayName: { type: String, attribute: 'zone-display-name' },
        _nodes:          { state: true },
        _loading:        { state: true },
        _upnpServers:    { state: true },
        _upnpLoading:    { state: true },
        _upnpDiscovered: { state: true },
        _upnpExtraHost:  { state: true },
        _upnpSwipeDx:    { state: true },
        _upnpSwipeSrv:   { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId        = '';
        this.zoneId          = '';
        this.zoneDisplayName = '';
        this._nodes          = [];
        this._loading        = false;
        this._upnpServers    = [];
        this._upnpLoading    = false;
        this._upnpDiscovered = false;
        this._upnpExtraHost  = '';
        this._upnpSwipeDx    = 0;
        this._upnpSwipeSrv   = null;
        this._upnpSwipeStartX  = null;
        this._upnpSwipeActive  = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadKnownUpnpServers();
        this._load();
    }

    /**
     * Load previously-discovered UPnP servers from the backend.
     * Populates the list instantly on mount without triggering a slow SSDP scan.
     */
    async _loadKnownUpnpServers() {
        try {
            const servers = await apiGet('/library/upnp-known-servers');
            if (Array.isArray(servers) && servers.length > 0) {
                this._upnpServers    = servers;
                this._upnpDiscovered = true;
            }
        } catch (_) {
            // Silently ignore — user can trigger a manual scan
        }
    }

    _rescanUpnp() {
        this._upnpDiscovered = false;
        this._upnpServers    = [];
    }

    /* ─── UPnP swipe-to-remove gesture ─────────────────────────────── */

    _onUpnpPointerDown(e, srv) {
        if (e.button !== undefined && e.button !== 0) return;
        this._upnpSwipeSrv    = srv;
        this._upnpSwipeStartX = e.clientX;
        this._upnpSwipeActive = false;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }

    _onUpnpPointerMove = (e) => {
        if (this._upnpSwipeStartX === null) return;
        const dx = e.clientX - this._upnpSwipeStartX;
        if (!this._upnpSwipeActive && Math.abs(dx) > _SWIPE_SLOP_PX) {
            this._upnpSwipeActive = true;
        }
        if (this._upnpSwipeActive) {
            this._upnpSwipeDx = Math.min(0, dx);
        }
    };

    _onUpnpPointerEnd = (e) => {
        if (this._upnpSwipeStartX === null) return;
        const wasActive = this._upnpSwipeActive;
        const dx        = this._upnpSwipeDx;
        const srv       = this._upnpSwipeSrv;
        this._upnpSwipeStartX = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
        const committed = wasActive
            && e.type !== 'pointercancel'
            && dx <= -_SWIPE_COMMIT_PX
            && srv;
        if (committed) {
            this._removeUpnpServer(srv);
        }
        this._upnpSwipeDx = 0;
        setTimeout(() => { this._upnpSwipeActive = false; }, 0);
    };

    /**
     * Remove a UPnP server from the UI immediately and persist the change.
     * @param {object} srv - UPnPServer object from _upnpServers.
     */
    async _removeUpnpServer(srv) {
        this._upnpServers = this._upnpServers.filter(s => s.id !== srv.id);
        if (this._upnpServers.length === 0) this._upnpDiscovered = false;
        try {
            await apiDelete(`/library/upnp-known-servers/${encodeURIComponent(srv.id)}`);
        } catch (e) {
            console.error('[sources] UPnP remove failed:', e);
        }
    }

    async _load() {
        await loadWithState(this, async () => {
            const state = await getSnapshot();
            this._nodes = (state?.sources ?? []).map(s => ({
                id:     s.source_id,
                name:   s.name,
                status: s.active ? 'active' : '',
            }));
        });
    }

    async _discoverUpnp() {
        this._upnpLoading = true;
        try {
            const params = new URLSearchParams({ timeout: '6' });
            if (this._upnpExtraHost.trim()) params.set('hosts', this._upnpExtraHost.trim());
            this._upnpServers    = await apiGet(`/library/upnp-servers?${params}`);
            this._upnpDiscovered = true;
        } catch (e) {
            console.error('[sources] UPnP discovery failed:', e);
            this._upnpServers = [];
        } finally {
            this._upnpLoading = false;
        }
    }

    _onSourceSelect(e) {
        const { sourceId, zoneId, zoneDisplayName = '' } = e.detail;
        this.dispatchEvent(new CustomEvent('lib-source-change', {
            detail: { sourceId, zoneId, zoneDisplayName },
            bubbles: true,
        }));
    }

    _selectUpnpServer(srv) {
        this.dispatchEvent(new CustomEvent('lib-source-change', {
            detail: {
                sourceId:   srv.id,
                zoneId:     '',
                controlUrl: srv.control_url,
                serverName: srv.friendly_name,
            },
            bubbles: true,
        }));
    }

    render() {
        if (this._loading) return html`<div class="lib-loading">Loading…</div>`;

        const libSources = this._nodes.filter(n =>
            n.id === 'src_mpd' || n.id === 'src_roon' || n.id === 'src_mono-sgen'
            || n.id === 'src_qobuz' || n.id === 'src_tidal'
        );
        const active = libSources.filter(n => n.id === this.sourceId);
        const others = libSources.filter(n => n.id !== this.sourceId);

        return html`
            <div class="lib-src-list">
                ${active.length > 0 ? html`
                    <span class="lib-src-lbl">Active source</span>
                    ${active.map(n => html`
                        <ag-library-source-card
                            .node=${n}
                            ?active=${true}
                            zone-id=${this.zoneId}
                            zone-display-name=${this.zoneDisplayName}
                            @source-select=${this._onSourceSelect}
                        ></ag-library-source-card>
                    `)}
                ` : nothing}

                <span class="lib-src-lbl" style="margin-top:${active.length ? '18px' : '0'}">
                    ${active.length ? 'Other sources' : 'Sources'}
                </span>
                ${others.length > 0
                    ? others.map(n => html`
                        <ag-library-source-card
                            .node=${n}
                            @source-select=${this._onSourceSelect}
                        ></ag-library-source-card>
                    `)
                    : html`<div class="lib-empty" style="padding:20px 0">No other sources</div>`
                }
                <div style="height:6px"></div>

                <div class="lib-upnp-header">
                    <span class="lib-src-lbl">UPnP servers</span>
                    ${this._upnpDiscovered ? html`
                        <button class="lib-upnp-rescan" @click=${this._rescanUpnp} title="Re-scan UPnP servers">
                            Re-scan
                        </button>
                    ` : nothing}
                </div>
                ${this._upnpDiscovered
                    ? this._upnpServers.length === 0
                        ? html`<div class="lib-empty" style="padding:16px 0">No UPnP server found</div>`
                        : this._upnpServers.map(srv => {
                            const isSwipe    = this._upnpSwipeSrv?.id === srv.id;
                            const dx         = isSwipe ? this._upnpSwipeDx : 0;
                            const innerStyle = `transform: translateX(${dx}px); transition: ${this._upnpSwipeStartX === null ? 'transform 180ms ease-out' : 'none'};`;
                            return html`
                                <div class="lib-upnp-wrap">
                                    <div class="lib-upnp-delete" aria-hidden="true">Remove</div>
                                    <div class="lib-src-card ${this.sourceId === srv.id ? 'active' : ''}"
                                        style=${innerStyle}
                                        @click=${() => !this._upnpSwipeActive && this._selectUpnpServer(srv)}
                                        @pointerdown=${(e) => this._onUpnpPointerDown(e, srv)}
                                        @pointermove=${this._onUpnpPointerMove}
                                        @pointerup=${this._onUpnpPointerEnd}
                                        @pointercancel=${this._onUpnpPointerEnd}>
                                        <div class="lib-src-card-hd">
                                            <div class="lib-src-ic">${srv.manufacturer?.toLowerCase().includes('minimserver')
                                                ? html`<img src="./pics/minimserver.webp" alt="MinimServer" width="28" height="28" style="object-fit:contain">`
                                                : 'UP'
                                            }</div>
                                            <div class="lib-src-col">
                                                <span class="lib-src-name">${srv.friendly_name}</span>
                                                <span class="lib-src-desc">${srv.location ? new URL(srv.location).host : ''}</span>
                                            </div>
                                            <ag-status-indicator state="up" label="Online"></ag-status-indicator>
                                        </div>
                                    </div>
                                </div>
                            `;
                        })
                    : html`
                        <div class="lib-upnp-discover">
                            <div class="lib-inline-row">
                                <input
                                    class="lib-inline-input"
                                    type="text"
                                    placeholder="IP, host:port or http://host:port/uuid/Upnp/device.xml"
                                    .value=${this._upnpExtraHost}
                                    @input=${(e) => { this._upnpExtraHost = e.target.value; }}
                                    @keydown=${(e) => e.key === 'Enter' && !this._upnpLoading && this._discoverUpnp()}
                                />
                                <button
                                    class="action-btn compact"
                                    @click=${() => this._discoverUpnp()}
                                    ?disabled=${this._upnpLoading}
                                >
                                    ${this._upnpLoading
                                        ? html`<span>Scanning…</span>`
                                        : html`
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                                                stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                                                ${iconWifi}
                                            </svg>
                                            <span>Scan</span>
                                        `
                                    }
                                </button>
                            </div>
                            <p class="lib-inline-help">
                                <b>Cross-subnet</b> (ohnet / MinimServer) — enter the full device URL.<br>
                                Find it in your MinimServer config:
                                <code>http://&lt;host&gt;:9791/&lt;minimserver.udn&gt;/Upnp/device.xml</code>
                            </p>
                        </div>
                    `
                }
                <div class="lib-qb-section">
                    <div class="lib-hqp-header">
                        <span class="lib-src-lbl">Qobuz</span>
                    </div>
                    <ag-qobuz-output></ag-qobuz-output>
                </div>

                <div class="lib-qb-section">
                    <div class="lib-hqp-header">
                        <span class="lib-src-lbl">Tidal</span>
                    </div>
                    <ag-tidal-output></ag-tidal-output>
                </div>

                <div class="lib-hqp-section">
                    <div class="lib-hqp-header">
                        <span class="lib-src-lbl">HQPlayer</span>
                        <button class="lib-upnp-rescan" @click=${() => this.querySelector('ag-hqplayer-output')?._refresh()} title="Re-scan HQPlayer state">
                            Re-scan
                        </button>
                    </div>
                    <ag-hqplayer-output></ag-hqplayer-output>
                </div>

                <div style="height:12px"></div>
            </div>
        `;
    }
}

customElements.define('ag-library-sources', AgLibrarySources);
