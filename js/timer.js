/**
 * PERFORMANCE OPTIMIZATION (Phase 3): Centralized Timer Manager
 * Manages all intervals and timeouts in the application to ensure
 * proper cleanup and visibility-aware execution.
 */
export const AgTimerManager = {
    _timers: new Map(),
    _isAppHidden: document.hidden,
    _lowPowerMode: false,
    _lowPowerFactor: 3, // Intervals are 3x longer in low power mode
    _manualOverride: false,

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
     * Set Low Power Mode
     * @param {boolean} enabled - Whether to enable low power mode
     */
    setLowPowerMode(enabled, isManual = false) {
        // If it's a battery event but we are in manual mode, ignore it
        if (!isManual && this._manualOverride) return;
        
        if (isManual) this._manualOverride = true;
        if (this._lowPowerMode === enabled) return;
        
        console.log(`[TimerManager] Low Power Mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
        this._lowPowerMode = enabled;
        
        // Update UI class
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('low-power-mode', enabled);
        }
        
        // Notify components
        if (window.EventEmitter) {
            window.EventEmitter.emit('low-power-mode-changed', { enabled });
        }

        // Restart all running timers with new effective intervals
        for (const id of this._timers.keys()) {
            const timer = this._timers.get(id);
            if (timer.running) {
                this._stopTimer(id);
                // Only restart if visibility rules allow
                if (!this._isAppHidden || !timer.pauseOnHidden) {
                    this._startTimer(id);
                }
            }
        }
    },

    /**
     * Internal: Start a specific timer
     */
    _startTimer(id) {
        const timer = this._timers.get(id);
        if (timer && !timer.running) {
            const effectiveInterval = this._lowPowerMode ? timer.interval * this._lowPowerFactor : timer.interval;
            timer.timerId = setInterval(() => {
                timer.ticks++;
                timer.callback();
            }, effectiveInterval);
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
                effectiveInterval: this._lowPowerMode ? timer.interval * this._lowPowerFactor : timer.interval,
                pauseOnHidden: timer.pauseOnHidden,
                running: timer.running,
                ticks: timer.ticks
            });
        }
        return result;
    },
    /**
     * Reset manual override and return to automatic battery tracking
     */
    resetPowerMode() {
        this._manualOverride = false;
        // The next battery event will restore the correct state
    }
};

/**
 * Battery and Power Management Initialization
 */
function initPowerManager() {
    if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
        console.log('[PowerManager] Battery API not supported');
        return;
    }

    navigator.getBattery().then(battery => {
        const updateLowPowerState = () => {
            // Logic: Low power if battery < 20% and NOT charging
            const isLowBattery = battery.level <= 0.20;
            const isCharging = battery.charging;
            
            console.log(`[PowerManager] Level: ${Math.round(battery.level * 100)}%, Charging: ${isCharging}, LowBattery: ${isLowBattery}`);
            AgTimerManager.setLowPowerMode(isLowBattery && !isCharging);
        };

        // Listen for changes
        battery.addEventListener('chargingchange', updateLowPowerState);
        battery.addEventListener('levelchange', updateLowPowerState);
        
        // Initial check with small delay to ensure EventEmitter and other systems are ready
        setTimeout(updateLowPowerState, 500);
    });
}

// Make globally available for legacy support
if (typeof window !== 'undefined') {
    window.AgTimerManager = AgTimerManager;
    
    // Listen for visibility events to manage timers automatically
    document.addEventListener('visibilitychange', () => {
        AgTimerManager._handleVisibilityChange(document.hidden);
    });

    // Initialize power management on DOM load or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPowerManager);
    } else {
        initPowerManager();
    }
}
