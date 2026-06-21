import { AppState, MemoryCache } from './common.js';

// =====================
// CONSTANTS
// =====================
const HISTORY_MAX_ITEMS = 20;

// =====================
// HISTORY MANAGEMENT
// =====================

export function addToHistory(type, action, success = true) {
    let history, storageKey;

    switch (type) {
        case 'profile':
            history = AppState.profileHistory;
            storageKey = 'profileHistory';
            break;
        case 'service':
            history = AppState.serviceHistory;
            storageKey = 'serviceHistory';
            break;
        case 'software':
            history = AppState.softwareHistory;
            storageKey = 'softwareHistory';
            break;
        case 'systemd':
            history = AppState.systemdHistory;
            storageKey = 'systemdHistory';
            break;
        case 'performance':
            history = AppState.performanceHistory;
            storageKey = 'performanceHistory';
            break;
        case 'config':
            history = AppState.configHistory;
            storageKey = 'configHistory';
            break;
        case 'admin':
            history = AppState.adminHistory;
            storageKey = 'adminHistory';
            break;
        case 'audio_pipeline':
            history = AppState.pipelineHistory;
            storageKey = 'pipelineHistory';
            break;
        default:
            console.warn('Unknown history type:', type);
            return;
    }

    const item = {
        timestamp: new Date().toISOString(),
        action: action,
        success: success
    };

    history.unshift(item);

    // OPTIMIZATION: Circular buffer - remove oldest item instead of splice
    // splice() is O(n), pop() is O(1)
    if (history.length > HISTORY_MAX_ITEMS) {
        history.pop(); // Remove oldest item (more efficient than splice)
    }

    // Save to localStorage using MemoryCache
    MemoryCache.set(storageKey, history);

    // Update display
    renderHistory(type);
}

export function renderHistory(type) {
    let history;

    switch (type) {
        case 'profile':
            history = AppState.profileHistory;
            break;
        case 'service':
            history = AppState.serviceHistory;
            break;
        case 'software':
            history = AppState.softwareHistory || [];
            break;
        case 'systemd':
            history = AppState.systemdHistory;
            break;
        case 'performance':
            history = AppState.performanceHistory;
            break;
        case 'config':
            history = AppState.configHistory;
            break;
        case 'admin':
            history = AppState.adminHistory;
            break;
        case 'audio_pipeline':
            history = AppState.pipelineHistory || [];
            break;
        default:
            return;
    }

    // Find the ag-history-panel component for this type
    const historyPanel = document.querySelector(`ag-history-panel[type="${type}"]`);
    if (historyPanel) {
        historyPanel.items = [...history]; // Trigger reactivity with a new array reference
    }
}

export function clearHistory(type) {
    let storageKey;

    switch (type) {
        case 'profile':
            AppState.profileHistory = [];
            storageKey = 'profileHistory';
            break;
        case 'service':
            AppState.serviceHistory = [];
            storageKey = 'serviceHistory';
            break;
        case 'software':
            AppState.softwareHistory = [];
            storageKey = 'softwareHistory';
            break;
        case 'systemd':
            AppState.systemdHistory = [];
            storageKey = 'systemdHistory';
            break;
        case 'performance':
            AppState.performanceHistory = [];
            storageKey = 'performanceHistory';
            break;
        case 'config':
            AppState.configHistory = [];
            storageKey = 'configHistory';
            break;
        case 'admin':
            AppState.adminHistory = [];
            storageKey = 'adminHistory';
            break;
        case 'audio_pipeline':
            AppState.pipelineHistory = [];
            storageKey = 'pipelineHistory';
            break;
    }

    if (storageKey) {
        MemoryCache.set(storageKey, []);
        renderHistory(type);
    }
}

// Global attachment for legacy code
if (typeof window !== 'undefined') {
    window.addToHistory = addToHistory;
}
