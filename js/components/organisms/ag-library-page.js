/**
 * @module AgLibraryPage
 * @description Library page — rendered as a standard tab in the main navigation.
 * Manages inner view routing: browse → search → queue → library (sources) →
 * outputs → roon-browser.
 * Now Playing is handled app-level by ag-now-playing-fullscreen (np-expand event).
 *
 * Active source and zone are restored from /player/state/snapshot on connect.
 *
 * @element ag-library-page
 *
 * @dependency ag-library-browse
 * @dependency ag-library-search
 * @dependency ag-library-queue
 * @dependency ag-library-sources
 * @dependency ag-library-outputs
 * @dependency ag-library-roon-browser
 * @dependency ag-library-upnp-browser
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { getSnapshot, getRoonZones, subscribePlayerState } from '../../library-store.js';
import { iconBack, iconQueue, iconRefresh, iconOutput, iconInfo } from '../../ag-icons.js';
import { SOURCE_META, normalizeSearchSources } from '../library-constants.js';

/* ─── shared CSS injected once into <head> ─── */
const LIB_STYLES = `
/* Audiogravity Library — shared styles, all classes prefixed lib- */

.lib-page {
    display: block;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-family);
    -webkit-font-smoothing: antialiased;
}

/* View containers */
.lib-view { display: none; }
.lib-view.active { display: block; }

/* Topbar */
.lib-topbar {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 4px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
    min-height: 44px;
}
.lib-nav { display: flex; align-items: center; flex: 1; min-width: 0; }

@media (max-width: 640px) {
    .lib-nav .lib-tab span { display: none; }
    .lib-nav .lib-tab { padding: 6px 14px; }
}
.lib-topbar-right {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--text-secondary);
    flex-shrink: 0;
}
.lib-topbar-right svg {
    width: 22px; height: 22px;
    stroke: currentColor; fill: none;
    stroke-width: 1.7;
    stroke-linecap: round; stroke-linejoin: round;
    cursor: pointer;
}
.lib-live {
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-success);
    display: flex;
    align-items: center;
    gap: 8px;
}
.lib-live::before {
    content: "";
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--color-success);
    box-shadow: 0 0 8px var(--color-success);
    animation: lib-pulse 2s infinite;
}
@keyframes lib-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
body.no-animations .lib-live::before { box-shadow: none; animation: none; }

/* Body / scroll */
.lib-body { display: block; }
.lib-scroll { display: block; }

/* ag-lib-tabbar inner-nav tabs */
.lib-tab {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-family: var(--font-family);
    font-size: var(--font-size-xxs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
    background: transparent;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
}
.lib-tab.on { color: var(--text-primary); }
.lib-tab svg {
    width: 22px; height: 22px;
    stroke: currentColor; fill: none;
    stroke-width: 1.7;
    stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
}
.lib-tab.on svg { stroke-width: 2.2; }

/* Per-organism CSS now lives in frontend/css/components/library-*.css :
   - library-search.css, library-queue.css, library-sources.css,
     library-outputs.css, library-album-card.css, library-browser.css */

/* Source-changed banner */
.lib-source-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: color-mix(in srgb, var(--color-warning) 10%, var(--bg-secondary));
    border-bottom: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
}
.lib-source-banner-msg { flex: 1; min-width: 0; }
.lib-source-banner-name {
    font-weight: 600;
    color: var(--color-warning);
}
.lib-source-banner-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* States */
.lib-loading { display: flex; align-items: center; justify-content: center; padding: 40px 20px; font-family: var(--font-family); font-size: var(--font-size-xxs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.lib-empty { padding: 40px 20px; text-align: center; font-family: var(--font-family); font-size: var(--font-size-xxs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); }

/* Desktop: normal flow inside main-content — main-content (overflow: hidden auto) handles scroll.
   main-content inset already starts below topbar+tabs, so top:0 sticky is correct. */
#library.tab-content.active {
    padding: 0;
}

/* Mobile: main-content starts at top:0 (covers full viewport), so we need padding-top
   to push library content below the AG topbar, same pattern as .content-grid. */
@media (max-width: 768px) {
    #library.tab-content.active {
        padding-top: calc(var(--topbar-height) + env(safe-area-inset-top, 0px));
        padding-bottom: calc(var(--footer-height, 0px) + var(--now-playing-height, 0px));
    }
    #library.tab-content.active .lib-topbar {
        top: calc(var(--topbar-height) + env(safe-area-inset-top, 0px));
    }
}

ag-library-page {
    display: block;
}
`;

/** Maps internal view keys to the tab key shown active in ag-lib-tabbar. */
const VIEW_TAB = {
    browse: 'browse', search: 'search', queue: 'queue',
    library: 'library', outputs: 'library',
    radio: 'radio',
    'roon-browser': 'browse', 'upnp-browser': 'browse',
};


export class AgLibraryPage extends LitElement {
    static _stylesInjected = false;

    static properties = {
        _view:          { state: true },
        _sourceId:      { state: true },
        _zoneId:        { state: true },
        _zoneDisplayName: { state: true },
        _upnpLocation:    { state: true },
        _upnpName:        { state: true },
        _sources:         { state: true },
        _upnpServers:     { state: true },
        /** Non-null when an external source change is detected — drives the banner. */
        _pendingSource:   { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._view            = 'browse';
        this._sourceId        = '';
        this._zoneId          = '';
        this._zoneDisplayName = '';
        this._upnpLocation    = '';
        this._upnpName        = '';
        this._sources         = [];
        this._upnpServers     = [];
        this._pendingSource   = null;
        this._unsubscribeState = null;
        this._boundLibGoto    = (e) => this._onLibGoto(e);
    }

    connectedCallback() {
        super.connectedCallback();
        this._injectStyles();
        this._syncActiveSource();
        window.addEventListener('lib-goto', this._boundLibGoto);
        // BACKLOG item resolved: subscribe permanently so the library stays in sync
        // even when the fullscreen player is closed.
        this._unsubscribeState = subscribePlayerState(s => this._onPlayerState(s));
        // Known UPnP/DLNA media servers (e.g. MinimServer) aren't part of the
        // playback pipeline sources, so fetch them so they appear in search too.
        this._loadUpnpServers();
    }

    /** Load persisted UPnP servers and merge them into the searchable sources. */
    async _loadUpnpServers() {
        try {
            const servers = await apiGet('/library/upnp-known-servers');
            if (Array.isArray(servers)) {
                this._upnpServers = servers;
                this._sources = this._normalizeSources(this._rawSources ?? []);
            }
        } catch {
            // Non-blocking: search just won't list UPnP servers.
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('lib-goto', this._boundLibGoto);
        if (this._unsubscribeState) {
            this._unsubscribeState();
            this._unsubscribeState = null;
        }
    }

    _injectStyles() {
        if (AgLibraryPage._stylesInjected) return;
        AgLibraryPage._stylesInjected = true;
        const s = document.createElement('style');
        s.id = 'ag-lib-styles';
        s.textContent = LIB_STYLES;
        document.head.appendChild(s);
    }

    async _syncActiveSource() {
        try {
            const state = await getSnapshot();
            if (state?.sources) {
                this._rawSources = state.sources;
                this._sources = this._normalizeSources(state.sources);
            }
            if (state?.source_id) {
                // HQPlayer is a DSP output, not a browseable library source.
                // Don't switch the library to it — keep the current source.
                if (state.source_id !== 'src_hqplayer') {
                    if (state.zone_id) this._zoneId = state.zone_id;
                    this._zoneDisplayName = state.zone_display_name || '';
                    this._sourceId = state.source_id;
                    // UPnP control URL is not persisted — redirect to source picker
                    // so the user can re-select the server rather than seeing a blank browse.
                    if (this._isUpnp(state.source_id)) this._view = 'library';
                }
            }
        } catch (_) {}
    }

    /**
     * Handle live PlayerState SSE events.
     * Keeps the source list fresh and surfaces a banner when the active source
     * changes externally (e.g. Roon starts playing while the user browses MPD).
     * mpris sources (AirPlay, Spotify) are ignored — they have no library API.
     * @param {object} state - PlayerState from the SSE stream.
     */
    _onPlayerState(state) {
        // Refresh source list from live data.
        if (state.sources?.length) {
            this._rawSources = state.sources;
            this._sources = this._normalizeSources(state.sources);
        }

        // Banner logic — skip until the initial snapshot has set _sourceId.
        if (!this._sourceId || !state.source_id) return;
        if (state.source_id === this._sourceId) {
            // Source came back to the current one — clear any pending banner.
            this._pendingSource = null;
            return;
        }
        // Skip mpris sources (no library to browse).
        const info = state.sources?.find(s => s.source_id === state.source_id);
        if (info?.protocol === 'mpris') return;
        // Don't re-raise the banner if it's already showing for this source.
        if (this._pendingSource?.id === state.source_id) return;
        const name = SOURCE_META[state.source_id]?.label ?? info?.name ?? state.source_id.replace('src_', '');
        this._pendingSource = { id: state.source_id, name };
    }

    /**
     * Map raw sources from /player/state/snapshot to normalized source objects.
     * Deduplicates by group (e.g. src_roon + src_mono-sgen → one "Roon" badge).
     * @param {Array} raw
     * @returns {Array<{id:string, label:string, group:string, controlUrl:string}>}
     */
    _normalizeSources(raw) {
        return normalizeSearchSources(raw, this._upnpServers);
    }

    _navigate(view) {
        if (view === 'browse' && this._isUpnp(this._sourceId)) view = 'upnp-browser';
        this._view = view;
        if (view === 'browse') this._refreshBrowse();
    }

    _refreshBrowse() {
        this.updateComplete.then(() => {
            this.querySelector('ag-library-browse')?._load();
        });
    }

    async _onLibGoto(e) {
        this._pendingSource = null;
        const { view, source_id } = e.detail ?? {};
        if (!view) return;
        document.querySelector('ag-tabs')?.selectTab('library');
        // Honour an explicit source_id passed by the caller (e.g. the fullscreen
        // player switching to the OUTPUTS view for the source it's currently
        // showing, which may differ from the library's active source). For Roon
        // we need a zone_id too, otherwise ag-library-browse rejects the load —
        // resolve it from the cached Roon zones. We don't POST /player/source
        // here: this is a navigation, not an active-source switch.
        if (source_id && source_id !== this._sourceId) {
            if (this._isRoon(source_id)) {
                try {
                    const zones = await getRoonZones();
                    if (Array.isArray(zones) && zones.length > 0) {
                        this._zoneId          = zones[0].zone_id;
                        this._zoneDisplayName = zones[0].display_name || '';
                    } else {
                        this._zoneId          = '';
                        this._zoneDisplayName = '';
                    }
                } catch (_) {
                    this._zoneId          = '';
                    this._zoneDisplayName = '';
                }
            }
            this._sourceId = source_id;
        }
        this._navigate(view);
    }

    _onTabChange(e) {
        const map = { browse: 'browse', search: 'search', queue: 'queue', library: 'library', radio: 'radio' };
        let view = map[e.detail.tab] ?? 'browse';
        if (view === 'browse' && this._isUpnp(this._sourceId)) view = 'upnp-browser';
        this._view = view;
    }

    _isRoon(sourceId) {
        return sourceId === 'src_mono-sgen' || sourceId === 'src_roon';
    }

    _isUpnp(sourceId) {
        return sourceId.startsWith('upnp:');
    }

    _onSourceChange(e) {
        this._pendingSource = null;
        const { sourceId, zoneId = '', zoneDisplayName = '', location = '', serverName = '' } = e.detail;
        if (this._isRoon(sourceId) && !zoneId) {
            this._fetchRoonZoneAndSwitch(sourceId);
        } else if (this._isUpnp(sourceId)) {
            this._upnpLocation   = location;
            this._upnpName       = serverName;
            this._sourceId       = sourceId;
            this._zoneId         = '';
            this._zoneDisplayName = '';
            this._view           = this._view === 'search' ? 'search' : 'upnp-browser';
            if (!this._sources.some(s => s.id === sourceId)) {
                this._sources = [...this._sources, {
                    id: sourceId, label: serverName || 'UPnP',
                    group: sourceId, location,
                }];
            }
        } else {
            this._sourceId       = sourceId;
            this._zoneId         = zoneId;
            this._zoneDisplayName = zoneDisplayName;
            this._view           = 'browse';
            apiPost('/player/source', { source_id: sourceId }).catch(err =>
                console.error('[library-page] set source failed:', err)
            );
        }
    }

    async _fetchRoonZoneAndSwitch(sourceId) {
        try {
            const zones  = await getRoonZones();
            if (Array.isArray(zones) && zones.length > 0) {
                this._zoneId          = zones[0].zone_id;
                this._zoneDisplayName = zones[0].display_name || '';
            } else {
                this._zoneId          = '';
                this._zoneDisplayName = '';
            }
        } catch (_) {
            this._zoneId = '';
            this._zoneDisplayName = '';
        }
        this._sourceId = sourceId;
        this._view     = 'browse';
        apiPost('/player/source', { source_id: sourceId }).catch(err =>
            console.error('[library-page] set source failed:', err)
        );
    }


    render() {
        const { _view, _sourceId, _zoneId, _zoneDisplayName } = this;

        const isBrowse   = _view === 'browse';
        const isSearch   = _view === 'search';
        const isQueue    = _view === 'queue';
        const isLibrary  = _view === 'library';
        const isOutputs  = _view === 'outputs';
        const isRoonBrow = _view === 'roon-browser';
        const isUpnpBrow = _view === 'upnp-browser';
        const isRadio    = _view === 'radio';

        const srcLabel = this._isUpnp(_sourceId)
            ? (this._upnpName || 'UPnP')
            : (SOURCE_META[_sourceId]?.label ?? _sourceId.replace('src_', ''));

        return html`
            <div class="lib-page">

                ${this._pendingSource ? html`
                    <div class="lib-source-banner" role="status">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                            ${iconInfo}
                        </svg>
                        <span class="lib-source-banner-msg">
                            <span class="lib-source-banner-name">${this._pendingSource.name}</span>
                            is now playing
                        </span>
                        <div class="lib-source-banner-actions">
                            <button class="action-btn compact primary"
                                @click=${() => {
                                    const id = this._pendingSource.id;
                                    this._pendingSource = null;
                                    if (this._isRoon(id)) {
                                        this._fetchRoonZoneAndSwitch(id);
                                    } else {
                                        this._sourceId = id;
                                        this._view     = 'browse';
                                        apiPost('/player/source', { source_id: id }).catch(err =>
                                            console.error('[library-page] banner switch failed:', err)
                                        );
                                    }
                                }}>
                                Switch
                            </button>
                            <button class="action-btn compact"
                                @click=${() => { this._pendingSource = null; }}>
                                Dismiss
                            </button>
                        </div>
                    </div>
                ` : nothing}

                <div class="lib-view ${isBrowse ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            ${_sourceId ? html`<span class="lib-live">${srcLabel}</span>` : nothing}
                            ${this._isRoon(_sourceId) ? html`
                                <svg viewBox="0 0 24 24" @click=${() => this._navigate('roon-browser')} title="Browse Roon"
                                     stroke-linecap="round">
                                    ${iconQueue}
                                </svg>
                            ` : html`
                                <svg viewBox="0 0 24 24" @click=${() => this._refreshBrowse()} title="Refresh library"
                                     style="cursor:pointer">
                                    ${iconRefresh}
                                </svg>
                            `}
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-browse
                                source-id=${this._isUpnp(_sourceId) ? '' : _sourceId}
                                zone-id=${_zoneId}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                            ></ag-library-browse>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isSearch ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-search
                                source-id=${_sourceId}
                                zone-id=${_zoneId}
                                .sources=${this._sources}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                                @lib-source-change=${this._onSourceChange}
                            ></ag-library-search>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isQueue ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-queue
                                source-id=${this._isUpnp(_sourceId) ? (this._sources.find(s => s.group === 'mpd')?.id || '') : _sourceId}
                                zone-id=${_zoneId}
                                zone-display-name=${_zoneDisplayName}
                                ?visible=${isQueue}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                            ></ag-library-queue>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isLibrary ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            <svg viewBox="0 0 24 24" @click=${() => this._navigate('outputs')} title="Outputs">
                                ${iconOutput}
                            </svg>
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-sources
                                source-id=${_sourceId}
                                zone-id=${_zoneId}
                                zone-display-name=${_zoneDisplayName}
                                @lib-source-change=${this._onSourceChange}
                            ></ag-library-sources>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isOutputs ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            <svg viewBox="0 0 24 24" @click=${() => this._navigate('library')}>
                                ${iconBack}
                            </svg>
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-outputs
                                source-id=${_sourceId}
                                @lib-output-change=${() => this._navigate('library')}
                            ></ag-library-outputs>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isRoonBrow ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            <span class="lib-live">${srcLabel}</span>
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-roon-browser
                                source-id=${_sourceId}
                                zone-id=${_zoneId}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                                @lib-roon-back=${() => this._navigate('browse')}
                            ></ag-library-roon-browser>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isUpnpBrow ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            <span class="lib-live">${this._upnpName || 'UPnP'}</span>
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-upnp-browser
                                location=${this._upnpLocation}
                                server-name=${this._upnpName}
                                source-id=${_sourceId}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                                @lib-upnp-back=${() => this._navigate('library')}
                            ></ag-library-upnp-browser>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isRadio ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-radio></ag-library-radio>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }
}

customElements.define('ag-library-page', AgLibraryPage);
