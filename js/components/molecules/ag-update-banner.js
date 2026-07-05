/**
 * @module AgUpdateBanner
 * @description Molecule that shows a "new AudioGravity release available" banner.
 * Fetches GET /license/online-status on mount and reads its `update` field
 * (computed by the license server). Read-only indicator — the actual update
 * action lands in a later phase. Renders nothing when no update applies.
 *
 * Uses light DOM (createRenderRoot override) so global theme tokens and
 * stylesheet rules apply without shadow-DOM piercing.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { iconDownload } from '../../ag-icons.js';

/**
 * Whether the update payload warrants showing the banner.
 * @param {{available?: boolean, latest?: string}|null|undefined} update
 * @returns {boolean}
 */
export function isUpdateAvailable(update) {
    return !!(update && update.available && update.latest);
}

/**
 * Update-available banner molecule.
 * Reads GET /license/online-status on connect and renders a single banner when
 * the license server reports a newer release for this device.
 *
 * @element ag-update-banner
 *
 * @example
 * <ag-update-banner></ag-update-banner>
 */
export class AgUpdateBanner extends LitElement {
    static properties = {
        _update: { state: true },
    };

    /** Light DOM — inherits global CSS variables and stylesheet rules. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._update = null;
        this._abortController = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._abortController = new AbortController();
        this._load();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._abortController?.abort();
        this._abortController = null;
    }

    async _load() {
        try {
            const data = await apiGet('/license/online-status');
            if (this._abortController?.signal.aborted) return;
            this._update = data.update || null;
        } catch {
            // Non-blocking — the banner is optional.
        }
    }

    render() {
        const u = this._update;
        if (!isUpdateAvailable(u)) return nothing;

        return html`
            <style>
                ag-update-banner .ag-upd-banner {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    margin-bottom: var(--spacing-sm);
                    border-radius: var(--radius-md);
                    background: var(--bg-secondary);
                    border-left: var(--spacing-xs) solid var(--accent-primary);
                    font-size: var(--font-size-sm);
                }
                ag-update-banner .ag-upd-banner.mandatory { border-left-color: var(--color-warning); }
                ag-update-banner .ag-upd-icon  { color: var(--accent-primary); flex-shrink: 0; display: flex; }
                ag-update-banner .ag-upd-banner.mandatory .ag-upd-icon { color: var(--color-warning); }
                ag-update-banner .ag-upd-body  { flex: 1; }
                ag-update-banner .ag-upd-title {
                    font-size: var(--font-size-sm);
                    color: var(--text-primary);
                    margin-bottom: var(--spacing-xs);
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }
                ag-update-banner .ag-upd-badge {
                    font-size: var(--font-size-xxs);
                    text-transform: uppercase;
                    letter-spacing: .05em;
                    padding: 0 var(--spacing-xs);
                    border-radius: var(--radius-sm);
                    background: var(--color-warning);
                    color: var(--bg-primary);
                }
                ag-update-banner .ag-upd-text { color: var(--text-secondary); font-size: var(--font-size-xs); }
                ag-update-banner .ag-upd-link {
                    display: inline-block;
                    margin-top: var(--spacing-xs);
                    color: var(--accent-primary);
                    text-decoration: none;
                    font-size: var(--font-size-xs);
                }
                ag-update-banner .ag-upd-link:hover { text-decoration: underline; }
            </style>
            <div class="ag-upd-banner ${u.mandatory ? 'mandatory' : ''}">
                <span class="ag-upd-icon">
                    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none"
                         stroke="currentColor" stroke-width="1.5"
                         stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg>
                </span>
                <div class="ag-upd-body">
                    <div class="ag-upd-title">
                        Update available — v${u.latest}
                        ${u.mandatory ? html`<span class="ag-upd-badge">required</span>` : nothing}
                    </div>
                    <div class="ag-upd-text">A newer AudioGravity release is available for this device.</div>
                    ${u.notes_url
                        ? html`<a class="ag-upd-link" href=${u.notes_url} target="_blank" rel="noopener">Release notes →</a>`
                        : nothing}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-update-banner', AgUpdateBanner);
