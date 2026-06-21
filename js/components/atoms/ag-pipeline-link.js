import { svg } from 'lit';
import { cache } from 'lit/directives/cache.js';
import { guard } from 'lit/directives/guard.js';

/**
 * @module AgPipelineLink
 * @description Functional atom for rendering a signal link within an SVG.
 *
 * @param {Object} link - The link data object.
 * @param {number} link.sourceX - Starting X coordinate.
 * @param {number} link.sourceY - Starting Y coordinate.
 * @param {number} link.targetX - Ending X coordinate.
 * @param {number} link.targetY - Ending Y coordinate.
 * @param {boolean} link.active - Whether the link is currently carrying a signal.
 * @param {boolean} [link.bitPerfect] - Whether the signal is bit-perfect.
 * @param {string} [link.link_type] - Type of link (software, alsa, physical, internal).
 * @param {string} [link.connector] - Physical connector type (toslink, rca, etc.).
 * @param {string} [link.flow_color] - Override for the link color.
 * @param {number} [link.latency_us] - Latency in microseconds.
 * @param {number} [link.buffer_fill_percent] - Buffer fill percentage (0-100).
 * @param {boolean} [link.showLatency] - Whether to show latency badge.
 * @param {boolean} [link.showBuffer] - Whether to show buffer badge.
 * @param {boolean} [link.showBitrate] - Whether to show bitrate badge.
 * @param {boolean} [link.showBitPerfect] - Whether to show bit-perfect badge.
 * @param {Object} [sourceNode] - The source node data (used for audio format info).
 * @returns {import('lit').TemplateResult} SVG fragment representing the link.
 */
export const renderPipelineLink = (link, sourceNode) => {
    const { sourceX, sourceY, targetX, targetY, active, bitPerfect, link_type, connector, flow_color, service_name, latency_us, buffer_fill_percent, showLatency = true, showBuffer = true, showBitrate = true, showBitPerfect = true, animationsEnabled = true, link_id } = link;
    const sampleRate = sourceNode?.format?.sample_rate;
    const sampleBits = sourceNode?.format?.sample_bits;

    // Format audio info for display (e.g., "24bit / 96kHz")
    let formatInfo = null;
    if (active && sampleRate && sampleBits) {
        const rateKHz = (sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1);
        formatInfo = `${sampleBits}bit / ${rateKHz}kHz`;
    }
    
    // Calculate control points for a smooth cubic bezier curve
    const deltaX = Math.abs(targetX - sourceX);
    const deltaY = Math.abs(targetY - sourceY);
    const cpOffset = Math.min(deltaX * 0.4, 120);

    // Add slight vertical offset to control points to create arc
    // This helps avoid overlapping parallel connections
    const arcHeight = Math.min(deltaY * 0.15, 30);

    const cp1X = sourceX + cpOffset;
    const cp1Y = sourceY + (targetY > sourceY ? arcHeight : -arcHeight);
    const cp2X = targetX - cpOffset;
    const cp2Y = targetY - (targetY > sourceY ? arcHeight : -arcHeight);

    const pathD = `M ${sourceX} ${sourceY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${targetX} ${targetY}`;

    // Dynamic flow speed: higher sample rate = faster flow
    let duration = 1.5;
    if (sampleRate) {
        duration = Math.max(0.2, 1.5 * (44100 / sampleRate));
    }

    // Link styling based on type and connector - using CSS variables for theme support
    const connectorColors = {
        'toslink': '#22d3ee', // Cyan
        'optical': '#22d3ee',
        'rca': 'var(--color-error)',      // Rose/Red
        'usb-b': 'var(--color-info)',     // Blue
        'usb-a': 'var(--color-info)',
        'xlr': '#a855f7',                 // Purple
        'banana': 'var(--color-warning)', // Amber
        'spk': 'var(--color-warning)',
        'rj45': 'var(--color-success)',   // Green
        'antenna': 'var(--color-info)'    // Blue
    };

    const linkStyles = {
        'software': { color: 'var(--color-info)', width: 2, dashArray: '4 4' },
        'alsa': { color: 'var(--color-success)', width: 2.5, dashArray: '' },
        'physical': { color: connectorColors[connector?.toLowerCase()] || 'var(--color-warning)', width: 3, dashArray: '' },
        'internal': { color: 'var(--text-secondary)', width: 1.5, dashArray: '2 2' },
        'network': { color: 'var(--color-success)', width: 2, dashArray: '8 4' },
        'control': { color: 'var(--color-warning)', width: 1.5, dashArray: '5 3' },
    };

    const linkStyle = linkStyles[link_type] || { color: 'var(--color-warning)', width: 3, dashArray: '' };
    // Analog connectors carry no digital service identity — use neutral color, ignore flow_color
    const ANALOG_CONNECTORS = ['rca', 'din', 'banana', 'xlr', 'jack', 'spk', 'air'];
    const isAnalog = ANALOG_CONNECTORS.some(c => (connector || '').toLowerCase().includes(c));
    const baseColor = isAnalog ? 'var(--text-secondary)' : (flow_color || linkStyle.color);
    // Inactive links: gray color instead of nearly invisible
    const strokeColor = active ? baseColor : 'var(--text-tertiary)';
    const strokeWidth = active ? linkStyle.width : 2;
    const dashArray = active ? linkStyle.dashArray : '3 3'; // Dashed for inactive
    const bitPerfectColor = flow_color || 'var(--color-success)';

    // Particle configuration - speed based on sample rate
    const particleSpeed = duration; // Use the same duration calculation as flow speed
    const particleColor = baseColor;
    // Latency/Buffer display logic
    const hasLatencyInfo = latency_us !== undefined && latency_us !== null;
    const hasBufferInfo = buffer_fill_percent !== undefined && buffer_fill_percent !== null;

    // Color-code latency based on quality (using CSS histogram variables)
    let latencyColor = 'var(--histogram-excellent)'; // < 50µs
    let latencyQuality = 'excellent';
    if (latency_us) {
        if (latency_us >= 500) {
            latencyColor = 'var(--histogram-critical)'; // >= 500µs
            latencyQuality = 'critical';
        } else if (latency_us >= 200) {
            latencyColor = 'var(--histogram-average)'; // 200-500µs
            latencyQuality = 'average';
        } else if (latency_us >= 50) {
            latencyColor = 'var(--histogram-good)'; // 50-200µs
            latencyQuality = 'good';
        }
    }

    // Format latency for display
    const latencyText = latency_us ? `${latency_us.toFixed(0)}µs` : '';

    // Color-code buffer fill
    let bufferColor = 'var(--color-success)'; // Healthy < 80%
    if (buffer_fill_percent) {
        if (buffer_fill_percent >= 90) {
            bufferColor = 'var(--color-error)'; // Critical >= 90%
        } else if (buffer_fill_percent >= 80) {
            bufferColor = 'var(--color-warning)'; // Warning >= 80%
        }
    }

    const bufferText = (buffer_fill_percent !== undefined && buffer_fill_percent !== null) ? `${buffer_fill_percent.toFixed(0)}%` : '';

    // Sanitize link_id for use as SVG element ID (no spaces or special chars)
    const motionPathId = `mp-${(link_id || `${sourceX}-${sourceY}`).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    const isControl = link_type === 'control';

    return svg`
        <g data-link-id="${link_id || ''}" style="cursor: ${link_id ? 'pointer' : 'default'};">
            <!-- Hit area (invisible, wider than visible path for easier clicking) -->
            <path d="${pathD}" style="fill: none; stroke: transparent; stroke-width: 14; cursor: pointer;" />
            <!-- Backing stroke for bridge effect (creates gap when lines cross) — skip for control links -->
            ${(!isControl && active) ? svg`
                <path
                    d="${pathD}"
                    style="fill: none; stroke: var(--bg-primary); stroke-width: ${strokeWidth + 4}; stroke-linecap: round; opacity: 0.95;"
                />
            ` : ''}
            <!-- Background glow for active paths — skip for control links -->
            ${(!isControl && active) ? svg`
                <path
                    d="${pathD}"
                    style="fill: none; stroke: ${strokeColor}; stroke-width: ${strokeWidth + 2}; opacity: 0.15; filter: blur(4px);"
                />
            ` : ''}
            <path
                class="link-path ${active ? 'active' : ''} ${bitPerfect ? 'bit-perfect' : ''}"
                d="${pathD}"
                style="fill: none; stroke: ${bitPerfect ? bitPerfectColor : strokeColor}; stroke-width: ${strokeWidth}; stroke-dasharray: ${dashArray}; stroke-linecap: round; --flow-speed: ${duration}s; ${active ? `filter: drop-shadow(0 0 3px ${bitPerfect ? bitPerfectColor : strokeColor});` : ''}"
            />
            <!-- OPTIMIZATION: Bit-perfect and format badges with cache (stable values) -->
            ${cache((active && bitPerfect && showBitPerfect) ? svg`
                <g transform="translate(${(sourceX + targetX)/2}, ${(sourceY + targetY)/2 - 10})">
                    <rect x="-35" y="-12" width="70" height="14" rx="7" style="fill: none; stroke: ${bitPerfectColor}; stroke-width: 1.5;" />
                    <text y="-2" style="fill: ${bitPerfectColor}; font-size: 7px; font-weight: bold; text-anchor: middle; letter-spacing: 0.5px;">BIT-PERFECT</text>
                    ${(formatInfo && showBitrate) ? svg`
                        <text y="8" style="fill: ${bitPerfectColor}; font-size: 6px; font-weight: 600; text-anchor: middle;">${formatInfo}</text>
                    ` : ''}
                </g>
            ` : null)}
            ${cache((active && !bitPerfect && formatInfo && showBitrate) ? svg`
                <g transform="translate(${(sourceX + targetX)/2}, ${(sourceY + targetY)/2 - 10})">
                    <rect x="${-formatInfo.length * 2.5}" y="-7" width="${formatInfo.length * 5}" height="14" rx="7" style="fill: var(--bg-primary); stroke: ${strokeColor}; fill-opacity: 0.8;" />
                    <text y="3" style="fill: ${strokeColor}; font-size: 7px; font-weight: 600; text-anchor: middle;">${formatInfo}</text>
                </g>
            ` : null)}
            ${cache((active && !bitPerfect && link.resamplingInfo) ? svg`
                <g transform="translate(${(sourceX + targetX)/2}, ${(sourceY + targetY)/2 - 10})">
                    <rect x="-30" y="-7" width="60" height="14" rx="7" style="fill: var(--color-error-bg); stroke: var(--color-error);" />
                    <text y="3" style="fill: var(--pipeline-node-text); font-size: 7px; font-weight: bold; text-anchor: middle;">${link.resamplingInfo}</text>
                </g>
            ` : null)}

            <!-- OPTIMIZATION: Latency/Buffer stats badge with granular rendering -->
            <!-- Only re-render this badge if latency_us or buffer_fill_percent change -->
            ${(active && ((hasLatencyInfo && showLatency) || (hasBufferInfo && showBuffer))) ?
                guard([latency_us, buffer_fill_percent, showLatency, showBuffer], () => svg`
                    <g transform="translate(${(sourceX + targetX)/2}, ${(sourceY + targetY)/2 + 18})">
                        <!-- Background badge -->
                        <rect x="${(hasLatencyInfo && showLatency) && (hasBufferInfo && showBuffer) ? -30 : -20}" y="-8"
                              width="${(hasLatencyInfo && showLatency) && (hasBufferInfo && showBuffer) ? 60 : 40}" height="16" rx="8"
                              style="fill: var(--bg-secondary); stroke: var(--border-color); stroke-width: 1; fill-opacity: 0.95;" />

                        ${(hasLatencyInfo && showLatency) ? svg`
                            <!-- Latency value -->
                            <text x="${(hasBufferInfo && showBuffer) ? -15 : 0}" y="2"
                                  style="fill: ${latencyColor}; font-size: 8px; font-weight: bold; text-anchor: ${(hasBufferInfo && showBuffer) ? 'end' : 'middle'}; font-family: var(--font-mono, monospace);">
                                ${latencyText}
                            </text>
                        ` : ''}

                        ${(hasBufferInfo && showBuffer) ? svg`
                            <!-- Buffer percentage -->
                            <text x="${(hasLatencyInfo && showLatency) ? 15 : 0}" y="2"
                                  style="fill: ${bufferColor}; font-size: 8px; font-weight: bold; text-anchor: ${(hasLatencyInfo && showLatency) ? 'start' : 'middle'}; font-family: var(--font-mono, monospace);">
                                ${bufferText}
                            </text>
                        ` : ''}
                    </g>
                `)
            : null}

            <!-- Audio flow particles - only show on active non-control links and when animations enabled -->
            ${(active && animationsEnabled && !isControl) ? svg`
                <!-- Define the motion path (invisible, used only for particle animation) -->
                <path id="${motionPathId}" d="${pathD}" fill="none" stroke="none" />

                <!-- Particle 1 -->
                <circle r="4" fill="${particleColor}" opacity="0.9" style="filter: drop-shadow(0 0 4px ${particleColor});">
                    <animateMotion dur="${particleSpeed}s" repeatCount="indefinite">
                        <mpath href="#${motionPathId}" />
                    </animateMotion>
                    <animate attributeName="opacity" values="0;1;1;0" dur="${particleSpeed}s" repeatCount="indefinite" />
                </circle>

                <!-- Particle 2 (offset by 1/3 of the duration) -->
                <circle r="4" fill="${particleColor}" opacity="0.9" style="filter: drop-shadow(0 0 4px ${particleColor});">
                    <animateMotion dur="${particleSpeed}s" repeatCount="indefinite" begin="${particleSpeed / 3}s">
                        <mpath href="#${motionPathId}" />
                    </animateMotion>
                    <animate attributeName="opacity" values="0;1;1;0" dur="${particleSpeed}s" repeatCount="indefinite" begin="${particleSpeed / 3}s" />
                </circle>

                <!-- Particle 3 (offset by 2/3 of the duration) -->
                <circle r="4" fill="${particleColor}" opacity="0.9" style="filter: drop-shadow(0 0 4px ${particleColor});">
                    <animateMotion dur="${particleSpeed}s" repeatCount="indefinite" begin="${(particleSpeed * 2) / 3}s">
                        <mpath href="#${motionPathId}" />
                    </animateMotion>
                    <animate attributeName="opacity" values="0;1;1;0" dur="${particleSpeed}s" repeatCount="indefinite" begin="${(particleSpeed * 2) / 3}s" />
                </circle>
            ` : null}
        </g>
    `;
};
