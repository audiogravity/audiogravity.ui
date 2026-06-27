/**
 * SSE WEB WORKER (Phase 3 Optimization #5)
 * Handles SSE connection and JSON parsing in a separate thread.
 */

let eventSource = null;
let reconnectTimer = null;

// Reconnection delay
const SSE_RECONNECT_DELAY = 3000;

/**
 * Connect to SSE
 */
function connect(url) {
    if (eventSource) {
        eventSource.close();
    }

    try {
        eventSource = new EventSource(url);
        
        // Helper to forward events
        const forward = (type, data) => {
            self.postMessage({ type, data });
        };

        const parseAndForward = (type) => {
            return (event) => {
                try {
                    const data = JSON.parse(event.data);
                    forward(type, data);
                } catch (e) {
                    self.postMessage({ type: 'error', error: `Parse error for ${type}: ${e.message}` });
                }
            };
        };

        // Standard event listeners
        eventSource.addEventListener('connected', parseAndForward('connected'));
        eventSource.addEventListener('active_users', parseAndForward('active_users'));
        eventSource.addEventListener('service_action', parseAndForward('service_action'));
        eventSource.addEventListener('profile_state', parseAndForward('profile_state'));
        eventSource.addEventListener('package_state', parseAndForward('package_state'));
        eventSource.addEventListener('package_log', parseAndForward('package_log'));
        eventSource.addEventListener('packages_updated', parseAndForward('packages_updated'));
        eventSource.addEventListener('sys_log', parseAndForward('sys_log'));
        eventSource.addEventListener('profile_metrics', parseAndForward('profile_metrics'));
        eventSource.addEventListener('latency_test_progress', parseAndForward('latency_test_progress'));
        eventSource.addEventListener('network_test_progress', parseAndForward('network_test_progress'));
        eventSource.addEventListener('audio_pipeline', parseAndForward('audio_pipeline'));
        eventSource.addEventListener('renderer_status', parseAndForward('renderer_status'));
        eventSource.addEventListener('disconnected', () => forward('disconnected'));

        // Throttled events
        eventSource.addEventListener('sysinfo', parseAndForward('sysinfo'));
        eventSource.addEventListener('services_metrics', parseAndForward('services_metrics'));

        eventSource.onopen = () => forward('open');
        
        eventSource.onerror = (e) => {
            forward('error', 'SSE connection failed');
            eventSource.close();
            
            // Reconnect
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
                connect(url);
            }, SSE_RECONNECT_DELAY);
        };

    } catch (e) {
        self.postMessage({ type: 'error', error: `Connection error: ${e.message}` });
        setTimeout(() => connect(url), SSE_RECONNECT_DELAY);
    }
}

// Global Message Handler
self.onmessage = (e) => {
    const { action, url } = e.data;
    
    if (action === 'connect') {
        connect(url);
    } else if (action === 'close') {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }
};
