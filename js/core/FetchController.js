/**
 * @module FetchController
 * @description Lit Reactive Controller that encapsulates the boilerplate code
 * for fetching data (loading state, try/catch, error handling).
 * 
 * Usage:
 * this.userData = new FetchController(this, { url: '/api/users' });
 * 
 * render() {
 *    if (this.userData.loading) return html`<ag-skeleton-loader></ag-skeleton-loader>`;
 *    if (this.userData.error) return html`<div class="error">${this.userData.error}</div>`;
 *    return html`<div>${this.userData.data.name}</div>`;
 * }
 */

import { apiGet } from '../api.js';
import { getUserFriendlyError } from '../ui-helpers.js';
import { isNetworkError } from '../net-errors.js';

/**
 * Reads the last state saved while online, by key. Injected rather than imported so
 * this module keeps no dependency on the PWA layer — `core/` is called from everywhere
 * and importing the snapshot store here would drag it into every bundle that fetches.
 * @type {?(function(string): *)}
 */
let _readSnapshot = null;

/** Saves a state for the next offline start, by key. Injected like the reader. */
let _writeSnapshot = null;

/**
 * Register the snapshot store. Called once by the PWA manager at startup; until then a
 * failed fetch behaves exactly as it always has.
 *
 * Save and restore go through the SAME object — whatever `fetchFn` returned — so the
 * shape cannot drift between the two. The snapshots used to be collected by listening
 * to the events the pages emit after a load, which carried a different shape from the
 * one the page reads back (`profiles-list-update` publishes the list, the page consumes
 * `{config, detailedProfiles}`), and the mismatch was invisible because nothing ever
 * restored them.
 *
 * @param {?{read: function(string): *, write: function(string, *): void}} store
 */
export function setSnapshotStore(store) {
    _readSnapshot = store ? store.read : null;
    _writeSnapshot = store ? store.write : null;
}

export class FetchController {
    /**
     * @param {import('lit').ReactiveElement} host - The component host
     * @param {Object} options
     * @param {string|Function} options.url - The URL to fetch, or a function returning a URL
     * @param {Function} [options.fetchFn] - Custom fetch function if not using standard apiGet
     * @param {boolean} [options.autoFetch=true] - Whether to fetch automatically when host connects
     * @param {*} [options.initialData=null] - Initial data before fetch completes
     * @param {Function} [options.onSuccess] - Callback when fetch succeeds. Also called
     *        when a snapshot is served, with the snapshot — it is the one function that
     *        knows how to unpack this panel's payload.
     * @param {Function} [options.onError] - Callback when fetch fails, as
     *        `(err, message, {servedSnapshot})`. ⚠️ When `servedSnapshot` is true the
     *        panel is showing data and `this.error` is null: do not render `message`
     *        from here without checking, or an error appears beside live-looking content.
     * @param {string} [options.snapshotKey] - Key of the state saved while online. When a
     *        fetch fails *because nothing answered* and a snapshot exists, it is served
     *        instead of the error and `stale` is raised, so the offline banner's promise
     *        of cached data holds for this panel too. A failure that carries a status
     *        (401, 500…) is reported as before. Without a key, nothing changes.
     * @param {Function} [options.snapshotWhen] - Guard on what may be SAVED, as
     *        `(data) => boolean`. For a fetchFn that degrades rather than throws: a
     *        payload full of placeholders is a valid thing to display now and a terrible
     *        thing to restore later.
     */
    constructor(host, options = {}) {
        this.host = host;
        this.options = {
            autoFetch: true,
            initialData: null,
            ...options
        };

        this.data = this.options.initialData;
        this.loading = false;
        this.error = null;
        /** @type {boolean} Serving a snapshot saved while online, not a live answer. */
        this.stale = false;
        this._disconnected = false;

        // Register controller with host to hook into lifecycle
        host.addController(this);
    }

    hostConnected() {
        this._disconnected = false;
        if (this.options.autoFetch && (this.options.url || this.options.fetchFn)) {
            // Need to wait for initial render if the component relies on properties for the URL
            this.host.updateComplete.then(() => {
                this.fetch();
            });
        }
    }

    hostDisconnected() {
        this._disconnected = true;
    }

    /**
     * Force a fetch/refresh
     * @param {...any} args - Optional arguments passed to fetchFn
     */
    async fetch(...args) {
        this.loading = true;
        this.error = null;
        this.stale = false;
        this.host.requestUpdate();

        try {
            let result;

            if (this.options.fetchFn) {
                // Custom fetch logic (e.g. Promise.all for multiple endpoints)
                result = await this.options.fetchFn(...args);
            } else if (this.options.url) {
                // Standard apiGet
                const url = typeof this.options.url === 'function' 
                    ? this.options.url() 
                    : this.options.url;
                    
                const response = await apiGet(url);

                // Handle both {success: true, data: ...} and direct payload formats
                if (response && response.success !== undefined) {
                    if (response.success) {
                        result = response.data;
                    } else {
                        throw new Error(response.error || response.message || 'Fetch failed');
                    }
                } else {
                    result = response;
                }
            } else {
                throw new Error('No URL or custom fetch function provided to FetchController');
            }

            if (this._disconnected) return;
            this.data = result;

            if (this.options.snapshotKey && _writeSnapshot &&
                (!this.options.snapshotWhen || this.options.snapshotWhen(this.data))) {
                _writeSnapshot(this.options.snapshotKey, this.data);
            }

            if (this.options.onSuccess) {
                this.options.onSuccess(this.data);
            }
        } catch (err) {
            if (this._disconnected) return;
            console.error(`[FetchController] Error:`, err);

            // Last state saved while online, if this panel declared one. Serving it is
            // what the offline banner already promises the whole screen; without this,
            // only the surfaces fed by the metrics stream kept that promise and every
            // other panel answered "Unable to connect to server" underneath it.
            //
            // ONLY when nothing answered. `isNetworkError` is false as soon as an error
            // carries a status, so a 401 after a key rotation or a 500 from a crashed
            // core still reports itself. Serving a snapshot there would be the worst of
            // both: hours-old state rendered as if live, with no error and no offline
            // banner either, since the browser is online and would say so. The service
            // worker's own offline answer IS covered — throwForStatus turns its
            // `{error: "offline"}` 503 into a tagged network error carrying no status.
            const cached = isNetworkError(err) && this.options.snapshotKey && _readSnapshot
                ? _readSnapshot(this.options.snapshotKey)
                : undefined;

            const served = cached !== undefined && cached !== null;
            if (served) {
                this.data = cached;
                this.stale = true;
                if (this.options.onSuccess) {
                    this.options.onSuccess(this.data);
                }
            } else {
                this.error = getUserFriendlyError ? getUserFriendlyError(err) : err.message;
            }

            if (this.options.onError) {
                this.options.onError(err, this.error, { servedSnapshot: served });
            }
        } finally {
            if (this._disconnected) return;
            this.loading = false;
            this.host.requestUpdate();
        }
    }
}
