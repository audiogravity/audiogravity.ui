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
import { getSnapshot, subscribePlayerState } from '../../library-store.js';
import { resolvePlayingSource, BROWSE_KINDS, INPUT_KINDS } from '../library-constants.js';
import { iconWifi } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';
import '../molecules/ag-library-source-card.js';
import '../molecules/ag-upnp-renderer-card.js';
import { SwipeToDismissController, swipeRow } from '../../core/SwipeToDismissController.js';
import '../molecules/ag-highresaudio-connection.js';
import '../molecules/ag-hqplayer-output.js';
import '../molecules/ag-qobuz-connection.js';
import '../molecules/ag-tidal-connection.js';

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
        _playingKey:     { state: true },
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
        this._playingKey     = '';
        this._unsubscribeState = null;
        this._swipe = new SwipeToDismissController(this, {
            onCommit: (id) => {
                const srv = this._upnpServers.find(s => s.id === id);
                if (srv) this._removeUpnpServer(srv);
            },
        });
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadKnownUpnpServers();
        this._load();
        // The connection cards below are OUR children, and connecting or
        // disconnecting one changes the very list rendered here. Without this
        // the list was read once, on mount, and never again — so a source
        // connected from this screen only appeared after leaving and coming
        // back to it.
        this._boundSourcesChanged = () => this._load({ force: true });
        this.addEventListener('sources-changed', this._boundSourcesChanged);
        // Which source is diffusing changes on its own — a station starts, a
        // phone pushes AirPlay — so the badge cannot be read once on mount. The
        // subscription is multiplexed with the page's, not a second stream.
        this._unsubscribeState = subscribePlayerState(
            (state) => { this._playingKey = this._playingKeyFrom(state); });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('sources-changed', this._boundSourcesChanged);
        this._unsubscribeState?.();
        this._unsubscribeState = null;
    }

    /**
     * Resolve which SOURCE one playing entry is coming from, not which engine.
     *
     * A station, a Qobuz album and a local file all travel over MPD, so the
     * entry's own `source_id` says "Local Library" for all three — only its
     * `origin` separates them.
     *
     * @param {object} src - One `sources[]` entry.
     * @returns {string} The source id to badge, or '' when it names none.
     */
    _contentSourceOf(src) {
        // The backend names it, media servers included: an entry keyed
        // `upnp:<udn>` here matches the card built from the same id. This used to
        // match a UPnP server by its friendly NAME, the only thing the player
        // state carried — so two servers sharing one both lit up.
        if (src.content_source_id) return src.content_source_id;
        // No id: a core that predates the field, or a stream whose server could
        // not be identified when it was queued. For a UPnP stream that means
        // naming nothing rather than falling through to the engine, which would
        // light "Local Library" while a MinimServer track plays — the very defect
        // this screen exists to fix.
        if (src.origin === 'upnp') return '';
        return resolvePlayingSource(src).id || '';
    }

    /**
     * Build the key naming every source that is diffusing right now.
     *
     * EVERY playing entry, not the one the player happens to be showing: the box
     * casts several streams at once — AirPlay to the toslink while Qobuz goes to
     * the USB DAC — and reading the single active source lit whichever had
     * started first, leaving the other grey though it was audible. Each entry
     * carries its own `playing` and its own `origin`, which is what this reads.
     *
     * Returned as a sorted string rather than a Set so Lit can tell two ticks
     * apart: it compares reactive state with `!==`, and a fresh Set is never
     * equal to the last one, so the whole list would re-render every second.
     *
     * @param {object} state - PlayerState, from the snapshot or the SSE stream.
     * @returns {string} Newline-joined source ids, sorted; '' when none plays.
     */
    _playingKeyFrom(state) {
        const ids = new Set();
        for (const src of state?.sources ?? []) {
            if (!src.playing) continue;
            const id = this._contentSourceOf(src);
            if (id) ids.add(id);
        }
        return [...ids].sort().join('\n');
    }

    /** @returns {Set<string>} The sources diffusing right now. */
    get _playingIds() {
        return new Set(this._playingKey ? this._playingKey.split('\n') : []);
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

    /**
     * Remove a UPnP server from the UI immediately and persist the change.
     * @param {object} srv - UPnPServer object from _upnpServers.
     */
    async _removeUpnpServer(srv) {
        this._upnpServers = this._upnpServers.filter(s => s.id !== srv.id);
        if (this._upnpServers.length === 0) this._upnpDiscovered = false;
        try {
            await apiDelete(`/library/upnp-known-servers/${encodeURIComponent(srv.id)}`);
            this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
        } catch (e) {
            console.error('[sources] UPnP remove failed:', e);
        }
    }

    /**
     * Read the source list from the player state.
     *
     * @param {object} [opts]
     * @param {boolean} [opts.force] - Skip the snapshot cache. Required after a
     *        connection changed the list: a cached answer still describes the
     *        state from before it.
     */
    async _load({ force = false } = {}) {
        await loadWithState(this, async () => {
            const state = await getSnapshot({ force });
            this._playingKey = this._playingKeyFrom(state);
            this._nodes = (state?.sources ?? []).map(AgLibrarySources.toNode);
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

    /**
     * Return the node with the live playback status the card renders.
     *
     * Kept out of `_nodes` on purpose: the list is refetched only when the set of
     * sources changes, while what is playing moves on its own.
     *
     * @param {{id: string}} node - A source descriptor from `_nodes`.
     * @param {Set<string>} playing - The sources diffusing right now.
     * @returns {object} The same descriptor plus its `status`.
     */
    _withStatus(node, playing) {
        return { ...node, status: playing.has(node.id) ? 'active' : '' };
    }

    /**
     * Reduce one published source to what this screen needs of it.
     *
     * Its own method so the fallback's inputs cannot go missing unnoticed: the
     * two fields it reads are carried for it alone, never displayed, and when a
     * first attempt dropped them the fallback failed OPEN — every entry passed
     * as a source, the Inputs section came out empty, and an AirPlay card
     * offered itself as something to browse. The tests build their nodes through
     * this, so dropping one breaks them.
     *
     * @param {object} s - One `sources[]` entry from the player state.
     * @returns {object} The node the screen renders and filters on.
     */
    static toNode(s) {
        return {
            id:         s.source_id,
            name:       s.name,
            kind:       s.kind,
            protocol:   s.protocol,
            selectable: s.selectable,
        };
    }

    /**
     * Split the published sources into what is browsed and what merely arrives.
     *
     * The fallback is for a core that predates `kind`. The two packages are
     * released together but install separately, and the version banner only
     * warns across a major.minor gap — so a frontend one patch ahead would show
     * this screen with NO cards at all and nothing to explain it. It states what
     * the old six-id filter meant, without its list of names: a source is
     * whatever is neither an incoming stream nor a routing handle.
     *
     * @param {Array<object>} nodes - Entries from the player's source list.
     * @returns {{libSources: Array<object>, inputs: Array<object>}} The two halves.
     */
    _splitByType(nodes) {
        const typed = nodes.some(n => n.kind);
        const source = n => (typed ? BROWSE_KINDS.has(n.kind)
                                   : n.protocol !== 'mpris' && n.selectable !== false);
        const input = n => (typed ? INPUT_KINDS.has(n.kind) : n.protocol === 'mpris');
        return { libSources: nodes.filter(source), inputs: nodes.filter(input) };
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
                location: srv.location,
                serverName: srv.friendly_name,
            },
            bubbles: true,
        }));
    }

    render() {
        if (this._loading) return html`<div class="lib-loading">Loading…</div>`;

        // Filtered by TYPE, not by a list of names. The list of six ids this
        // replaces is why the radio had no card at all: every source added to the
        // backend had to be remembered here too, and one was not.
        const playing = this._playingIds;
        const { libSources, inputs } = this._splitByType(this._nodes);
        const active = libSources.filter(n => n.id === this.sourceId);
        const others = libSources.filter(n => n.id !== this.sourceId);

        return html`
            <div class="lib-src-list">
                ${active.length > 0 ? html`
                    <span class="lib-src-lbl">Active source</span>
                    ${active.map(n => html`
                        <ag-library-source-card
                            .node=${this._withStatus(n, playing)}
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
                            .node=${this._withStatus(n, playing)}
                            @source-select=${this._onSourceSelect}
                        ></ag-library-source-card>
                    `)
                    : html`<div class="lib-empty" style="padding:20px 0">No other sources</div>`
                }
                <div style="height:6px"></div>

                ${inputs.length > 0 ? html`
                    <span class="lib-src-lbl">Inputs</span>
                    ${inputs.map(n => html`
                        <ag-library-source-card
                            .node=${this._withStatus(n, playing)}
                        ></ag-library-source-card>
                    `)}
                    <div style="height:6px"></div>
                ` : nothing}

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
                            return html`
                                <div class="ag-swipe-wrap lib-upnp-wrap">
                                    <div class="ag-swipe-reveal" aria-hidden="true">Remove</div>
                                    <div class="lib-src-card ${this.sourceId === srv.id ? 'active' : ''}"
                                        ${swipeRow(this._swipe, srv.id)}
                                        @click=${() => !this._swipe.swiping && this._selectUpnpServer(srv)}>
                                        <div class="lib-src-card-hd">
                                            <div class="lib-src-ic">${srv.manufacturer?.toLowerCase().includes('minimserver')
                                                ? html`<img src="./pics/minimserver.webp" alt="MinimServer" width="28" height="28" style="object-fit:contain">`
                                                : 'UP'
                                            }</div>
                                            <div class="lib-src-col">
                                                <span class="lib-src-name">${srv.friendly_name}</span>
                                                <span class="lib-src-desc">${srv.location ? new URL(srv.location).host : ''}</span>
                                            </div>
                                            <ag-status-indicator state="up"
                                                label=${playing.has(srv.id) ? 'Active' : 'Online'}
                                            ></ag-status-indicator>
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
                <div class="lib-settings-section">
                    <div class="lib-hqp-header">
                        <span class="lib-src-lbl">Streaming Services</span>
                    </div>
                    <ag-qobuz-connection></ag-qobuz-connection>
                    <ag-tidal-connection></ag-tidal-connection>
                    <ag-highresaudio-connection></ag-highresaudio-connection>
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

                <div class="lib-hqp-section">
                    <div class="lib-hqp-header">
                        <span class="lib-src-lbl">Audio Output</span>
                        <button class="lib-upnp-rescan" @click=${() => this.querySelector('ag-upnp-renderer-card')?._load()} title="Reload output list">
                            Reload
                        </button>
                    </div>
                    <ag-upnp-renderer-card></ag-upnp-renderer-card>
                </div>

                <div style="height:12px"></div>
            </div>
        `;
    }
}

customElements.define('ag-library-sources', AgLibrarySources);
