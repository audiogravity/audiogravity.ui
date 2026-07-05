/**
 * @module LitUtils
 * @description Shared utility functions for Lit components to avoid duplication.
 */
import { html } from 'lit';
import { API_BASE_URL, API_KEY } from '../core/config.js';

/**
 * Run an async function while toggling `host._loading` (and resetting
 * `host._error` to null). On failure, the error is logged to the console
 * AND its message is stored in `host._error`. Components that don't render
 * `_error` still get the console trace — failures are never silent.
 * @template T
 * @param {object} host - Lit element instance.
 * @param {() => Promise<T>} fn - Async work to run.
 * @returns {Promise<T|undefined>} Result of `fn`, or undefined on failure.
 */
export async function loadWithState(host, fn) {
    host._loading = true;
    host._error   = null;
    try {
        return await fn();
    } catch (e) {
        console.error(`[${host.localName ?? 'host'}]`, e);
        host._error = e?.message ?? String(e);
    } finally {
        host._loading = false;
    }
}

/**
 * Wrap an ag-icons.js icon (the inner SVG content) in a sized `<svg>` element.
 * Centralises the `<svg viewBox="0 0 24 24">…</svg>` boilerplate otherwise
 * repeated across components, with the Lucide stroke convention of the icon set.
 * @param {import('lit').SVGTemplateResult} icon - An icon export from ag-icons.js.
 * @param {object} [opts]
 * @param {string} [opts.size='1em'] - width/height of the SVG.
 * @returns {import('lit').TemplateResult}
 */
export function svgIcon(icon, { size = '1em' } = {}) {
    return html`<svg viewBox="0 0 24 24" width=${size} height=${size} fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
}

/**
 * Dispatch a bubbling CustomEvent from an element.
 * @param {Element} el - Dispatch target
 * @param {string} type - Event type
 * @param {object} [detail] - Optional event detail payload
 */
export const emit = (el, type, detail) => {
    el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
};

/**
 * Build a cover-art URL from a cover token.
 * All tokens are resolved server-side via the cover proxy endpoint, regardless
 * of source (MPD, Roon, UPnP, AirPlay…). The backend handles fetch, caching
 * and MusicBrainz/iTunes fallback.
 * @param {string|null|undefined} token - Opaque cover token (e.g. "mb:artist:album", "url:http://…")
 * @returns {string} Absolute proxy URL or empty string when no token
 */
export const coverUrl = (token) => {
    if (!token) return '';
    // encodeURIComponent leaves ' unencoded; encode it to %27 so it doesn't
    // break CSS url('...') strings when the token contains apostrophes.
    const encoded = encodeURIComponent(token).replace(/'/g, '%27');
    return `${API_BASE_URL}/audio_pipeline/cover?token=${encoded}&api_key=${API_KEY}`;
};

/**
 * Pick which cover token a player should display as primary for an item.
 *
 * Default canonical layout: **track cover wins** when both a track cover
 * and a station logo are present. The station logo is the fallback when
 * no track cover exists (typical for a freshly-started radio stream
 * before ICY metadata has been parsed and resolved).
 *
 * The fullscreen player uses ``swapped=true`` to flip primary and
 * secondary (its dual-cover swap affordance). The mini player wants the
 * station logo as primary in radio mode, so it passes ``preferStation``.
 *
 * @param {object}  item                       NowPlayingItem or PlayerState.
 * @param {object}  [opts]
 * @param {boolean} [opts.swapped=false]       Flip the canonical primary / secondary when both tokens exist.
 * @param {boolean} [opts.preferStation=false] Treat the station logo as canonical (mini-player behaviour).
 * @returns {string|null}
 */
export const pickPrimaryCoverToken = (item, { swapped = false, preferStation = false } = {}) => {
    if (!item) return null;
    const station = item.station_logo_token;
    const track   = item.cover_token;
    if (station && track) {
        const stationIsPrimary = preferStation !== swapped;
        return stationIsPrimary ? station : track;
    }
    return track || station || null;
};

/**
 * Format seconds as M:SS string.
 * Returns '--:--' for null / undefined / NaN inputs.
 * @param {number|null|undefined} secs
 * @returns {string}
 */
export const fmtDuration = (secs) => {
    if (secs == null || isNaN(secs)) return '--:--';
    const s = Math.max(0, Math.floor(secs));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

/**
 * Format network or disk transfer rates
 * @param {number} rate - Rate in MB/s
 * @returns {string} Formatted string with unit
 */
export const formatRate = (rate) => {
    if (typeof rate !== 'number') return '0.0 MB/s';
    if (rate >= 1000) return `${(rate / 1000).toFixed(1)} GB/s`;
    if (rate >= 1) return `${rate.toFixed(1)} MB/s`;
    if (rate >= 0.001) return `${(rate * 1024).toFixed(0)} KB/s`;
    return `${(rate * 1024).toFixed(1)} KB/s`;
};

/**
 * Determine activity level based on percentage or value
 * Generic thresholds for system-wide metrics
 * @param {number} value - Value to check
 * @returns {string} 'high', 'medium', or 'low'
 */
export const getActivityLevel = (value) => {
    if (typeof value !== 'number') return 'low';
    if (value > 50) return 'high';
    if (value > 10) return 'medium';
    return 'low';
};

/**
 * Determine activity level for CPU usage of a single service (%)
 * Adapted for individual audio service context
 * @param {number} cpu - CPU usage percentage
 * @returns {string} 'high', 'medium', or 'low'
 */
export const getActivityLevelForCPU = (cpu) => {
    if (typeof cpu !== 'number') return 'low';
    // High: > 20% (DSP processing, upsampling, multiple streams)
    if (cpu > 20) return 'high';
    // Medium: > 5% (active streaming, normal playback)
    if (cpu > 5) return 'medium';
    // Low: ≤ 5% (idle or minimal activity)
    return 'low';
};

/**
 * Determine activity level for memory usage of a single service (MB)
 * Adapted for individual audio service context
 * @param {number} mem - Memory usage in MB
 * @returns {string} 'high', 'medium', or 'low'
 */
export const getActivityLevelForMemory = (mem) => {
    if (typeof mem !== 'number') return 'low';
    // High: > 100 MB (large buffers, cache, or multiple streams)
    if (mem > 100) return 'high';
    // Medium: > 30 MB (active streaming with normal buffers)
    if (mem > 30) return 'medium';
    // Low: ≤ 30 MB (idle or minimal footprint)
    return 'low';
};

/**
 * Determine activity level for network/disk rates (MB/s)
 * Adapted for audio streaming context
 * @param {number} rate - Rate in MB/s
 * @returns {string} 'high', 'medium', or 'low'
 */
export const getActivityLevelForRate = (rate) => {
    if (typeof rate !== 'number') return 'low';
    // High: > 5 MB/s (multiple Hi-Res streams or heavy I/O)
    if (rate > 5) return 'high';
    // Medium: > 1 MB/s (active streaming, FLAC or Hi-Res)
    if (rate > 1) return 'medium';
    // Low: ≤ 1 MB/s (idle, compressed audio, or single stream)
    return 'low';
};
/**
 * Safely format a number to fixed decimal places
 * @param {number|null|undefined} value - Value to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @param {string} fallback - Fallback value if input is invalid (default: '--')
 * @returns {string} Formatted number or fallback
 */
export const safeToFixed = (value, decimals = 1, fallback = '--') => {
    if (value === null || value === undefined || isNaN(value)) {
        return fallback;
    }
    try {
        return Number(value).toFixed(decimals);
    } catch (e) {
        return fallback;
    }
};

/**
 * Format memory size in MB to human-readable format
 * @param {number} memoryMb - Memory in megabytes
 * @returns {string} Formatted memory string (e.g., "512 MB", "1.5 GB")
 */
export const formatMemory = (memoryMb) => {
    if (memoryMb === null || memoryMb === undefined || isNaN(memoryMb)) {
        return '--';
    }
    if (memoryMb < 1024) {
        return `${memoryMb.toFixed(0)} MB`;
    }
    return `${(memoryMb / 1024).toFixed(1)} GB`;
};

/**
 * Format uptime in seconds to human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted uptime (e.g., "2d 5h", "3h 45m", "30m")
 */
export const formatUptime = (seconds) => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) {
        return '--';
    }

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${mins}m`;
    } else {
        return `${mins}m`;
    }
};

/**
 * Format ISO timestamp to relative time or absolute time
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string} Formatted time (e.g., "Just now", "5m ago", "2h ago")
 */
export const formatTimestamp = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Map a topology output port ID to a short display label.
 * @param {string|null|undefined} id - Port identifier (e.g. "usb", "toslink")
 * @returns {string|null} Short label or null when id is falsy
 */
export const connectorLabel = (id) => {
    const MAP = { usb: 'USB', toslink: 'TOSLINK', coaxial: 'S/PDIF', xlr: 'XLR', rca: 'RCA', 'usb-a': 'USB', 'usb-c': 'USB-C' };
    return id ? (MAP[id.toLowerCase()] ?? id.toUpperCase()) : null;
};

/**
 * Automatically adjusts the height of a textarea based on its content
 * @param {HTMLTextAreaElement} element - The textarea element to resize
 */
export const autoExpandTextarea = (element) => {
    if (!element || element.tagName !== 'TEXTAREA') return;

    // Reset height to get correct scrollHeight
    element.style.height = 'auto';

    // Set new height based on scrollHeight
    const newHeight = element.scrollHeight;
    element.style.height = `${newHeight}px`;
};

/**
 * Load a connection state into `host._connection`, toggling `host._loading`.
 * Shared by Qobuz, Tidal and HQPlayer output molecules to avoid identical boilerplate.
 *
 * @param {LitElement} host     - The component instance.
 * @param {Function}   fetchFn  - Async function that fetches the connection (e.g. `() => apiGet('/qobuz/connection')`).
 * @param {string}     tag      - Log prefix for warnings (e.g. 'qobuz').
 */
export async function loadConnection(host, fetchFn, tag = 'connection') {
    host._loading = true;
    try {
        host._connection = await fetchFn();
    } catch (e) {
        console.warn(`[${tag}] Load connection failed:`, e.message);
        host._connection = null;
    }
    host._loading = false;
}
