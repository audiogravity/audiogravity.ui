/**
 * @module PWAManager
 * @description Manages PWA features: offline status indicator and local data
 * snapshotting for offline viewing.
 *
 * It used to warm a cache as well, importing nine heavy organisms at idle on every
 * page load — the pipeline views, the test pages, the editors, the dashboard — so that
 * they would be cached for offline use. They already are: the service worker precaches
 * every chunk Vite emits, those nine included, at install. So the warm-up filled
 * nothing and instead EXECUTED nine modules on each load (cytoscape among them),
 * registering their elements and holding their memory — undoing the lazy loading the
 * page structure exists to provide, on a box whose spare CPU is the audio's.
 * The trade accepted by removing it: the first visit to one of those tabs now parses
 * its chunk, which is read from the cache rather than the network.
 */

import { EventEmitter } from './common.js';
import { setSnapshotStore } from './core/FetchController.js';

/**
 * How long writes are coalesced before reaching localStorage.
 *
 * `localStorage.setItem` is SYNCHRONOUS on the main thread, and the metrics stream fires
 * every 10 s while the pipeline fires on every change — so the interface was serialising
 * and writing a snapshot several times a minute, for the whole time it was open, on a box
 * whose spare CPU belongs to the audio (CLAUDE.md §12). Only the last value of a key is
 * ever restored, so every write before it was pure cost.
 *
 * 5 s, the same figure and the same reasoning as the player-state snapshot in
 * js/library-store.js, which already debounces for exactly this.
 */
const SNAPSHOT_DEBOUNCE_MS = 5_000;

export const PWAManager = {
    _isOffline: !navigator.onLine,

    /** Keyed values waiting to be written. A second write to a key replaces the first. */
    _pending: new Map(),
    _flushTimer: null,

    init() {
        // 0. Let panels that fetch their own data save and restore it. Registered first,
        // before anything can fetch, so the very first load is already snapshotted.
        setSnapshotStore({
            read: (key) => this.readSnapshot(key),
            write: (key, data) => this._saveSnapshot(key, data),
        });

        // 1. Initial status check
        this._updateStatus();

        // 2. Event listeners for connectivity
        window.addEventListener('online', () => this._handleOnline());
        window.addEventListener('offline', () => this._handleOffline());

        // 2bis. Write anything still queued before the app can be put away. `pagehide` is
        // the one an installed iOS app reliably gets; `visibilitychange` covers a switch to
        // another app, which is far more common than an actual close.
        window.addEventListener('pagehide', () => this._flushSnapshots());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this._flushSnapshots();
        });

        // 3. If starting offline, load snapshots into the app
        if (!navigator.onLine) {
            this._loadSnapshots();
        }

        // 4. Setup snapshot listeners (save data while online)
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

        // Services and profiles are NOT collected here any more. They were saved from
        // the `*-list-update` events the pages emit after a load, which publish the list
        // while the page itself reads back `{config, …}` — so what was stored could never
        // have been restored. Their panels now snapshot through their own FetchController
        // (`snapshotKey`), where saving and restoring are the same object by construction.
        //
        // The fourth one is gone rather than repaired: `profile-changed` was stored as
        // `activeProfile` and replayed under the name `profile-status-update`, which
        // nothing in the tree emits or listens to. Replaying `profile-changed` instead
        // would not have fixed it — it would tell ag-services-page that a profile had
        // just changed, which is false on a restore.
    },

    /**
     * Queue a snapshot. The write itself happens at most once per
     * {@link SNAPSHOT_DEBOUNCE_MS}, and immediately when the app is put away.
     * @param {string} key - Snapshot name, e.g. 'metrics'.
     * @param {*} data - Payload to keep.
     */
    _saveSnapshot(key, data) {
        // The moment the reading was taken, not the moment it reaches storage — otherwise
        // the debounce would backdate every snapshot by up to five seconds.
        this._pending.set(key, { timestamp: Date.now(), data: data });
        if (this._flushTimer) return;
        this._flushTimer = setTimeout(() => {
            this._flushTimer = null;
            this._flushSnapshots();
        }, SNAPSHOT_DEBOUNCE_MS);
    },

    /**
     * Write every queued snapshot now. Called by the timer, and directly when the page is
     * hidden or unloaded — on iOS an app is put away far more often than it is closed, and
     * a queued snapshot that never reached storage would be lost for the next cold start,
     * which is the one moment it exists for.
     */
    _flushSnapshots() {
        if (this._flushTimer) {
            clearTimeout(this._flushTimer);
            this._flushTimer = null;
        }
        for (const [key, snapshot] of this._pending) {
            try {
                localStorage.setItem(`ag_snapshot_${key}`, JSON.stringify(snapshot));
            } catch (e) {
                // localStorage might be full
            }
        }
        this._pending.clear();
    },

    /**
     * The last state saved for `key` while online, or null.
     *
     * Public because a panel that fetches its own data restores it itself, through
     * FetchController's `snapshotKey` — see {@link setSnapshotStore}. The replay by
     * event below only covers the surfaces that have no fetch of their own.
     *
     * @param {string} key - Snapshot name, e.g. 'profiles'.
     * @returns {*} the saved payload, or null when absent or unreadable.
     */
    readSnapshot(key) {
        // A value still waiting to be written is newer than the stored one, and a panel
        // that fails right after a successful load would otherwise be handed the previous
        // reading — older by up to the debounce.
        if (this._pending.has(key)) return this._pending.get(key).data ?? null;
        try {
            const raw = localStorage.getItem(`ag_snapshot_${key}`);
            if (!raw) return null;
            const snapshot = JSON.parse(raw);
            return snapshot?.data ?? null;
        } catch (e) {
            console.warn(`[PWA] Unreadable snapshot for ${key}:`, e);
            return null;
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

        // Only what has no fetch of its own to restore from. Services and profiles come
        // back through their own panel now, which also re-emits its *-list-update event
        // on restore — so the tab counters are still fed, by the surface that owns them.
        const snapshots = {
            'metrics': 'sysinfo-update',
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
    },

    _handleOffline() {
        console.warn('📡 Lost connectivity');
        this._updateStatus();
    }
};
