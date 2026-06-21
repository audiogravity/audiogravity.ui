import { svg } from 'lit';

// Module-level constants — allocated once, not on every render call

const DEVICE_COLORS = {
    'streamer':   '#6366f1',
    'source':     'var(--color-info)',
    'converter':  '#8b5cf6',
    'amplifier':  '#ec4899',
    'output':     'var(--color-error)',
    'endpoint':   'var(--text-tertiary)',
    'server':     '#0ea5e9',
    'storage':    '#14b8a6',
    'controller': '#f59e0b',
};

const PORT_ICONS = {
    'antenna': "M12 3c-4.97 0-9 4.03-9 9 0 4.17 2.84 7.67 6.69 8.64L12 21l2.31-.36C18.16 19.67 21 16.17 21 12c0-4.97-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z",
    'rj45':    "M4 4h16v12H4V4zm2 2v8h12V6H6zm3 10v2h6v-2H9z",
    'usb-a':   "M15 7h-1V1h-4v6H9l3 3 3-3zM8 15V9H5v6h3zm8-6v6h3V9h-3zM5 19v2h14v-2H5z",
    'usb-b':   "M15 7h-1V1h-4v6H9l3 3 3-3zM8 15V9H5v6h3zm8-6v6h3V9h-3zM5 19v2h14v-2H5z",
    'toslink': "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z",
    'rca':     "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-4-8h8v2H8v-2z",
    'jack':    "M6 2v16h12V2H6zm2 2h8v12H8V4z",
};

const _truncate = (text, max, fallback = '') =>
    !text ? fallback : text.length > max ? text.slice(0, max - 1) + '…' : text;

/**
 * @module AgPipelineNode
 * @description Functional atom for rendering a pipeline node within an SVG.
 * Supports both standard software nodes and physical 'device' nodes with ports.
 * Device ports are dynamically positioned to be vertically centered if the number of ports is less than the maximum possible.
 *
 * @param {Object} node - The node data object.
 * @param {string} node.id - Unique identifier for the node.
 * @param {string} node.name - Display name of the node.
 * @param {string} node.status - Current status ('active', 'inactive', 'error').
 * @param {string} [node.type] - Node type ('service', 'processing', 'alsa_output', 'device').
 * @param {number} [node.x=0] - X coordinate.
 * @param {number} [node.y=0] - Y coordinate.
 * @param {number} [node.width=120] - Width of the node (for non-device types).
 * @param {number} [node.height=50] - Height of the node (for non-device types).
 * @param {string} [node.device_type] - Subtype for device nodes ('source', 'converter', 'amplifier', 'output', 'endpoint').
 * @param {Array<Object>} [node.inputs] - Input ports for device nodes.
 * @param {Array<Object>} [node.outputs] - Output ports for device nodes. Centered vertically if count < maxPorts.
 * @param {string} [node.manufacturer] - Manufacturer name.
 * @param {string} [node.model] - Model name.
 * @param {number} [node.volume] - Volume level (0-100).
 * @param {Object} [node.metadata] - Additional metadata (artist, title, format, etc.).
 * @returns {import('lit').TemplateResult} SVG fragment representing the node.
 */
export const renderPipelineNode = (node) => {
    const isActive = node.status === 'active';
    const radius = 30;
    const width = node.width || 120;
    const height = node.height || 50;
    const x = node.x || 0;
    const y = node.y || 0;
    const name = node.name || 'Unknown';
    const type = node.type || 'processing';
    const metadata = node.metadata || {};

    const volumePath = "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
    const playPath = "M8 5v14l11-7z";
    const pausePath = "M6 4h4v16H6V4zm8 0h4v16h-4V4z";
    const volumeLevel = node.volume !== undefined && node.volume !== null ? `${node.volume}%` : '';
    const artist = metadata.artist;
    const title = metadata.title;
    const sourceFormat = metadata.source_format;
    const playbackStatus = metadata.playback_status; // "Playing", "Paused", "Stopped"
    
    // New: DEVICE node with ports (rectangle with IN/OUT ports visible)
    if (type === 'device') {
        const deviceType = node.device_type || 'source';
        const inputs = node.inputs || [];
        const outputs = node.outputs || [];
        const manufacturer = node.manufacturer || '';
        const model = node.model || '';

        const color = DEVICE_COLORS[deviceType] || 'var(--text-tertiary)';

        // Internal services (for streamer, server, controller)
        const internalServices = node.internal_services || [];
        const serviceNowPlaying = metadata.service_now_playing || {};
        const baseServiceRowHeight = 20;
        const trackInfoExtraHeight = 16;
        // Per-service row heights (extended when track info is available)
        const serviceRowHeights = internalServices.map(svc =>
            baseServiceRowHeight + (serviceNowPlaying[svc.id]?.title ? trackInfoExtraHeight : 0)
        );
        const servicesSectionHeight = internalServices.length > 0
            ? serviceRowHeights.reduce((a, b) => a + b, 0) + 16  // 8px padding top + bottom
            : 0;

        // Now Playing section (server nodes only — streamer uses inline per-service display)
        const nowPlaying = (deviceType === 'server' && metadata.now_playing?.title) ? metadata.now_playing : null;
        const nowPlayingSectionHeight = nowPlaying ? 46 : 0;

        // Network interfaces footer
        const networkInterfaces = node.network_interfaces || [];
        const networkSectionHeight = networkInterfaces.length > 0 ? 26 : 0;

        // Calculate dimensions
        const maxPorts = Math.max(inputs.length, outputs.length, 1);
        const portHeight = 28;
        const headerHeight = 45;
        const deviceWidth = 220;
        const deviceHeight = headerHeight + servicesSectionHeight + nowPlayingSectionHeight + maxPorts * portHeight + networkSectionHeight + 10;

        // Render ports
        // isSteerable: true for output ports of steerable devices (streamer)
        const renderPort = (port, index, isInput, isSteerable = false, nodeId = '') => {
            const ports = isInput ? inputs : outputs;
            const totalPortsHeight = ports.length * portHeight;
            const bodyHeight = deviceHeight - headerHeight - servicesSectionHeight - nowPlayingSectionHeight - 10;
            const startY = headerHeight + servicesSectionHeight + nowPlayingSectionHeight + 5 + (bodyHeight - totalPortsHeight) / 2;
            const portY = startY + index * portHeight + (portHeight / 2);
            
            const portX = isInput ? 0 : deviceWidth;
            const textX = isInput ? 28 : deviceWidth - 28; // Shifted for icon
            const textAnchor = isInput ? 'start' : 'end';
            const portActive = port.active || false;

            // NEW: Service names and flow color
            const services = port.services || [];
            const flowColor = port.flow_color || (portActive ? 'var(--color-success)' : 'var(--bg-tertiary)');
            const hasServices = services.length > 0;

            // Icon or Connector label
            const connType = port.connector?.toLowerCase() || '';
            const iconPath = PORT_ICONS[connType] || (connType.includes('usb') ? PORT_ICONS['usb-a'] : (connType.includes('rca') ? PORT_ICONS['rca'] : (connType.includes('jack') ? PORT_ICONS['jack'] : null)));
            const iconX = isInput ? 8 : deviceWidth - 20;

            return svg`
                <g class="port ${portActive ? 'active' : 'inactive'}">
                    <!-- Port circle with flow color -->
                    <circle cx="${portX}" cy="${portY}" r="6"
                        fill="${portActive ? flowColor : 'var(--bg-primary)'}"
                        stroke="${portActive ? flowColor : 'var(--text-tertiary)'}"
                        stroke-opacity="${portActive ? '0.4' : '0.8'}"
                        stroke-width="${portActive ? '2' : '2.5'}" />

                    <!-- Connector Icon -->
                    ${iconPath ? svg`
                        <g transform="translate(${iconX}, ${portY - 6}) scale(0.5)">
                            <path d="${iconPath}" fill="${portActive ? 'var(--pipeline-node-text)' : 'var(--text-tertiary)'}" />
                        </g>
                    ` : ''}

                    <!-- Port main label -->
                    <text x="${textX}" y="${portY - 2}"
                        style="fill: ${portActive ? 'var(--pipeline-node-text)' : 'var(--text-secondary)'}; font-size: 10px; font-weight: ${portActive ? 'bold' : 'normal'}; text-anchor: ${textAnchor}; font-family: var(--font-sans, sans-serif);">
                        ${port.label || port.id}
                    </text>

                    <!-- NEW: Service badges -->
                    ${hasServices ? svg`
                        <text x="${textX}" y="${portY + 8}"
                            style="fill: ${flowColor}; font-size: 7px; font-weight: 700; text-anchor: ${textAnchor}; letter-spacing: 0.3px;">
                            [${services.join(', ')}]
                        </text>
                    ` : ''}

                    <!-- Port connector sub-label -->
                    ${connType ? svg`
                        <text x="${textX}" y="${portY + (hasServices ? 16 : 8)}"
                            style="fill: ${portActive ? color : 'var(--text-tertiary)'}; font-size: 7px; text-anchor: ${textAnchor}; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${connType}
                        </text>
                    ` : ''}

                    <!-- Steering button (output ports of steerable devices only) -->
                    ${isSteerable && !isInput ? svg`
                        <rect x="228" y="${portY - 8}" width="16" height="16" rx="3"
                            fill="rgba(99,102,241,0.08)"
                            stroke="#6366f1"
                            stroke-width="1"
                            stroke-dasharray="2,1"
                            style="cursor: pointer;"
                            data-steerable="true"
                            data-port-id="${port.id}"
                            data-device-id="${nodeId}" />
                        <text x="236" y="${portY + 4}"
                            style="fill: #6366f1; font-size: 9px; font-weight: 800; text-anchor: middle; pointer-events: none;">
                            ⇄
                        </text>
                    ` : ''}
                </g>
            `;
        };

        return svg`
            <g class="pipeline-node device ${deviceType}"
               data-node-id="${node.id}"
               transform="translate(${x - deviceWidth/2}, ${y - deviceHeight/2})">
                <!-- Drop shadow (simulated with a blurred rect) -->
                <rect x="2" y="2" width="${deviceWidth}" height="${deviceHeight}" rx="8" fill="var(--shadow-color)" />

                <!-- Device body -->
                <rect width="${deviceWidth}" height="${deviceHeight}" rx="8"
                    fill="var(--pipeline-node-bg)"
                    fill-opacity="0.95"
                    stroke="${isActive ? color : 'var(--border-color)'}"
                    stroke-opacity="${isActive ? '1' : '0.3'}"
                    stroke-width="${isActive ? 2 : 1}" />

                <!-- Device header -->
                <path d="M 0 8 A 8 8 0 0 1 8 0 L ${deviceWidth - 8} 0 A 8 8 0 0 1 ${deviceWidth} 8 L ${deviceWidth} ${headerHeight} L 0 ${headerHeight} Z"
                    fill="${color}" opacity="0.15" />

                <!-- Header divider -->
                <line x1="0" y1="${headerHeight}" x2="${deviceWidth}" y2="${headerHeight}"
                    stroke="${color}" stroke-width="1" opacity="0.3" />

                <!-- Device name -->
                <text x="${deviceWidth / 2}" y="20"
                    style="fill: var(--pipeline-node-text); font-size: 12px; font-weight: 800; text-anchor: middle; letter-spacing: 0.5px;">
                    ${name.toUpperCase()}
                </text>

                <!-- Device model/manufacturer -->
                <text x="${deviceWidth / 2}" y="34"
                    style="fill: ${color}; font-size: 8px; font-weight: 600; text-anchor: middle; opacity: 0.8;">
                    ${manufacturer} ${model}
                </text>

                <!-- Internal services section (streamer, server, controller) -->
                ${internalServices.length > 0 ? svg`
                    <line x1="8" y1="${headerHeight}" x2="${deviceWidth - 8}" y2="${headerHeight}"
                        stroke="${color}" stroke-width="0.5" opacity="0.2" />
                    ${internalServices.map((svc, i) => {
                        // Pre-compute svcY from cumulative row heights
                        let _cy = headerHeight + 8;
                        for (let j = 0; j < i; j++) _cy += serviceRowHeights[j];
                        const svcY = _cy + baseServiceRowHeight / 2;

                        const isActiveSvc = svc.status === 'active';
                        const snp = serviceNowPlaying[svc.id];
                        const snpStateColor = snp?.state === 'playing' ? 'var(--color-success)'
                                           : snp?.state === 'paused'   ? 'var(--color-warning)'
                                           : null;
                        const dotColor = isActiveSvc ? (snpStateColor || svc.flow_color || color) : 'var(--text-tertiary)';
                        const snpTitle = _truncate(snp?.title, 22);
                        const snpArtist = _truncate(snp?.artist, 22);
                        const snpColor = snpStateColor || 'var(--text-tertiary)';
                        const snpSR = snp?.sample_rate;
                        const snpSRStr = snpSR ? `${(snpSR / 1000).toFixed(snpSR % 1000 === 0 ? 0 : 1)}k` : null;
                        const snpCodec = snp?.format || null;
                        const snpFmt = (() => {
                            if (snpCodec && snp?.sample_bits && snpSRStr) return `${snpCodec} ${snp.sample_bits}/${snpSRStr}`;
                            if (snpCodec && snp?.sample_bits) return `${snpCodec} ${snp.sample_bits}b`;
                            if (snpCodec && snpSRStr) return `${snpCodec} ${snpSRStr}`;
                            if (snpCodec && snp?.bitrate) return `${snpCodec} ${snp.bitrate}k`;
                            if (snpCodec) return snpCodec;
                            if (snp?.sample_bits && snpSRStr) return `${snp.sample_bits}/${snpSRStr}`;
                            if (snp?.bitrate) return `${snp.bitrate}k`;
                            return null;
                        })();
                        const snpVol = snp?.volume != null ? `${snp.volume}%` : null;
                        return svg`
                            <g class="internal-service ${isActiveSvc ? 'active' : 'inactive'}">
                                ${snp?.state === 'playing' ? svg`<circle cx="18" cy="${svcY}" r="7" fill="var(--color-success)" fill-opacity="0.15" />` : ''}
                                <circle cx="18" cy="${svcY}" r="4"
                                    fill="${dotColor}"
                                    fill-opacity="${isActiveSvc ? '1' : '0.3'}"
                                    stroke="${dotColor}"
                                    stroke-width="1" />
                                <text x="28" y="${svcY + 4}"
                                    style="fill: ${isActiveSvc ? 'var(--pipeline-node-text)' : 'var(--text-tertiary)'}; font-size: 9px; font-weight: ${isActiveSvc ? '700' : '400'}; font-family: var(--font-sans, sans-serif);">
                                    ${svc.label}
                                </text>
                                ${svc.protocol || snpVol ? svg`
                                    <text x="${deviceWidth - 10}" y="${svcY + 4}"
                                        style="fill: ${isActiveSvc ? dotColor : 'var(--text-tertiary)'}; font-size: 7px; font-weight: 600; text-anchor: end; letter-spacing: 0.3px; text-transform: uppercase; opacity: 0.8;">
                                        ${[svc.protocol, snpVol].filter(Boolean).join('  ')}
                                    </text>
                                ` : ''}
                                ${snp?.title ? svg`
                                    <text x="28" y="${svcY + 4 + 12}"
                                        style="fill: ${snpColor}; font-size: 7.5px; font-style: italic;">
                                        ${snpTitle}${snpArtist ? ` — ${snpArtist}` : ''}
                                    </text>
                                    ${snpFmt ? svg`
                                        <text x="${deviceWidth - 10}" y="${svcY + 4 + 12}"
                                            style="fill: ${snpColor}; font-size: 7px; font-weight: 700; text-anchor: end; font-family: var(--font-mono, monospace);">
                                            ${snpFmt}
                                        </text>
                                    ` : ''}
                                ` : ''}
                            </g>
                        `;
                    })}
                    <line x1="8" y1="${headerHeight + servicesSectionHeight}" x2="${deviceWidth - 8}" y2="${headerHeight + servicesSectionHeight}"
                        stroke="${color}" stroke-width="0.5" opacity="0.2" />
                ` : ''}

                <!-- Now Playing section (server nodes only) -->
                ${nowPlaying ? svg`
                    ${(() => {
                        const npY = headerHeight + servicesSectionHeight;
                        const isPlaying = nowPlaying.state === 'playing';
                        const npColor = isPlaying ? 'var(--color-success)' : 'var(--color-warning)';
                        const npSR = nowPlaying.sample_rate;
                        const npSRStr = npSR ? `${(npSR / 1000).toFixed(npSR % 1000 === 0 ? 0 : 1)}k` : null;
                        const npCodec = nowPlaying.format || null;
                        const npBits = nowPlaying.sample_bits;
                        const npFmt = (() => {
                            if (npCodec && npBits && npSRStr) return `${npCodec} ${npBits}/${npSRStr}`;
                            if (npCodec && npBits) return `${npCodec} ${npBits}b`;
                            if (npCodec && npSRStr) return `${npCodec} ${npSRStr}`;
                            if (npCodec) return npCodec;
                            if (npBits && npSRStr) return `${npBits}/${npSRStr}`;
                            return null;
                        })();
                        const npVol = nowPlaying.volume != null ? `${nowPlaying.volume}%` : null;
                        const npRight = [npFmt, npVol].filter(Boolean).join('  ');
                        const npTitle = _truncate(nowPlaying.title, 24, '—') || '—';
                        const npArtist = _truncate(nowPlaying.artist, 24);
                        return svg`
                            <line x1="8" y1="${npY}" x2="${deviceWidth - 8}" y2="${npY}" stroke="${color}" stroke-width="0.5" opacity="0.2" />
                            <circle cx="14" cy="${npY + 14}" r="3.5" fill="${npColor}" fill-opacity="${isPlaying ? '1' : '0.4'}" />
                            ${isPlaying ? svg`<circle cx="14" cy="${npY + 14}" r="6" fill="${npColor}" fill-opacity="0.15" />` : ''}
                            <text x="24" y="${npY + 12}" style="fill: var(--pipeline-node-text); font-size: 9px; font-weight: 700;">${npTitle}</text>
                            <text x="24" y="${npY + 24}" style="fill: var(--text-secondary); font-size: 8px;">${npArtist}</text>
                            ${npRight ? svg`<text x="${deviceWidth - 8}" y="${npY + 18}" style="fill: ${npColor}; font-size: 7.5px; font-weight: 600; text-anchor: end; font-family: var(--font-mono, monospace);">${npRight}</text>` : ''}
                            <line x1="8" y1="${npY + nowPlayingSectionHeight - 2}" x2="${deviceWidth - 8}" y2="${npY + nowPlayingSectionHeight - 2}" stroke="${color}" stroke-width="0.5" opacity="0.2" />
                        `;
                    })()}
                ` : ''}

                <!-- Input ports -->
                ${inputs.map((port, i) => renderPort(port, i, true))}

                <!-- Output ports (steerable for streamer device type) -->
                ${outputs.map((port, i) => renderPort(port, i, false, deviceType === 'streamer', node.id))}

                <!-- Network interfaces footer -->
                ${networkInterfaces.length > 0 ? svg`
                    <line x1="8" y1="${deviceHeight - networkSectionHeight - 1}" x2="${deviceWidth - 8}" y2="${deviceHeight - networkSectionHeight - 1}"
                        stroke="${color}" stroke-width="0.5" opacity="0.2" />
                    <g transform="translate(${deviceWidth / 2 - (networkInterfaces.length * 54) / 2}, ${deviceHeight - networkSectionHeight + 4})">
                        ${networkInterfaces.map((ni, i) => {
                            const niX = i * 54;
                            const isActiveNi = ni.active === true;
                            const niColor = isActiveNi ? 'var(--color-success)' : 'var(--text-tertiary)';
                            const connType = (ni.connector || '').toLowerCase();
                            const niIcon = PORT_ICONS[connType] || PORT_ICONS['antenna'];
                            return svg`
                                <g transform="translate(${niX}, 0)" style="cursor: pointer;"
                                    @click=${(e) => {
                                        e.stopPropagation();
                                        const svgEl = e.currentTarget.closest('svg');
                                        const rect = svgEl ? svgEl.getBoundingClientRect() : { left: 0, top: 0 };
                                        svgEl?.dispatchEvent(new CustomEvent('network-interface-click', {
                                            bubbles: true,
                                            detail: {
                                                ni,
                                                nodeId: node.id,
                                                nodeName: node.name,
                                                screenX: e.clientX - rect.left,
                                                screenY: e.clientY - rect.top,
                                            }
                                        }));
                                    }}>
                                    <rect x="0" y="-2" width="50" height="16" fill="transparent" />
                                    <g transform="scale(0.5)">
                                        <path d="${niIcon}" fill="${niColor}" opacity="${isActiveNi ? '1' : '0.45'}" />
                                    </g>
                                    <text x="14" y="9"
                                        style="fill: ${niColor}; font-size: 7.5px; font-weight: ${isActiveNi ? '700' : '400'}; font-family: var(--font-sans, sans-serif); opacity: ${isActiveNi ? '1' : '0.6'};">
                                        ${ni.label}
                                    </text>
                                </g>
                            `;
                        })}
                    </g>
                ` : ''}
            </g>
        `;
    }

    if (type === 'alsa_output') {
        const deviceName = name.replace('Output (', '').replace(')', '');
        // Calculate badge width based on device name length (min 200px, max 280px)
        const nameLength = deviceName.length;
        const badgeWidth = Math.min(280, Math.max(200, nameLength * 8.5 + 50));
        const badgeOffset = -badgeWidth / 2;

        return svg`
            <g class="pipeline-node output" data-node-id="${node.id}" transform="translate(${x}, ${y})">
                <circle class="node-circle ${isActive ? 'active' : ''}" cx="0" cy="0" r="${radius}"
                    style="fill: var(--pipeline-node-output, #ef4444); stroke: var(--pipeline-node-border, rgba(255,255,255,0.2)); stroke-width: 2;" />
                <g transform="translate(-12, -12)"><path d="${volumePath}" fill="#fff" /></g>

                <!-- Unified Badge (Dynamic width) -->
                <g transform="translate(${badgeOffset}, 40)">
                    <rect width="${badgeWidth}" height="34" rx="4" style="fill: var(--bg-tertiary, #f1f5f9); stroke: var(--border-color, #e2e8f0); stroke-width: 1;" />
                    <g transform="translate(8, 8) scale(0.7)"><path d="${volumePath}" fill="var(--color-info, #3b82f6)" /></g>
                    <text x="30" y="21" style="fill: var(--text-secondary, #475569); font-size: 10px; font-weight: bold; font-family: var(--font-mono, monospace);">${deviceName}</text>
                    <text x="${badgeWidth - 8}" y="21" style="fill: var(--text-accent, #3b82f6); font-size: 10px; font-weight: bold; font-family: var(--font-mono, monospace); text-anchor: end;">${volumeLevel}</text>
                </g>
            </g>
        `;
    }

    // New topology nodes: streamer_output, dac_input, dac_output, amplifier, speakers
    if (type === 'streamer_output' || type === 'dac_input' || type === 'dac_output' || type === 'amplifier' || type === 'speakers') {
        const connector = metadata.connector || '';
        const deviceName = name;
        const badgeWidth = Math.min(250, Math.max(150, deviceName.length * 7 + 40));
        const badgeOffset = -badgeWidth / 2;

        // Node colors based on type
        const nodeColors = {
            'streamer_output': '#6366f1', // Indigo
            'dac_input': '#8b5cf6',       // Purple
            'dac_output': '#a855f7',      // Purple lighter
            'amplifier': '#ec4899',       // Pink
            'speakers': '#f43f5e'         // Red
        };

        const nodeColor = nodeColors[type] || '#64748b';
        const nodeRadius = 25;

        return svg`
            <g class="pipeline-node ${type}" 
               data-node-id="${node.id}"
               transform="translate(${x}, ${y})">
                <circle class="node-circle ${isActive ? 'active' : ''}" cx="0" cy="0" r="${nodeRadius}"
                    style="fill: ${nodeColor}; stroke: rgba(255,255,255,0.3); stroke-width: 2; opacity: 0.9;" />

                <!-- Badge below node -->
                <g transform="translate(${badgeOffset}, ${nodeRadius + 8})">
                    <rect width="${badgeWidth}" height="28" rx="3"
                        style="fill: rgba(15, 23, 42, 0.8); stroke: ${nodeColor}; stroke-width: 1;" />
                    <text x="${badgeWidth / 2}" y="16"
                        style="fill: #e2e8f0; font-size: 9px; font-weight: 600; text-anchor: middle; font-family: var(--font-mono, monospace);">
                        ${deviceName}
                    </text>
                    ${connector ? svg`
                        <text x="${badgeWidth / 2}" y="24"
                            style="fill: ${nodeColor}; font-size: 7px; text-anchor: middle; text-transform: uppercase;">
                            ${connector}
                        </text>
                    ` : ''}
                </g>
            </g>
        `;
    }

    if (type === 'service' || type === 'source') {
        const badgeHeight = title ? 48 : 34;
        const isPaused = playbackStatus === 'Paused';
        const isPlaying = playbackStatus === 'Playing';
        const isStopped = playbackStatus === 'Stopped';
        const statusIcon = isPlaying ? playPath : (isPaused ? pausePath : volumePath);
        const statusColor = isPlaying ? 'var(--color-success)' : (isPaused ? 'var(--color-warning)' : (isActive ? 'var(--color-info)' : 'var(--text-secondary)'));
        const opacity = isActive ? 1.0 : 0.6;  // Paused/stopped nodes are semi-transparent

        // Calculate dynamic badge width based on content
        const trackText = artist ? `${artist} - ${title}` : title || '';
        const maxTextLength = Math.max(name.length, trackText.length, (sourceFormat || '').length);
        const badgeWidth = Math.min(350, Math.max(180, maxTextLength * 7 + 60));
        const badgeOffset = -badgeWidth / 2;

        const maxTrackChars = Math.floor((badgeWidth - 40) / 5.5);
        const displayTrackText = _truncate(trackText, maxTrackChars);

        return svg`
            <g class="pipeline-node source" 
               data-node-id="${node.id}"
               transform="translate(${x}, ${y})" 
               opacity="${opacity}">
                <g transform="translate(${badgeOffset}, ${-badgeHeight/2})">
                    <rect width="${badgeWidth}" height="${badgeHeight}" rx="4"
                        style="fill: var(--bg-tertiary, #f1f5f9); stroke: ${isPaused ? '#f59e0b' : 'var(--border-color, #3b82f6)'}; stroke-width: ${isActive ? 2 : 1};" />

                    <!-- Icon/Indicator (Play/Pause/Volume) -->
                    <g transform="translate(8, 8) scale(0.7)">
                        <path d="${statusIcon}" fill="${statusColor}" />
                    </g>

                    <!-- Service Name & Volume -->
                    <text x="30" y="20" style="fill: var(--text-primary, #1e293b); font-size: 10px; font-weight: bold; font-family: var(--font-mono, monospace);">${name}</text>
                    <text x="${badgeWidth - 8}" y="20" style="fill: var(--color-info, #3b82f6); font-size: 9px; font-weight: bold; font-family: var(--font-mono, monospace); text-anchor: end;">${volumeLevel}</text>

                    ${title ? svg`
                        <!-- Metadata: Track info -->
                        <text x="30" y="32" style="fill: var(--text-secondary, #475569); font-size: 9px; font-style: italic;">${displayTrackText}</text>
                        <!-- Quality Info -->
                        <text x="30" y="42" style="fill: var(--text-accent, #3b82f6); font-size: 7px; font-weight: bold; text-transform: uppercase;">${sourceFormat || ''}</text>
                    ` : svg`
                        <!-- Quality Info (if no title) -->
                        <text x="30" y="30" style="fill: var(--text-accent, #3b82f6); font-size: 7px; font-weight: bold; text-transform: uppercase;">${sourceFormat || ''}</text>
                    `}

                    <!-- Software Output Port (Green circle on the right) -->
                    <circle cx="${badgeWidth}" cy="${badgeHeight / 2}" r="5"
                        fill="${isPlaying || (isActive && !isPaused && !isStopped) ? 'var(--color-success)' : 'var(--text-tertiary)'}"
                        stroke="${isPlaying || (isActive && !isPaused && !isStopped) ? 'var(--color-success)' : 'var(--bg-primary)'}"
                        stroke-width="1.5" />
                </g>
            </g>
        `;
    }

    const rx = 20;
    return svg`
        <g class="pipeline-node processing" transform="translate(${x - width/2}, ${y - height/2})">
            <rect class="node-rect ${isActive ? 'active' : ''}" width="${width}" height="${height}" rx="${rx}" 
                style="fill: var(--pipeline-node-proc, #8b5cf6); stroke: var(--pipeline-node-border, rgba(255,255,255,0.1)); stroke-width: 2;" />
            <text class="node-text" x="${width/2}" y="${height/2 + 4}" style="fill: #fff; font-size: 11px; font-weight: bold; text-anchor: middle;">${name}</text>
        </g>
    `;
};
