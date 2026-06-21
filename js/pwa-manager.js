/**
 * @module PWAManager
 * @description Manages PWA features: offline status indicator, cache warming,
 * and local data snapshotting for offline viewing.
 */

import { EventEmitter } from './common.js';

export const PWAManager = {
    _isOffline: !navigator.onLine,
    _lazyModulesWarmed: false,

    init() {
        // 1. Initial status check
        this._updateStatus();

        // 2. Event listeners for connectivity
        window.addEventListener('online', () => this._handleOnline());
        window.addEventListener('offline', () => this._handleOffline());

        // 3. Early warmup if online (idle time)
        if (navigator.onLine) {
            this._scheduleWarmup();
        } else {
            // 4. If starting offline, load snapshots into the app
            this._loadSnapshots();
        }

        // 5. Setup snapshot listeners (save data while online)
        this._setupSnapshotListeners();

        console.log('⚡ PWA Manager initialized');
    },

    _updateStatus() {
        this._isOffline = !navigator.onLine;
        if (this._isOffline) {
            document.body.classList.add('is-offline');
            this._loadSnapshots(); // Also load snapshots on status change
        } else {
            document.body.classList.remove('is-offline');
        }
        
        // Notify the app
        if (window.EventEmitter || EventEmitter) {
            const bus = window.EventEmitter || EventEmitter;
            bus.emit('connectivity-changed', { online: !this._isOffline });
        }
    },

    _setupSnapshotListeners() {
        const bus = window.EventEmitter || EventEmitter;
        if (!bus) return;

        // Save system metrics
        bus.on('sysinfo-update', (data) => {
            if (!this._isOffline) this._saveSnapshot('metrics', data);
        });

        // Save audio pipeline (Window Event from sse.js)
        window.addEventListener('audio-pipeline-update', (e) => {
            if (!this._isOffline) this._saveSnapshot('pipeline', e.detail);
        });

        // Save services state (from ag-services-page.js)
        bus.on('services-list-update', (data) => {
            if (!this._isOffline) this._saveSnapshot('services', data);
        });

        // Save profiles state
        bus.on('profiles-list-update', (data) => {
            if (!this._isOffline) this._saveSnapshot('profiles', data);
        });

        // Save active profile
        bus.on('profile-changed', (data) => {
            if (!this._isOffline) this._saveSnapshot('activeProfile', data);
        });
    },

    _saveSnapshot(key, data) {
        try {
            const snapshot = {
                timestamp: Date.now(),
                data: data
            };
            localStorage.setItem(`ag_snapshot_${key}`, JSON.stringify(snapshot));
        } catch (e) {
            // localStorage might be full
        }
    },

    /**
     * Re-emit saved data when offline so components aren't empty
     */
    _loadSnapshots() {
        if (!this._isOffline) return;
        const bus = window.EventEmitter || EventEmitter;
        if (!bus) return;

        console.log('[PWA] Loading offline snapshots...');

        const snapshots = {
            'metrics': 'sysinfo-update',
            'services': 'services-list-update',
            'profiles': 'profiles-list-update',
            'activeProfile': 'profile-status-update'
        };

        // Load EventEmitter based snapshots
        Object.entries(snapshots).forEach(([storageKey, eventName]) => {
            const raw = localStorage.getItem(`ag_snapshot_${storageKey}`);
            if (raw) {
                try {
                    const snapshot = JSON.parse(raw);
                    console.log(`[PWA] Restoring snapshot for ${eventName} (${new Date(snapshot.timestamp).toLocaleTimeString()})`);
                    bus.emit(eventName, snapshot.data);
                } catch (e) {
                    console.warn(`[PWA] Failed to restore snapshot for ${storageKey}:`, e);
                }
            }
        });

        // Load Window Event based snapshots (Pipeline)
        const pipeRaw = localStorage.getItem('ag_snapshot_pipeline');
        if (pipeRaw) {
            try {
                const snapshot = JSON.parse(pipeRaw);
                console.log('[PWA] Restoring pipeline snapshot');
                window.dispatchEvent(new CustomEvent('audio-pipeline-update', { detail: snapshot.data }));
            } catch (e) {
                console.warn('[PWA] Failed to restore pipeline snapshot:', e);
            }
        }
    },

    _handleOnline() {
        console.log('🌐 Back online');
        this._updateStatus();
        this._scheduleWarmup();
    },

    _handleOffline() {
        console.warn('📡 Lost connectivity');
        this._updateStatus();
    },

    /**
     * Cache Warming: Pre-fetch lazy loaded modules when network is idle
     */
    _scheduleWarmup() {
        if (this._lazyModulesWarmed) return;

        // Use requestIdleCallback if available, or a timeout
        const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 5000));
        
        schedule(() => {
            this._warmupLazyModules();
        });
    },

    async _warmupLazyModules() {
        if (this._lazyModulesWarmed || !navigator.onLine) return;
        
        console.log('[PWA] Warming up lazy modules cache...');

        try {
            // We must use explicit string literals for Vite to analyze and hash the paths correctly at build time.
            // These imports will trigger the Service Worker to cache the chunks.
            await Promise.allSettled([
                import('./components/organisms/ag-audio-pipeline.js'),
                import('./components/organisms/ag-mobile-pipeline.js'),
                import('./components/organisms/ag-latency-test.js'),
                import('./components/organisms/ag-network-test.js'),
                import('./components/organisms/ag-perf-monitor.js'),
                import('./components/organisms/ag-audio-software-page.js'),
                import('./components/organisms/ag-config-editor.js'),
                import('./components/organisms/ag-systemd-override-editor.js'),
                import('./components/organisms/ag-system-dashboard.js')
            ]);
            
            this._lazyModulesWarmed = true;
            console.log('✅ Cache warming complete. All modules ready for offline usage.');
        } catch (err) {
            console.error('[PWA] Cache warming failed:', err);
        }
    }
};
