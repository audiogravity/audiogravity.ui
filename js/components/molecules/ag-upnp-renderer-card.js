/**
 * @module AgUpnpRendererCard
 * @description Audio output selector card for the Sources page.
 *
 * Shows all known audio outputs (from GET /player/outputs):
 *   - Physical MPD outputs (type='mpd_output') — one per MPD audio_output block
 *   - Known UPnP renderers (type='upnp_renderer')
 *
 * Clicking an output switches to it:
 *   - MPD output  → PUT  /player/mpd-output/{output_id} (enables exclusively, disconnects renderer)
 *   - Renderer    → PUT  /upnp-renderer/{udn}/connection
 *
 * "Scan renderers" discovers new UPnP renderers via GET /upnp-renderer/discover.
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

// Distance (px) at which a horizontal pointer move commits the swipe-to-delete.
const _SWIPE_COMMIT_PX = 140;
// Minimum movement before we classify the gesture as a swipe (not a tap).
const _SWIPE_SLOP_PX   = 8;
import '../atoms/ag-status-indicator.js';
import './ag-volume-popover.js';

class AgUpnpRendererCard extends LitElement {

    static properties = {
        _mpd_outputs: { state: true },  // List<MpdOutput> from GET /player/outputs (type=mpd_output)
        _known:       { state: true },  // List<RendererEntry> from GET /player/outputs (type=upnp_renderer)
        _status:      { state: true },  // RendererStatus from SSE (active renderer)
        _volume:      { state: true },  // optimistic volume for responsive slider
        _loading:     { state: true },
        _scanning:    { state: true },
        _discovered:  { state: true },  // List<DiscoveredRenderer> | null (after scan)
        _switching:   { state: true },  // id being switched to
        _swipingUdn:  { state: true },  // UDN of the row currently being dragged
        _swipeDx:     { state: true },  // live horizontal offset of the dragged card (px, ≤ 0)
    };

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._mpd_outputs   = [];
        this._known         = [];
        this._status        = null;
        this._volume        = null;
        this._loading       = true;
        this._scanning      = false;
        this._discovered    = null;
        this._switching     = null;
        this._swipingUdn    = null;
        this._swipeDx       = 0;
        /** @private Non-reactive swipe tracking — does not trigger re-render. */
        this._swipeStart    = null;   // { x: number, udn: string } | null
        this._swipeWasActive = false; // true once movement exceeds SLOP — suppresses click
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

    /** Load all audio outputs (MPD physical + UPnP renderers) and the active renderer status. */
    async _load() {
        this._loading = true;
        try {
            const outputs = await apiGet('/player/outputs') ?? [];
            this._mpd_outputs = outputs.filter(o => o.type === 'mpd_output');
            this._known       = outputs.filter(o => o.type === 'upnp_renderer');
            const activeUdn = this._activeUdn;
            if (activeUdn) {
                try {
                    this._status = await apiGet(`/upnp-renderer/${activeUdn}/status`);
                    this._volume = this._status?.volume ?? null;
                } catch (_) { /* will arrive via SSE */ }
            }
        } catch (e) {
            console.warn('[renderer] Load failed:', e.message);
            this._mpd_outputs = [];
            this._known       = [];
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
     * Switch to a physical MPD audio output.
     * Enables the output exclusively; the backend disconnects any active renderer.
     * @param {{id:string, output_id:number, name:string}} output
     */
    async _selectMpdOutput(output) {
        this._switching = output.id;
        try {
            await apiPut(`/player/mpd-output/${output.output_id}`, {});
            this._status = null;
            this._volume = null;
            await this._load();
            this.dispatchEvent(new CustomEvent('renderer-disconnected', { bubbles: true }));
        } catch (e) {
            console.warn('[renderer] MPD output switch failed:', e.message);
        } finally {
            this._switching = null;
        }
    }

    /**
     * Disconnect the active renderer without switching to a specific MPD output.
     * Fallback when no MPD output is available.
     * @param {string} udn - UDN of the renderer to disconnect.
     */
    async _disconnectRenderer(udn) {
        this._switching = 'disconnect';
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

    // ── Swipe-to-delete ───────────────────────────────────────────────────────

    /**
     * Permanently remove a renderer from the known list via DELETE /upnp-renderer/{udn}.
     * Optimistic: removes from local list immediately; re-fetches on error.
     * @param {string} udn
     */
    async _removeRenderer(udn) {
        this._known = this._known.filter(r => r.udn !== udn);
        try {
            await apiDelete(`/upnp-renderer/${udn}`);
        } catch (e) {
            console.warn('[renderer] Remove failed:', e.message);
            await this._load();
        }
    }

    /**
     * Pointer down — starts tracking a swipe gesture on an inactive renderer row.
     * @param {PointerEvent} e
     * @param {string} udn
     */
    _onPointerDown(e, udn) {
        if (e.button !== undefined && e.button !== 0) return;
        this._swipeStart     = { x: e.clientX, udn };
        this._swipingUdn     = udn;
        this._swipeDx        = 0;
        this._swipeWasActive = false;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }

    /**
     * Pointer move — updates the live translation of the dragged card.
     * @param {PointerEvent} e
     * @param {string} udn
     */
    _onPointerMove(e, udn) {
        if (!this._swipeStart || this._swipeStart.udn !== udn) return;
        const dx = e.clientX - this._swipeStart.x;
        if (!this._swipeWasActive && Math.abs(dx) > _SWIPE_SLOP_PX) {
            this._swipeWasActive = true;
        }
        if (this._swipeWasActive) {
            // Left-swipe only — clamp positive (rightward) to zero.
            this._swipeDx = Math.min(0, dx);
        }
    }

    /**
     * Pointer up / cancel — commits the remove if past threshold, otherwise snaps back.
     * @param {PointerEvent} e
     * @param {string} udn
     */
    _onPointerEnd(e, udn) {
        if (!this._swipeStart || this._swipeStart.udn !== udn) return;
        const committed = this._swipeWasActive
            && e.type !== 'pointercancel'
            && this._swipeDx <= -_SWIPE_COMMIT_PX;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
        this._swipeStart = null;
        this._swipingUdn = null;
        this._swipeDx    = 0;
        // Delay clearing so the trailing click fired by some browsers after pointerup
        // is still suppressed by _swipeWasActive.
        setTimeout(() => { this._swipeWasActive = false; }, 0);
        if (committed) {
            this._removeRenderer(udn);
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
            // If the renderer is not yet in _known (SSE arrived before _load() completed),
            // trigger a reload instead of silently dropping the active/reachable update.
            if (!this._known.some(r => r.udn === data.renderer_udn)) {
                this._load();
                return;
            }
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
            ${this._mpd_outputs.map(o => this._renderMpdRow(o))}
            ${this._known.map(r => this._renderRendererRow(r))}
            ${this._renderScanSection()}
        `;
    }

    /**
     * Row for a physical MPD audio output (USB, TOSLINK, etc.).
     * @param {{id:string, type:string, name:string, reachable:boolean, active:boolean, output_id:number}} output
     */
    _renderMpdRow(output) {
        const { id, name, reachable, active, output_id } = output;
        const isSwitching = this._switching === id;

        return html`
            <div class="lib-hqp-card ${active ? 'connected' : ''}"
                 style="${!active ? 'cursor:pointer' : ''}"
                 @click=${!active && !isSwitching ? () => this._selectMpdOutput(output) : undefined}>
                <div class="lib-hqp-card-hd">
                    <div class="lib-hqp-ic lib-rdr-ic">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                             stroke="currentColor" stroke-width="1.5">${iconOutput}</svg>
                    </div>
                    <div class="lib-hqp-col">
                        <div class="lib-hqp-name">${name}</div>
                        <div class="lib-hqp-desc">${active ? 'active output' : reachable ? 'available' : 'offline'}</div>
                    </div>
                    ${isSwitching
                        ? html`<span class="lib-hqp-desc">Switching…</span>`
                        : html`<ag-status-indicator
                                .state=${active ? 'up' : reachable ? 'down' : 'pending'}
                                .label=${active ? 'Active' : 'Idle'}>
                           </ag-status-indicator>`
                    }
                </div>
            </div>
        `;
    }

    /**
     * Row for a known renderer.
     *
     * Inactive renderers are wrapped in a swipe-to-delete container that follows
     * the same Pointer Events pattern as ag-radio-card: drag left past
     * _SWIPE_COMMIT_PX to commit the deletion.
     *
     * Active renderers are rendered without the swipe wrapper — they show
     * Disconnect + Volume controls instead.
     *
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

        // Shared header grid used by both active and inactive rows.
        const header = html`
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
        `;

        if (active) {
            // Active renderer — no swipe, just the card with Disconnect + Volume.
            return html`
                <div class="lib-hqp-card connected">
                    ${header}
                    <div class="lib-hqp-actions">
                        <button class="action-btn compact secondary"
                                @click=${e => {
                                    e.stopPropagation();
                                    const first = this._mpd_outputs[0];
                                    if (first) this._selectMpdOutput(first);
                                    else this._disconnectRenderer(udn);
                                }}>
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
                </div>
            `;
        }

        // Inactive renderer — swipeable.
        const isDragging = this._swipingUdn === udn;
        const dx         = isDragging ? this._swipeDx : 0;
        const cardStyle  = `transform: translateX(${dx}px); transition: ${isDragging ? 'none' : 'transform 180ms ease-out'};`;

        return html`
            <div class="lib-rdr-swipe-wrap">
                <div class="lib-rdr-delete-zone" aria-hidden="true">Remove</div>
                <div class="lib-hqp-card"
                     style="${!isSwitching ? 'cursor:pointer;' : ''}${cardStyle}"
                     @pointerdown=${(e) => this._onPointerDown(e, udn)}
                     @pointermove=${(e) => this._onPointerMove(e, udn)}
                     @pointerup=${(e) => this._onPointerEnd(e, udn)}
                     @pointercancel=${(e) => this._onPointerEnd(e, udn)}
                     @click=${!isSwitching ? () => {
                         if (!this._swipeWasActive) this._selectRenderer(renderer);
                     } : undefined}>
                    ${header}
                </div>
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
                               Scan renderers`
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
