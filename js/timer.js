/**
 * PERFORMANCE OPTIMIZATION (Phase 3): Centralized Timer Manager
 * Manages all intervals and timeouts in the application to ensure
 * proper cleanup and visibility-aware execution.
 */
export const AgTimerManager = {
    _timers: new Map(),
    _isAppHidden: document.hidden,

    /**
     * Register a new interval timer
     * @param {string} id - Unique identifier for the timer
     * @param {Function} callback - Function to execute
     * @param {number} interval - Interval in ms
     * @param {boolean} pauseOnHidden - Whether to stop when tab is hidden (default: true)
     */
    setInterval(id, callback, interval, pauseOnHidden = true) {
        this.clearInterval(id); // Ensure no duplicate

        const timer = {
            callback,
            interval,
            pauseOnHidden,
            timerId: null,
            running: false,
            ticks: 0 // Track number of executions
        };

        this._timers.set(id, timer);

        if (!this._isAppHidden || !pauseOnHidden) {
            this._startTimer(id);
        }

        return id;
    },

    /**
     * Clear an existing timer
     * @param {string} id - Timer identifier
     */
    clearInterval(id) {
        const timer = this._timers.get(id);
        if (timer) {
            if (timer.timerId) {
                clearInterval(timer.timerId);
            }
            this._timers.delete(id);
        }
    },

    /**
     * Internal: Start a specific timer
     */
    _startTimer(id) {
        const timer = this._timers.get(id);
        if (timer && !timer.running) {
            timer.timerId = setInterval(() => {
                timer.ticks++;
                timer.callback();
            }, timer.interval);
            timer.running = true;
        }
    },

    /**
     * Internal: Stop a specific timer without removing it
     */
    _stopTimer(id) {
        const timer = this._timers.get(id);
        if (timer && timer.running) {
            if (timer.timerId) {
                clearInterval(timer.timerId);
                timer.timerId = null;
            }
            timer.running = false;
        }
    },

    /**
     * Handle app visibility changes
     */
    _handleVisibilityChange(hidden) {
        this._isAppHidden = hidden;
        for (const [id, timer] of this._timers.entries()) {
            if (timer.pauseOnHidden) {
                if (hidden) {
                    this._stopTimer(id);
                } else {
                    this._startTimer(id);
                }
            }
        }
    },

    /**
     * Debugging: Get status of all active timers
     */
    listActiveTimers() {
        const result = [];
        for (const [id, timer] of this._timers.entries()) {
            result.push({
                id,
                interval: timer.interval,
                pauseOnHidden: timer.pauseOnHidden,
                running: timer.running,
                ticks: timer.ticks
            });
        }
        return result;
    }
};

// Make globally available for legacy support
if (typeof window !== 'undefined') {
    window.AgTimerManager = AgTimerManager;
    
    // Listen for visibility events to manage timers automatically
    document.addEventListener('visibilitychange', () => {
        AgTimerManager._handleVisibilityChange(document.hidden);
    });
}
