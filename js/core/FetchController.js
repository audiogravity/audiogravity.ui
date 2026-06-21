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

export class FetchController {
    /**
     * @param {import('lit').ReactiveElement} host - The component host
     * @param {Object} options
     * @param {string|Function} options.url - The URL to fetch, or a function returning a URL
     * @param {Function} [options.fetchFn] - Custom fetch function if not using standard apiGet
     * @param {boolean} [options.autoFetch=true] - Whether to fetch automatically when host connects
     * @param {*} [options.initialData=null] - Initial data before fetch completes
     * @param {Function} [options.onSuccess] - Callback when fetch succeeds
     * @param {Function} [options.onError] - Callback when fetch fails
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

            if (this.options.onSuccess) {
                this.options.onSuccess(this.data);
            }
        } catch (err) {
            if (this._disconnected) return;
            console.error(`[FetchController] Error:`, err);
            this.error = getUserFriendlyError ? getUserFriendlyError(err) : err.message;

            if (this.options.onError) {
                this.options.onError(err, this.error);
            }
        } finally {
            if (this._disconnected) return;
            this.loading = false;
            this.host.requestUpdate();
        }
    }
}
