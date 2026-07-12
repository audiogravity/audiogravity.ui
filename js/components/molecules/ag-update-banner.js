/**
 * @module AgUpdateBanner
 * @description Molecule that shows a "new AudioGravity release available" banner
 * and drives the one-click self-update. Fetches GET /license/online-status on
 * mount and reads its `update` field (computed by the license server). When an
 * update applies, an admin can trigger it (password-confirmed); progress is then
 * polled from GET /sysinfo/update-status, tolerating the core restart mid-update.
 *
 * Uses light DOM (createRenderRoot override) so global theme tokens and
 * stylesheet rules apply without shadow-DOM piercing.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { iconDownload, iconRepeat } from '../../ag-icons.js';
import { isAdmin } from '../../auth.js';
import { showConfirm, showPasswordConfirm, showToast } from '../../ui-helpers.js';

/** Self-update phases that end the flow (no more polling). */
const _TERMINAL_PHASES = new Set(['done', 'rolled_back', 'failed']);
/** Poll cadence and overall guard for the progress loop. */
const _POLL_INTERVAL_MS = 3000;
const _POLL_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * Whether the update payload warrants showing the banner.
 * @param {{available?: boolean, latest?: string}|null|undefined} update
 * @returns {boolean}
 */
export function isUpdateAvailable(update) {
    return !!(update && update.available && update.latest);
}

/**
 * Human-readable label for a self-update phase.
 * @param {string} phase
 * @returns {string}
 */
export function updatePhaseLabel(phase) {
    return {
        starting:    'Starting…',
        downloading: 'Downloading…',
        installing:  'Installing…',
        verifying:   'Verifying…',
        done:        'Update complete',
        rolled_back: 'Update failed — previous version restored',
        failed:      'Update failed',
    }[phase] || 'Updating…';
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
        _update:   { state: true },
        _updating: { state: true },
        _phase:    { state: true },
    };

    /** Light DOM — inherits global CSS variables and stylesheet rules. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._update = null;
        this._updating = false;
        this._phase = null;
        this._abortController = null;
        this._pollTimer = null;
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
        this._stopPolling();
    }

    async _load() {
        try {
            const data = await apiGet('/license/online-status');
            if (this._abortController?.signal.aborted) return;
            this._update = data.update || null;
            this._emitBadge();
        } catch {
            // Non-blocking — the banner is optional.
        }
    }

    /**
     * Broadcast update availability so ag-tabs can show (or clear) the badge on
     * the Admin tab, mirroring ag-announcement-banner's announcement-badge event.
     */
    _emitBadge() {
        window.dispatchEvent(new CustomEvent('update-badge', {
            detail: {
                available: isUpdateAvailable(this._update),
                mandatory: !!this._update?.mandatory,
            },
        }));
    }

    /** Confirm, authenticate, then trigger the self-update and start polling progress. */
    async _handleUpdate() {
        const u = this._update;
        if (!isUpdateAvailable(u)) return;
        const confirmed = await showConfirm(
            'Update AudioGravity',
            `Install v${u.latest}? The core service will restart, so playback will briefly stop. ` +
            `If the new version fails to start, the previous one is restored automatically.`,
        );
        if (!confirmed) return;
        const password = await showPasswordConfirm(
            'Confirm update',
            'Enter your admin password to install the update.',
        );
        if (!password) return;

        try {
            await apiPost('/sysinfo/actions/update', { password, version: u.latest });
            this._updating = true;
            this._phase = 'starting';
            showToast('info', 'Update started', 'Installing — the app will reconnect automatically…');
            this._startPolling();
        } catch (err) {
            showToast('error', 'Update failed to start', err?.message || 'Unknown error');
        }
    }

    /** Poll GET /sysinfo/update-status until a terminal phase, tolerating the restart. */
    _startPolling() {
        const deadline = Date.now() + _POLL_TIMEOUT_MS;
        this._stopPolling();
        this._pollTimer = setInterval(async () => {
            if (Date.now() > deadline) {
                this._stopPolling();
                this._updating = false;
                showToast('warning', 'Update status unknown', 'Timed out waiting — check the system status.');
                return;
            }
            try {
                // retry=false: a single attempt; the core is briefly down during the swap.
                const s = await apiGet('/sysinfo/update-status', false);
                this._phase = s?.phase || this._phase;
                if (_TERMINAL_PHASES.has(this._phase)) {
                    this._stopPolling();
                    if (this._phase === 'done') {
                        showToast('success', 'Update complete', 'Reloading…');
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        this._updating = false;
                        showToast('error', 'Update not applied', updatePhaseLabel(this._phase));
                    }
                }
            } catch {
                // Core restarting mid-update — keep polling until it answers again.
            }
        }, _POLL_INTERVAL_MS);
    }

    /** Stop the progress polling loop. */
    _stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    /** Scoped style block, shared by the banner and the progress views. */
    get _styleBlock() {
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
                ag-update-banner .ag-upd-btn { align-self: center; flex-shrink: 0; }
            </style>
        `;
    }

    _renderProgress() {
        return html`
            ${this._styleBlock}
            <div class="ag-upd-banner">
                <span class="ag-upd-icon">
                    <svg class="ag-spin" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none"
                         stroke="currentColor" stroke-width="1.5"
                         stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg>
                </span>
                <div class="ag-upd-body">
                    <div class="ag-upd-title">Updating AudioGravity…</div>
                    <div class="ag-upd-text">${updatePhaseLabel(this._phase)}</div>
                </div>
            </div>
        `;
    }

    render() {
        if (this._updating) return this._renderProgress();

        const u = this._update;
        if (!isUpdateAvailable(u)) return nothing;

        return html`
            ${this._styleBlock}
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
                    <div class="ag-upd-text">A newer Audiogravi<sup>ty</sup> release is available for this device.</div>
                    ${u.notes_url
                        ? html`<a class="ag-upd-link" href=${u.notes_url} target="_blank" rel="noopener">Release notes →</a>`
                        : nothing}
                </div>
                ${isAdmin() ? html`
                    <button class="action-btn compact primary ag-upd-btn" @click=${this._handleUpdate}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
                             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg>
                        Update now
                    </button>` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-update-banner', AgUpdateBanner);
