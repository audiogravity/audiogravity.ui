/**
 * @module TestHistory
 * @description Persistent localStorage store for latency and network test results.
 * Stores up to MAX_ENTRIES results (newest first), shared across latency and network test components.
 */

const STORAGE_KEY = 'ag_test_history';
const MAX_ENTRIES = 10;

/**
 * @returns {Array} All saved test history entries, newest first.
 */
export function getTestHistory() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

/**
 * @param {Object} entry - Normalized history entry to prepend.
 */
function _save(entry) {
    const history = [entry, ...getTestHistory()].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

/**
 * Save a completed latency test result.
 * @param {Object} result - LatencyTestResult from backend.
 */
export function saveLatencyResult(result) {
    if (!result?.stats) return;
    _save({
        id: result.test_id,
        type: 'latency',
        timestamp: result.timestamp,
        min: result.stats.min_us,
        avg: result.stats.avg_us,
        max: result.stats.max_us,
        stddev: result.stats.stddev_us,
        threads: result.config?.threads,
        priority: result.config?.priority
    });
}

/**
 * Save a completed network test result.
 * @param {Object} result - NetworkTestResult from backend.
 */
export function saveNetworkResult(result) {
    if (!result?.stats) return;
    const s = result.stats;
    const type = s.test_type || 'ping';

    if (type === 'ping') {
        _save({
            id: result.test_id,
            type: 'ping',
            timestamp: result.timestamp,
            target: result.config?.target,
            min: s.min_ms,
            avg: s.avg_ms,
            max: s.max_ms,
            jitter: s.jitter_ms,
            loss: s.packet_loss
        });
    } else {
        const i = s.iperf3_stats || {};
        _save({
            id: result.test_id,
            type,
            timestamp: result.timestamp,
            server: result.config?.iperf3_config?.server,
            bandwidth: i.bandwidth_mbps,
            jitter: i.jitter_ms,
            loss: i.packet_loss_percent
        });
    }
}

/**
 * Clear all saved test history.
 */
export function clearTestHistory() {
    localStorage.removeItem(STORAGE_KEY);
}
