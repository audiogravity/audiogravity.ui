import { apiGet, buildAuthedUrl } from './api.js';
import { throttle, AppState, EventEmitter, AgTimerManager } from './common.js';

// =====================
// SERVER-SENT EVENTS (SSE)
// =====================

// PERFORMANCE MONITOR DATA (Phase 3)
export const sseStats = {
    totalEvents: 0,
    eventsByType: {},
    lastEventTime: null,
    eventsInLastSecond: 0,
    startTime: Date.now()
};

// Reset EPS counter every second
let eventCountThisSecond = 0;
if (typeof window !== 'undefined') {
    setInterval(() => {
        sseStats.eventsInLastSecond = eventCountThisSecond;
        eventCountThisSecond = 0;
    }, 1000);
}

// WORKER INITIALIZATION (Phase 3 Optimization #5)
let sseWorker = null;

/**
 * Handle messages from the SSE Worker
 */
function handleWorkerMessage(e) {
    const { type, data, error } = e.data;
    
    if (type === 'error') {
        console.error('SSE Worker Error:', error);
        updateConnectionStatus(false);
        return;
    }

    if (type === 'open') {
        updateConnectionStatus(true);
        return;
    }

    if (type === 'disconnected') {
        updateConnectionStatus(false);
        return;
    }

    // Update Stats (Phase 3)
    const now = Date.now();
    sseStats.totalEvents++;
    sseStats.lastEventTime = now;
    sseStats.eventsByType[type] = (sseStats.eventsByType[type] || 0) + 1;
    eventCountThisSecond++;

    // Emit event for visualizers
    if (window.EventEmitter || EventEmitter) {
        (window.EventEmitter || EventEmitter).emit('sse-event-received', {
            type: type,
            data: data,
            timestamp: now
        });
    }

    // Route event to handlers
    switch (type) {
        case 'connected':
            updateConnectionStatus(true);
            AppState.connectionId = data.connection_id;
            break;
        case 'active_users':
            window.dispatchEvent(new CustomEvent('active_users_update', { detail: data }));
            break;
        case 'sysinfo':
            // Use the original throttled function
            throttledUpdateSystemMetrics(data);
            break;
        case 'services_metrics':
            throttledServicesMetrics(data);
            break;
        case 'service_action':
            (window.EventEmitter || EventEmitter).emit('service-action', data);
            break;
        case 'profile_state':
            window.dispatchEvent(new CustomEvent('profile-state-update', { detail: data }));
            break;
        case 'package_state':
            window.dispatchEvent(new CustomEvent('package-state-update', { detail: data }));
            break;
        case 'package_log':
            window.dispatchEvent(new CustomEvent('package-log-update', { detail: data }));
            break;
        case 'packages_updated':
            window.dispatchEvent(new CustomEvent('packages_sync', { detail: data }));
            break;
        case 'sys_log':
            window.dispatchEvent(new CustomEvent('sys-log-update', { detail: data }));
            break;
        case 'profile_metrics':
            if (data.profile_id && data.metrics) {
                (window.EventEmitter || EventEmitter).emit('profile-metrics-update', data);
            }
            break;
        case 'latency_test_progress':
            (window.EventEmitter || EventEmitter).emit('latency-test-progress', data);
            break;
        case 'network_test_progress':
            (window.EventEmitter || EventEmitter).emit('network_test_progress', data);
            break;
        case 'audio_pipeline':
            window.dispatchEvent(new CustomEvent('audio-pipeline-update', { detail: data }));
            break;
    }
}

// Create throttled wrappers once
const throttledUpdateSystemMetrics = throttle(updateSystemMetrics, 1000);
const throttledServicesMetrics = throttle((data) => {
    const services = data.services || {};
    for (const [serviceId, metrics] of Object.entries(services)) {
        (window.EventEmitter || EventEmitter).emit('service-metrics-sse', { serviceId, metrics });
    }
}, 1000);

export function connectSSE() {
    const sseUrl = buildAuthedUrl('/sse/dashboard');
    console.log('[SSE] Connecting to:', sseUrl);

    if (!sseWorker) {
        // Initialize worker on first connection
        try {
            // Use absolute path from root for maximum compatibility
            // (Vite serves public/js/sse-worker.js at /js/sse-worker.js)
            sseWorker = new Worker('/js/sse-worker.js');
            sseWorker.onmessage = handleWorkerMessage;
            AppState.sseConnection = sseWorker;
        } catch (e) {
            console.error('Failed to create SSE Worker, falling back to main thread (disabled for now):', e);
            return;
        }
    }

    // Always send the connect command with the new URL
    sseWorker.postMessage({ action: 'connect', url: sseUrl.toString() });
}

/**
 * OPTIMIZATION: Visibility API to pause SSE and timers when tab is hidden
 * PERFORMANCE OPTIMIZATION (Phase 1): Now also stops uptime updates
 */
export function initVisibilityManager() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('App hidden: stopping SSE and timers');
            if (sseWorker) {
                sseWorker.postMessage({ action: 'close' });
                // We don't terminate the worker, just close the connection
                // But we clear the references to trigger a fresh connect later
                AppState.sseConnection = null;
                AppState.connected = false;
                updateConnectionStatus(false);
            }
            // Stop uptime timer (Phase 1 optimization)
            // AgTimerManager handles this automatically now, but we keep this event for other components

            // Emit event to stop tab-specific polling
            if (window.EventEmitter || EventEmitter) {
                (window.EventEmitter || EventEmitter).emit('app-hidden');
            }
        } else {
            console.log('App visible: restarting SSE');
            connectSSE();
            // Restart uptime timer (Phase 1 optimization)
            // AgTimerManager handles this automatically now, but we keep this event for other components

            // Emit event to resume current tab polling
            if (window.EventEmitter || EventEmitter) {
                (window.EventEmitter || EventEmitter).emit('app-visible', AppState.currentTab);
            }
        }
    });
}

export function updateConnectionStatus(connected) {
    AppState.connected = connected;

    // Notify components like ag-top-bar and ag-footer
    if (window.EventEmitter || EventEmitter) {
        (window.EventEmitter || EventEmitter).emit('connection-status', { connected });
    }
}

export function updateSystemMetrics(data) {
    // Map uptime_seconds to uptime for compatibility with UI components (Phase 3)
    if (data.uptime_seconds !== undefined && data.uptime === undefined) {
        data.uptime = data.uptime_seconds;
    }

    // Notify components like ag-top-bar and individual tiles (System tab)
    if (window.EventEmitter || EventEmitter) {
        (window.EventEmitter || EventEmitter).emit('sysinfo-update', data);
    }
}

export async function loadInitialMetrics() {
    try {
        const data = await apiGet('/sysinfo/current');
        updateSystemMetrics(data);
    } catch (error) {
        console.error('Failed to load initial metrics:', error);
    }
}

async function loadUptime() {
    try {
        const status = await apiGet('/sysinfo/status');

        if ((window.EventEmitter || EventEmitter) && status.uptime_seconds !== undefined) {
            (window.EventEmitter || EventEmitter).emit('sysinfo-update', { uptime: status.uptime_seconds });
        }
    } catch (error) {
        console.error('Failed to load uptime:', error);
    }
}

// PERFORMANCE OPTIMIZATION (Phase 3):
// Uptime is now included in the 'sysinfo' SSE event.
// We no longer need a separate timer for it.
export function startUptimeUpdates() {
    loadUptime(); // Initial load
    // Timer removed in favor of SSE (Full-SSE Migration)
}


// Global attachment for legacy code
if (typeof window !== 'undefined') {
    window.connectSSE = connectSSE;
}
