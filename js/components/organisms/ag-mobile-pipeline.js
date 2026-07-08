import { LitElement, html } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { iconSmartphone, iconServer, iconCpu, iconAudioWaveform, iconAudioLines, iconVolume, iconMusicNote as iconFileMusic, iconDatabase, iconConnection } from '../../ag-icons.js';

/**
 * Mobile-optimized read-only view of the active audio pipeline.
 * Shows one "now playing" card per active stream + the full signal chain below.
 * Data is fetched from /api/pipeline on the same polling interval as the desktop view.
 */
export class AgMobilePipeline extends LitElement {
    static properties = {
        _pipeline:  { state: true },
        _loading:   { state: true },
        _steering:  { state: true },
        _switching: { state: true },
    };

    // Light DOM: inject scoped styles once into <head>
    static _stylesInjected = false;
    static _injectStyles() {
        if (AgMobilePipeline._stylesInjected) return;
        AgMobilePipeline._stylesInjected = true;
        const style = document.createElement('style');
        style.textContent = `
ag-mobile-pipeline { display: block; background: var(--bg-primary, #f8f9fa); min-height: 100%; }
ag-mobile-pipeline .amp-section-label { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-tertiary, #64748b); margin-bottom: 10px; padding-left: 2px; }
ag-mobile-pipeline .amp-streams { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
ag-mobile-pipeline .amp-np-card { background: var(--bg-secondary, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 1px; padding: 16px; position: relative; overflow: hidden; }
ag-mobile-pipeline .amp-np-card::before { content: ''; position: absolute; inset: 0; pointer-events: none; }
ag-mobile-pipeline .amp-np-card[data-color="roon"]::before    { background: radial-gradient(ellipse at top left, rgba(14,165,233,0.10) 0%, transparent 60%); }
ag-mobile-pipeline .amp-np-card[data-color="airplay"]::before { background: radial-gradient(ellipse at top left, rgba(249,115,22,0.10) 0%, transparent 60%); }
ag-mobile-pipeline .amp-np-card[data-color="mpd"]::before     { background: radial-gradient(ellipse at top left, rgba(99,102,241,0.10) 0%, transparent 60%); }
ag-mobile-pipeline .amp-np-card[data-color="default"]::before { background: radial-gradient(ellipse at top left, rgba(16,185,129,0.10) 0%, transparent 60%); }
ag-mobile-pipeline .amp-source-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 3px 10px; font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 12px; }
ag-mobile-pipeline .amp-source-badge[data-color="roon"]    { background: rgba(14,165,233,0.15); border: 1px solid rgba(14,165,233,0.3); color: #0ea5e9; }
ag-mobile-pipeline .amp-source-badge[data-color="airplay"] { background: rgba(249,115,22,0.15);  border: 1px solid rgba(249,115,22,0.3);  color: #f97316; }
ag-mobile-pipeline .amp-source-badge[data-color="mpd"]     { background: rgba(99,102,241,0.15);  border: 1px solid rgba(99,102,241,0.3);  color: #818cf8; }
ag-mobile-pipeline .amp-source-badge[data-color="default"] { background: rgba(16,185,129,0.15);  border: 1px solid rgba(16,185,129,0.3);  color: #10b981; }
ag-mobile-pipeline .amp-source-dot { width: 6px; height: 6px; border-radius: 50%; animation: amp-pulse 2s infinite; }
ag-mobile-pipeline .amp-source-dot[data-color="roon"]    { background: #0ea5e9; }
ag-mobile-pipeline .amp-source-dot[data-color="airplay"] { background: #f97316; }
ag-mobile-pipeline .amp-source-dot[data-color="mpd"]     { background: #818cf8; }
ag-mobile-pipeline .amp-source-dot[data-color="default"] { background: #10b981; }
@keyframes amp-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
ag-mobile-pipeline .amp-np-title  { font-size: 17px; font-weight: 700; color: var(--text-primary, #1e293b); line-height: 1.3; margin-bottom: 3px; }
ag-mobile-pipeline .amp-np-artist { font-size: 13px; color: var(--text-secondary, #64748b); margin-bottom: 2px; }
ag-mobile-pipeline .amp-np-album  { font-size: 11px; color: var(--text-tertiary, #94a3b8); margin-bottom: 12px; }
ag-mobile-pipeline .amp-np-idle   { font-size: 13px; color: var(--text-tertiary, #94a3b8); margin-bottom: 12px; font-style: italic; }
ag-mobile-pipeline .amp-format-bar { display: flex; gap: 6px; flex-wrap: wrap; }
ag-mobile-pipeline .amp-fmt-chip { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 5px; letter-spacing: 0.4px; background: rgba(16,185,129,0.12); color: #10b981; }
ag-mobile-pipeline .amp-fmt-chip.dim { background: rgba(99,102,241,0.1); color: #818cf8; }
ag-mobile-pipeline .amp-chain-card { background: var(--bg-secondary, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 1px; padding: 16px; margin-bottom: 10px; }
ag-mobile-pipeline .amp-chain { display: flex; flex-direction: column; }
ag-mobile-pipeline .amp-device-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
ag-mobile-pipeline .amp-device-row.inactive { opacity: 0.38; }
ag-mobile-pipeline .amp-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
ag-mobile-pipeline .amp-status-dot.active   { background: #10b981; box-shadow: 0 0 5px #10b981; }
ag-mobile-pipeline .amp-status-dot.inactive { background: var(--border-color, #e2e8f0); }
ag-mobile-pipeline .amp-device-icon { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
ag-mobile-pipeline .amp-device-icon span { font-size: 14px; }
ag-mobile-pipeline .amp-device-icon.controller { background: rgba(245,158,11,0.15); color: #f59e0b; }
ag-mobile-pipeline .amp-device-icon.server     { background: rgba(14,165,233,0.15);  color: #0ea5e9; }
ag-mobile-pipeline .amp-device-icon.streamer   { background: rgba(99,102,241,0.15);  color: #818cf8; }
ag-mobile-pipeline .amp-device-icon.converter  { background: rgba(139,92,246,0.15);  color: #a78bfa; }
ag-mobile-pipeline .amp-device-icon.amplifier  { background: rgba(236,72,153,0.15);  color: #f472b6; }
ag-mobile-pipeline .amp-device-icon.output     { background: rgba(16,185,129,0.15);  color: #10b981; }
ag-mobile-pipeline .amp-device-icon.source     { background: rgba(14,165,233,0.15);  color: #0ea5e9; }
ag-mobile-pipeline .amp-device-info { flex: 1; min-width: 0; }
ag-mobile-pipeline .amp-device-name { font-size: 13px; font-weight: 700; color: var(--text-primary, #1e293b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
ag-mobile-pipeline .amp-device-sub  { font-size: 10px; color: var(--text-tertiary, #94a3b8); margin-top: 1px; }
ag-mobile-pipeline .amp-svc-badges  { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; flex-shrink: 0; }
ag-mobile-pipeline .amp-svc-badge   { display: inline-flex; align-items: center; gap: 4px; border-radius: 5px; padding: 2px 7px; font-size: 9px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
ag-mobile-pipeline .amp-svc-badge .dot { width: 5px; height: 5px; border-radius: 50%; }
ag-mobile-pipeline .amp-svc-badge[data-color="roon"]    { background: rgba(14,165,233,0.12); color: #0ea5e9; }
ag-mobile-pipeline .amp-svc-badge[data-color="roon"] .dot { background: #0ea5e9; }
ag-mobile-pipeline .amp-svc-badge[data-color="airplay"] { background: rgba(249,115,22,0.12); color: #f97316; }
ag-mobile-pipeline .amp-svc-badge[data-color="airplay"] .dot { background: #f97316; }
ag-mobile-pipeline .amp-svc-badge[data-color="mpd"]     { background: rgba(99,102,241,0.12); color: #818cf8; }
ag-mobile-pipeline .amp-svc-badge[data-color="mpd"] .dot { background: #818cf8; }
ag-mobile-pipeline .amp-svc-badge[data-color="default"] { background: rgba(16,185,129,0.12); color: #10b981; }
ag-mobile-pipeline .amp-svc-badge[data-color="default"] .dot { background: #10b981; }
ag-mobile-pipeline .amp-connector-row   { display: flex; align-items: center; padding: 0 0 0 3px; height: 22px; gap: 0; }
ag-mobile-pipeline .amp-connector-line  { width: 2px; height: 100%; margin-left: 3px; flex-shrink: 0; opacity: 0.35; }
ag-mobile-pipeline .amp-connector-line.active   { background: #10b981; }
ag-mobile-pipeline .amp-connector-line.inactive { background: var(--border-color, #e2e8f0); opacity: 1; }
ag-mobile-pipeline .amp-connector-label { margin-left: 10px; font-size: 9px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-tertiary, #94a3b8); }
ag-mobile-pipeline .amp-loading  { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-tertiary, #94a3b8); font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
ag-mobile-pipeline .amp-no-stream { text-align: center; padding: 40px 20px; color: var(--text-tertiary, #94a3b8); font-size: 13px; }
ag-mobile-pipeline .amp-output-switcher { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
ag-mobile-pipeline .amp-output-pill { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 1px; border: 1px solid var(--border-color, #e2e8f0); background: var(--bg-secondary, #ffffff); font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-tertiary, #94a3b8); cursor: pointer; transition: all 0.15s ease; user-select: none; -webkit-tap-highlight-color: transparent; }
ag-mobile-pipeline .amp-output-pill:active { opacity: 0.7; }
ag-mobile-pipeline .amp-output-pill.active { border-color: rgba(16,185,129,0.5); background: rgba(16,185,129,0.1); color: #10b981; }
ag-mobile-pipeline .amp-output-pill.switching { opacity: 0.5; pointer-events: none; }
ag-mobile-pipeline .amp-output-pill .amp-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-color, #e2e8f0); flex-shrink: 0; }
ag-mobile-pipeline .amp-output-pill.active .amp-pill-dot { background: #10b981; box-shadow: 0 0 5px #10b981; }
        `;
        document.head.appendChild(style);
    }

    createRenderRoot() {
        return this; // Light DOM — uses global CSS
    }

    constructor() {
        super();
        this._pipeline = null;
        this._loading = true;
        this._steering = null;
        this._switching = false;
        this._pollInterval = null;
    }

    connectedCallback() {
        super.connectedCallback();
        AgMobilePipeline._injectStyles();
        this._fetch();
        this._fetchSteering();
        this._pollInterval = setInterval(() => { this._fetch(); this._fetchSteering(); }, 5000);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearInterval(this._pollInterval);
    }

    async _fetch() {
        try {
            this._pipeline = await apiGet('/audio_pipeline/current');
        } catch (e) {
            // silently ignore
        } finally {
            this._loading = false;
        }
    }

    async _fetchSteering() {
        try {
            this._steering = await apiGet('/steering/status');
        } catch (e) {
            // steering not available — hide switcher silently
        }
    }

    // Map a stream's svcKey to its steering service id(s)
    _steerSvcForStream(stream) {
        const svcKey = stream.id.replace(/^src_/, '').toLowerCase();
        const steerability = this._steering?.steerability || {};
        // Direct match first
        if (steerability[svcKey] !== undefined) return steerability[svcKey] ? svcKey : null;
        // Aliases
        const aliases = {
            'shairport-sync': 'airplay',
            'shairport_sync': 'airplay',
            'roonbridge':     'roonbridge',
            'mono-sgen':      'roonbridge',  // Roon Bridge ALSA process name
        };
        const mapped = aliases[svcKey];
        if (mapped && steerability[mapped]) return mapped;
        // Fallback: color key
        const colorMap = { roon: 'roonbridge', airplay: 'airplay', mpd: 'mpd' };
        const byCColor = colorMap[stream.color];
        if (byCColor && steerability[byCColor]) return byCColor;
        return null;
    }

    async _switchStreamOutput(stream, outputId) {
        const svc = this._steerSvcForStream(stream);
        if (!svc || this._switching) return;
        this._switching = true;
        try {
            await apiPost('/steering/switch-output', { service: svc, output: outputId });
            await this._fetchSteering();
        } finally {
            this._switching = false;
        }
    }

    _renderStreamOutputPills(stream) {
        if (!this._steering?.available_outputs?.length) return '';
        const svc = this._steerSvcForStream(stream);
        if (!svc) return ''; // stream not steerable
        const outputs = this._steering.available_outputs;
        const currentDevice = this._steering.current_devices?.[svc];
        return html`
            <div class="amp-output-switcher">
                ${outputs.map(o => {
                    const isActive = currentDevice
                        ? o.system_device_id === currentDevice
                        : o.active;
                    return html`
                        <div class="amp-output-pill ${isActive ? 'active' : ''} ${this._switching ? 'switching' : ''}"
                             @click=${() => this._switchStreamOutput(stream, o.id)}>
                            <div class="amp-pill-dot"></div>
                            ${o.label}
                        </div>
                    `;
                })}
            </div>
        `;
    }

    // Map service IDs / protocols to a color key
    _colorKey(svcId) {
        if (!svcId) return 'default';
        const s = svcId.toLowerCase();
        if (s.includes('roon')) return 'roon';
        if (s.includes('airplay') || s.includes('shairport') || s.includes('apple') || s.includes('tidal_app') || s.includes('qobuz_app')) return 'airplay';
        if (s.includes('mpd') || s.includes('upnp') || s.includes('jplay')) return 'mpd';
        return 'default';
    }

    _renderDeviceIcon(type) {
        const DEVICE_ICON_MAP = {
            controller: iconSmartphone,
            server:     iconServer,
            streamer:   iconCpu,
            converter:  iconAudioWaveform,
            amplifier:  iconAudioLines,
            output:     iconVolume,
            source:     iconFileMusic,
            storage:    iconDatabase,
        };
        const svgContent = DEVICE_ICON_MAP[type] || iconConnection;
        return html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
    }

    // Extract active streams: one card per active service node (src_*).
    // now_playing lives in metadata.service_now_playing on the streamer device node,
    // keyed by the internal service id (e.g. "shairport-sync", "mpd").
    _getActiveStreams() {
        if (!this._pipeline) return [];
        const nodes = this._pipeline.nodes || [];

        // Collect all service_now_playing maps from device nodes
        const serviceNowPlaying = {};
        for (const n of nodes) {
            if (n.type === 'device' && n.metadata?.service_now_playing) {
                Object.assign(serviceNowPlaying, n.metadata.service_now_playing);
            }
        }

        // Server-level now_playing (Roon): associate to Roon Bridge on the streamer.
        // The server has "roon_server" active, which streams to "roonbridge" on the streamer.
        const serverNode = nodes.find(n => n.type === 'device' && n.device_type === 'server');
        const serverNp = serverNode?.metadata?.now_playing || null;
        if (serverNp) {
            serviceNowPlaying['roonbridge'] = serverNp;
        }

        const activeServices = nodes.filter(n => n.type === 'service' && n.status === 'active');

        return activeServices.map(svc => {
            // Service id is "src_shairport-sync" → internal key is "shairport-sync"
            // or "src_mono-sgen" for Roon Bridge — match via service name on the streamer
            const svcKey = svc.id.replace(/^src_/, '');
            // Also try to match by service name against internal_services of streamer
            const streamerNode = nodes.find(n => n.type === 'device' && n.device_type === 'streamer');
            const matchedSvc = (streamerNode?.internal_services || []).find(
                s => svc.name && s.label === svc.name
            );
            const np = serviceNowPlaying[svcKey]
                || (matchedSvc ? serviceNowPlaying[matchedSvc.id] : null)
                || null;

            let format = null;
            if (np?.format && np?.sample_bits && np?.sample_rate) {
                const khz = (np.sample_rate / 1000).toFixed(np.sample_rate % 1000 === 0 ? 0 : 1);
                format = `${np.format} | ${np.sample_bits}bit | ${khz}kHz`;
            } else if (np?.format) {
                // AirPlay 1 (shairport-sync) doesn't report sample_rate/bits —
                // ALAC over AirPlay 1 is always 16bit/44.1kHz
                if (np.format === 'ALAC') {
                    format = `${np.format} | 16bit | 44.1kHz`;
                } else {
                    format = np.format;
                }
            }

            return {
                id: svc.id,
                label: svc.name || svcKey,
                color: this._colorKey(svcKey),
                title: np?.title,
                artist: np?.artist,
                album: np?.album,
                format,
                state: np?.state,
                volume: np?.volume != null ? np.volume : null,
            };
        });
    }

    // Build the signal chain for a specific stream.
    // Each stream gets its own chain: source → streamer → DAC → amp → speakers.
    // On the streamer, only the badge for this stream's service is shown.
    _getChainForStream(stream) {
        if (!this._pipeline) return [];
        const nodes = this._pipeline.nodes || [];
        const links = this._pipeline.links || [];

        // svcKey: "roonbridge", "shairport-sync", "mpd", etc.
        const svcKey = stream.id.replace(/^src_/, '');

        // Map svcKey → internal service id on the streamer
        const streamerNode = nodes.find(n => n.type === 'device' && n.device_type === 'streamer');
        const matchedInternalSvc = (streamerNode?.internal_services || []).find(
            s => s.id === svcKey || s.label === stream.label
        );
        const internalSvcId = matchedInternalSvc?.id || svcKey;

        // Device type display order — exclude controller for non-control streams
        const ORDER = ['server', 'streamer', 'converter', 'amplifier', 'output'];

        // Include server only for Roon stream
        const isRoon = stream.color === 'roon';

        const devices = nodes
            .filter(n => {
                if (n.type !== 'device' || n.status !== 'active') return false;
                if (n.device_type === 'server') return isRoon;
                if (n.device_type === 'controller') return false;
                if (n.device_type === 'storage') return false;
                if (n.device_type === 'source') return false;
                if (n.device_type === 'endpoint') return false;
                return ORDER.includes(n.device_type);
            })
            .sort((a, b) => ORDER.indexOf(a.device_type) - ORDER.indexOf(b.device_type));

        const result = [];
        for (let i = 0; i < devices.length; i++) {
            const dev = devices[i];

            // On the streamer: show only the badge for this stream's service
            let streamSvcs = [];
            if (dev.device_type === 'streamer') {
                const svc = (dev.internal_services || []).find(s => s.id === internalSvcId);
                if (svc) streamSvcs = [svc];
            }

            // Find link to next device
            let connectorLabel = null;
            let connectorActive = false;
            if (i < devices.length - 1) {
                const nextDev = devices[i + 1];
                const link = links.find(l =>
                    (l.source_id === dev.id && l.target_id === nextDev.id) ||
                    (l.target_id === dev.id && l.source_id === nextDev.id)
                );
                if (link) {
                    connectorLabel = link.connector
                        ? link.connector.toUpperCase()
                        : (link.link_type || '').toUpperCase();
                    connectorActive = link.active;
                }
            }

            result.push({ dev, streamSvcs, connectorLabel, connectorActive });
        }

        return result;
    }

    _renderNowPlayingCards() {
        const streams = this._getActiveStreams();
        if (!streams.length) {
            return html`<div class="amp-no-stream">No active audio stream</div>`;
        }
        return html`
            <div class="amp-section-label">Now playing</div>
            <div class="amp-streams">
                ${streams.map(s => html`
                    <div class="amp-np-card" data-color="${s.color}">
                        <div class="amp-source-badge" data-color="${s.color}">
                            <div class="amp-source-dot" data-color="${s.color}"></div>
                            ${s.label}
                        </div>
                        ${s.title ? html`
                            <div class="amp-np-title">${s.title}</div>
                            ${s.artist ? html`<div class="amp-np-artist">${s.artist}</div>` : ''}
                            ${s.album  ? html`<div class="amp-np-album">${s.album}</div>`  : ''}
                        ` : html`
                            <div class="amp-np-idle">Stream active</div>
                        `}
                        ${s.format ? html`
                            <div class="amp-format-bar">
                                ${s.state === 'playing' ? html`<span class="amp-fmt-chip">▶ PLAYING</span>` :
                                  s.state === 'paused'  ? html`<span class="amp-fmt-chip dim">⏸ PAUSED</span>` : ''}
                                ${s.format.split('|').map(p => html`<span class="amp-fmt-chip dim">${p.trim()}</span>`)}
                                ${s.volume != null ? html`<span class="amp-fmt-chip dim">VOL ${s.volume}%</span>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `)}
            </div>
        `;
    }

    _renderChain() {
        const streams = this._getActiveStreams();
        if (!streams.length) return '';

        return html`
            ${streams.map(stream => {
                const chain = this._getChainForStream(stream);
                if (!chain.length) return '';
                return html`
                    <div class="amp-section-label" style="color: var(--color-${stream.color === 'roon' ? 'info' : stream.color === 'airplay' ? 'warning' : 'success'}, #334155);">
                        Signal chain · ${stream.label}
                    </div>
                    <div class="amp-chain-card">
                        ${this._renderStreamOutputPills(stream)}
                        <div class="amp-chain">
                            ${chain.map(({ dev, streamSvcs, connectorLabel, connectorActive }) => html`
                                <div class="amp-device-row">
                                    <div class="amp-status-dot active"></div>
                                    <div class="amp-device-icon ${dev.device_type || ''}">${this._renderDeviceIcon(dev.device_type)}</div>
                                    <div class="amp-device-info">
                                        <div class="amp-device-name">${dev.name || dev.id}</div>
                                        <div class="amp-device-sub">${dev.manufacturer || ''} ${dev.model || ''}</div>
                                    </div>
                                    ${streamSvcs.length ? html`
                                        <div class="amp-svc-badges">
                                            ${streamSvcs.map(s => html`
                                                <div class="amp-svc-badge" data-color="${stream.color}">
                                                    <div class="dot"></div>
                                                    ${s.label}
                                                </div>
                                            `)}
                                        </div>
                                    ` : ''}
                                </div>
                                ${connectorLabel !== null ? html`
                                    <div class="amp-connector-row">
                                        <div class="amp-connector-line ${connectorActive ? 'active' : 'inactive'}"></div>
                                        <div class="amp-connector-label">${connectorLabel}</div>
                                    </div>
                                ` : ''}
                            `)}
                        </div>
                    </div>
                `;
            })}
        `;
    }

    render() {
        if (this._loading) {
            return html`<div class="amp-loading">Loading…</div>`;
        }
        return html`
            ${this._renderNowPlayingCards()}
            ${this._renderChain()}
        `;
    }
}

customElements.define('ag-mobile-pipeline', AgMobilePipeline);
