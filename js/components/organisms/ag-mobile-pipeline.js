import { LitElement, html } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { iconSmartphone, iconServer, iconCpu, iconAudioWaveform, iconAudioLines, iconVolume, iconMusicNote as iconFileMusic, iconDatabase, iconConnection } from '../../ag-icons.js';

/**
 * Mobile-optimized read-only view of the active audio pipeline.
 * Shows one "now playing" card per active stream + the full signal chain below.
 * The state is read once from /audio_pipeline/current, then kept up to date by the
 * 'audio-pipeline-update' SSE event — the core publishes it only when the pipeline
 * actually changes, so the tab costs nothing while it sits open.
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
ag-mobile-pipeline { display: block; min-height: 100%; }
ag-mobile-pipeline .amp-section-label { font-size: var(--font-size-xxs); font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 10px; padding-left: 2px; }
ag-mobile-pipeline .amp-streams { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
ag-mobile-pipeline .amp-np-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: 16px; }
ag-mobile-pipeline .amp-source-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: var(--radius-full); padding: 3px 10px; font-size: var(--font-size-xxs); font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 12px; }
ag-mobile-pipeline .amp-source-badge[data-color="roon"]    { background: var(--color-info-bg); border: 1px solid var(--color-info); color: var(--color-info-text); }
ag-mobile-pipeline .amp-source-badge[data-color="airplay"] { background: var(--color-warning-bg); border: 1px solid var(--color-warning); color: var(--color-warning-text); }
ag-mobile-pipeline .amp-source-badge[data-color="mpd"]     { background: var(--accent-primary-alpha); border: 1px solid var(--accent-primary); color: var(--accent-primary); }
ag-mobile-pipeline .amp-source-badge[data-color="default"] { background: var(--color-success-bg); border: 1px solid var(--color-success); color: var(--color-success-text); }
/* The pulse animates the dot's COLOUR, not its opacity or its scale — deliberately.
 *
 * opacity and transform are the two properties a browser animates without repainting,
 * and it pays for that by giving the element its own compositing layer for as long as
 * the animation runs. Declared infinite, that layer never goes away. There is one dot
 * per ACTIVE STREAM, so the count grows with the product: every source Audiogravity
 * gains adds another permanent layer to this screen, on the device least able to
 * afford it.
 *
 * background-color is a paint-only property: no layer, and repainting a 6 px disc
 * costs nothing. The pulse reads the same — the dot dims instead of shrinking.
 *
 * This is a sobriety fix (CLAUDE.md rule 12), not a bug fix: it was tried against the
 * iOS sidebar-invisibility defect and did NOT resolve it. */
ag-mobile-pipeline .amp-source-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amp-dot-fill); animation: amp-pulse 2s infinite; }
ag-mobile-pipeline .amp-source-dot[data-color="roon"]    { --amp-dot-fill: var(--color-info); }
ag-mobile-pipeline .amp-source-dot[data-color="airplay"] { --amp-dot-fill: var(--color-warning); }
ag-mobile-pipeline .amp-source-dot[data-color="mpd"]     { --amp-dot-fill: var(--accent-primary); }
ag-mobile-pipeline .amp-source-dot[data-color="default"] { --amp-dot-fill: var(--color-success); }
@keyframes amp-pulse { 0%, 100% { background-color: var(--amp-dot-fill); } 50% { background-color: color-mix(in srgb, var(--amp-dot-fill) 35%, transparent); } }
ag-mobile-pipeline .amp-np-title  { font-size: var(--font-size-lg); font-weight: 700; color: var(--text-primary); line-height: 1.3; margin-bottom: 3px; }
ag-mobile-pipeline .amp-np-artist { font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 2px; }
ag-mobile-pipeline .amp-np-album  { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: 12px; }
ag-mobile-pipeline .amp-np-idle   { font-size: var(--font-size-sm); color: var(--text-tertiary); margin-bottom: 12px; font-style: italic; }
ag-mobile-pipeline .amp-format-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-top: var(--spacing-md); }
ag-mobile-pipeline .amp-fmt-chip { font-size: var(--font-size-xxs); font-weight: 700; padding: 2px 7px; border-radius: var(--radius-sm); letter-spacing: 0.4px; background: var(--color-success-bg); color: var(--color-success-text); }
ag-mobile-pipeline .amp-fmt-chip.dim { background: var(--accent-primary-alpha); color: var(--accent-primary); }
ag-mobile-pipeline .amp-chain-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: 16px; margin-bottom: 10px; }
ag-mobile-pipeline .amp-nochain .amp-nochain-line { margin: 0 0 var(--spacing-sm); color: var(--text-secondary); font-size: var(--font-size-xs); line-height: 1.5; }
ag-mobile-pipeline .amp-nochain .amp-nochain-line:last-child { margin-bottom: 0; }
ag-mobile-pipeline .amp-nochain .amp-nochain-row { display: flex; gap: var(--spacing-sm); padding: var(--spacing-xs) 0; font-size: var(--font-size-xs); }
ag-mobile-pipeline .amp-nochain .amp-nochain-key { color: var(--text-tertiary); flex-shrink: 0; min-width: 96px; }
ag-mobile-pipeline .amp-nochain .amp-nochain-val { color: var(--text-primary); }
ag-mobile-pipeline .amp-chain { display: flex; flex-direction: column; }
ag-mobile-pipeline .amp-device-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
ag-mobile-pipeline .amp-device-row.inactive { opacity: 0.38; }
ag-mobile-pipeline .amp-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
ag-mobile-pipeline .amp-status-dot.active   { background: var(--color-success); }
ag-mobile-pipeline .amp-status-dot.inactive { background: var(--border-color); }
ag-mobile-pipeline .amp-device-icon { width: 30px; height: 30px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
ag-mobile-pipeline .amp-device-icon span { font-size: var(--font-size-sm); }
/* Per-device-type icon tints: a deliberate decorative palette (converter/amplifier/
   controller have no semantic AG token) — kept literal on purpose (UI rule 6 exception). */
ag-mobile-pipeline .amp-device-icon.controller { background: rgba(245,158,11,0.15); color: #f59e0b; }
ag-mobile-pipeline .amp-device-icon.server     { background: var(--color-info-bg);  color: var(--color-info-text); }
ag-mobile-pipeline .amp-device-icon.streamer   { background: var(--accent-primary-alpha);  color: var(--accent-primary); }
ag-mobile-pipeline .amp-device-icon.converter  { background: rgba(139,92,246,0.15);  color: #a78bfa; }
ag-mobile-pipeline .amp-device-icon.amplifier  { background: rgba(236,72,153,0.15);  color: #f472b6; }
ag-mobile-pipeline .amp-device-icon.output     { background: var(--color-success-bg);  color: var(--color-success-text); }
ag-mobile-pipeline .amp-device-icon.source     { background: var(--color-info-bg);  color: var(--color-info-text); }
ag-mobile-pipeline .amp-device-info { flex: 1; min-width: 0; }
ag-mobile-pipeline .amp-device-name { font-size: var(--font-size-sm); font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
ag-mobile-pipeline .amp-device-sub  { font-size: var(--font-size-xxs); color: var(--text-tertiary); margin-top: 1px; }
ag-mobile-pipeline .amp-svc-badges  { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; flex-shrink: 0; }
ag-mobile-pipeline .amp-svc-badge   { display: inline-flex; align-items: center; gap: 4px; border-radius: var(--radius-sm); padding: 2px 7px; font-size: var(--font-size-xxs); font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
ag-mobile-pipeline .amp-svc-badge .dot { width: 5px; height: 5px; border-radius: 50%; }
ag-mobile-pipeline .amp-svc-badge[data-color="roon"]    { background: var(--color-info-bg); color: var(--color-info-text); }
ag-mobile-pipeline .amp-svc-badge[data-color="roon"] .dot { background: var(--color-info); }
ag-mobile-pipeline .amp-svc-badge[data-color="airplay"] { background: var(--color-warning-bg); color: var(--color-warning-text); }
ag-mobile-pipeline .amp-svc-badge[data-color="airplay"] .dot { background: var(--color-warning); }
ag-mobile-pipeline .amp-svc-badge[data-color="mpd"]     { background: var(--accent-primary-alpha); color: var(--accent-primary); }
ag-mobile-pipeline .amp-svc-badge[data-color="mpd"] .dot { background: var(--accent-primary); }
ag-mobile-pipeline .amp-svc-badge[data-color="default"] { background: var(--color-success-bg); color: var(--color-success-text); }
ag-mobile-pipeline .amp-svc-badge[data-color="default"] .dot { background: var(--color-success); }
ag-mobile-pipeline .amp-connector-row   { display: flex; align-items: center; padding: 0 0 0 3px; height: 22px; gap: 0; }
ag-mobile-pipeline .amp-connector-line  { width: 2px; height: 100%; margin-left: 3px; flex-shrink: 0; opacity: 0.35; }
ag-mobile-pipeline .amp-connector-line.active   { background: var(--color-success); }
ag-mobile-pipeline .amp-connector-line.inactive { background: var(--border-color); opacity: 1; }
ag-mobile-pipeline .amp-connector-label { margin-left: 10px; font-size: var(--font-size-xxs); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-tertiary); }
ag-mobile-pipeline .amp-loading  { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-tertiary); font-size: var(--font-size-xs); letter-spacing: 1px; text-transform: uppercase; }
ag-mobile-pipeline .amp-no-stream { text-align: center; padding: 40px 20px; color: var(--text-tertiary); font-size: var(--font-size-sm); }
ag-mobile-pipeline .amp-output-switcher { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
ag-mobile-pipeline .amp-output-switcher::-webkit-scrollbar { display: none; }
ag-mobile-pipeline .amp-output-pill { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; white-space: nowrap; padding: 5px 10px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: var(--bg-secondary); font-size: var(--font-size-xxs); font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; color: var(--text-tertiary); cursor: pointer; transition: all 0.15s ease; user-select: none; -webkit-tap-highlight-color: transparent; }
ag-mobile-pipeline .amp-output-pill:active { opacity: 0.7; }
ag-mobile-pipeline .amp-output-pill.active { border-color: var(--color-success); background: var(--color-success-bg); color: var(--color-success-text); }
ag-mobile-pipeline .amp-output-pill.switching { opacity: 0.5; pointer-events: none; }
ag-mobile-pipeline .amp-output-pill .amp-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-color); flex-shrink: 0; }
ag-mobile-pipeline .amp-output-pill.active .amp-pill-dot { background: var(--color-success); }
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
        this._steeringInterval = null;

        // No throttle here, unlike ag-audio-pipeline: that one guards a heavy SVG
        // redraw, this one renders a short list. And the core already publishes only
        // when the pipeline actually CHANGES — it hashes the payload and skips
        // identical ones — so there is nothing to debounce on this path.
        this._onPipelineUpdate = (e) => { this._pipeline = e.detail; };
    }

    connectedCallback() {
        super.connectedCallback();
        AgMobilePipeline._injectStyles();

        // Listen instead of polling — the same choice ag-audio-pipeline already makes.
        //
        // This component used to re-request /audio_pipeline/current every 5 s. Measured
        // on the box (2026-07-27): that endpoint takes ~570 ms of server time and
        // returns ~15 KB, so an open pipeline tab cost roughly seven minutes of CPU per
        // hour — on the machine that plays the music (CLAUDE.md rule 12).
        //
        // The core already computes this and publishes it on the dashboard channel, but
        // only WHEN IT CHANGES, with a 30 s safety refresh. Polling made it redo the
        // whole computation twelve times a minute whether anything had changed or not.
        window.addEventListener('audio-pipeline-update', this._onPipelineUpdate);
        this._fetch();          // initial state, once
        this._fetchSteering();

        // Steering has no event on the dashboard channel (it publishes on its own
        // channel, which the UI does not subscribe to) and costs ~5 ms, so it stays
        // polled — at a third of the previous rate, since it only changes on a user
        // action.
        this._steeringInterval = setInterval(() => this._fetchSteering(), 15000);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('audio-pipeline-update', this._onPipelineUpdate);
        clearInterval(this._steeringInterval);
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
                    <div class="amp-np-card">
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

    /**
     * Explain an empty signal path instead of leaving a blank space.
     *
     * Devices are drawn only when active, and a device is active only when one
     * of its ports is — ports being matched to real hardware by connector. The
     * chain shipped with a box is an example, describing a USB and an optical
     * output, so a box playing through a HAT board matches neither and every
     * device reads inactive. Measured on one: the track, then nothing, with no
     * way to guess what was expected. The box now reports the outputs it found
     * and could not place, which is exactly what the reader needs to hear.
     *
     * @returns {import('lit').TemplateResult|string} The explanation, or '' when
     *          a chain is being drawn and there is nothing to explain.
     */
    _renderNoChain({ playing = false } = {}) {
        const nodes = this._pipeline?.nodes || [];
        const streamer = nodes.find(n => n.type === 'device' && n.device_type === 'streamer');
        const unmatched = streamer?.metadata?.unmatched_outputs || [];
        const described = (streamer?.outputs || []).map(o => o.label || o.id).filter(Boolean);
        // A streamer with no declared ports serialises `outputs: null`, which
        // says nothing about the rest of the description: someone can describe
        // converter, amplifier and speakers and simply leave the box's own
        // outputs out. Saying "your chain declares no output at all" there
        // sends them to fix a description that exists — so name what is
        // genuinely missing, the outputs of this box.
        const describedLabel = described.length
            ? described.join(', ')
            : 'no output on this box';

        // Declared against detected, side by side: the whole question is which of
        // the two the owner has to change, and reading them next to each other
        // answers it without knowing anything about how the matching works.
        const comparison = html`
            <div class="amp-nochain-row">
                <span class="amp-nochain-key">Playing through</span>
                <span class="amp-nochain-val">
                    ${unmatched.length ? unmatched.map(o => o.label).join(', ') : '—'}
                </span>
            </div>
            <div class="amp-nochain-row">
                <span class="amp-nochain-key">Your chain declares</span>
                <span class="amp-nochain-val">${describedLabel}</span>
            </div>`;

        let body;
        if (unmatched.length) {
            body = html`
                <p class="amp-nochain-line">
                    The output this box plays through is not one your described chain
                    mentions, so there is no path to draw.
                </p>
                ${comparison}
                <p class="amp-nochain-line">
                    Describe your own hi-fi chain with <strong>CONFIG</strong>, above.
                </p>`;
        } else if (playing) {
            // Music demonstrably flows and nothing is reported undeclared, yet
            // no chain drew: the description covers the output's kind but the
            // port could not be lit — the port-activity matcher works from the
            // sound card's name, which not every card cooperates with. Saying
            // "nothing is flowing" here would be flatly false, and it is the
            // trap a correctly-described HAT board falls into.
            body = html`
                <p class="amp-nochain-line">
                    Music is playing, but its route through the described chain could
                    not be traced.
                </p>
                ${comparison}
                <p class="amp-nochain-line">
                    Check that the declared connector matches the output actually in
                    use — <strong>CONFIG</strong>, above.
                </p>`;
        } else {
            body = html`
                <p class="amp-nochain-line">
                    Nothing is flowing through the chain described for this box.
                </p>
                ${comparison}
                <p class="amp-nochain-line">
                    Start playing, or adjust the description with <strong>CONFIG</strong>, above.
                </p>`;
        }

        return html`
            <div class="amp-section-label">Signal chain</div>
            <div class="amp-chain-card amp-nochain">${body}</div>
        `;
    }

    _renderChain() {
        const streams = this._getActiveStreams();
        if (!streams.length) return this._renderNoChain();

        const drawn = streams.filter(stream => this._getChainForStream(stream).length);
        if (!drawn.length) return this._renderNoChain({ playing: true });

        return html`
            ${streams.map(stream => {
                const chain = this._getChainForStream(stream);
                if (!chain.length) return '';
                return html`
                    <div class="amp-section-label">
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
