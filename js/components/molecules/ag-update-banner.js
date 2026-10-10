/**
 * @module AgUpdateBanner
 * @description Molecule that shows a "new Audiogravity release available" banner
 * and drives the one-click self-update. Fetches GET /license/online-status on
 * mount and reads its `update` field (computed by the license server). When an
 * update applies, an admin can trigger it (password-confirmed); progress is then
 * polled from GET /sysinfo/update-status, tolerating the core restart mid-update.
 * An update that does not go through leaves its reason under the banner — the
 * `error` of that status, in the installer's own words — until the next attempt;
 * on mount, the banner reads it back for an admin when the failed attempt was at
 * the version still on offer.
 *
 * Uses light DOM (createRenderRoot override) so global theme tokens and
 * stylesheet rules apply without shadow-DOM piercing.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { iconDownload, iconRepeat } from '../../ag-icons.js';
import { isAdmin } from '../../auth.js';
import { bareVersion } from '../../core/versions.js';
import { showConfirm, showPasswordConfirm, showToast } from '../../ui-helpers.js';

/** Self-update phases that end the flow (no more polling). */
const _TERMINAL_PHASES = new Set(['done', 'rolled_back', 'failed']);
/** The terminal phases of an update that did not go through. */
const _FAILED_PHASES = new Set(['rolled_back', 'failed']);
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
 * What the banner says after an update that did not go through: the phase's label,
 * then the reason the box gave, when it gave one.
 * @param {string} phase - The terminal phase (`rolled_back` or `failed`).
 * @param {?string} error - The `error` of GET /sysinfo/update-status.
 * @returns {string}
 */
export function updateFailureText(phase, error) {
    const label = updatePhaseLabel(phase);
    const reason = (error || '').trim();
    return reason ? `${label}. ${reason}` : label;
}

/**
 * A sentence from the box with the brand set as the interface sets it. The
 * installers write it plain — the right form in the terminal they print to.
 * @param {string} text
 * @returns {Array<string|import('lit').TemplateResult>} Parts for a Lit template.
 */
function withBrand(text) {
    return text.split('Audiogravity').flatMap((part, i) =>
        (i === 0 ? [part] : [html`Audiogravi<sup>ty</sup>`, part]));
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
        _failure:  { state: true },
    };

    /** Light DOM — inherits global CSS variables and stylesheet rules. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._update = null;
        this._updating = false;
        this._phase = null;
        /** Why the last attempt did not go through, shown until the next one. */
        this._failure = null;
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
        // Taken before the wait: disconnectedCallback drops the controller, so read
        // after it, an unmount in between would never show as aborted.
        const signal = this._abortController?.signal;
        try {
            const data = await apiGet('/license/online-status');
            if (!signal || signal.aborted) return;
            this._update = data.update || null;
            this._emitBadge();
            // The reason is for the admin, who alone can act on it — and it may name a
            // path on the box. Other users are not shown it, and the box is not asked.
            if (isAdmin() && isUpdateAvailable(this._update)) await this._loadLastAttempt(signal);
        } catch {
            // Non-blocking — the banner is optional.
        }
    }

    /**
     * Show why the last attempt at the version on offer did not go through, if it
     * did not. The progress polling only reaches the tab that launched the update:
     * without this, a reload — or the same box opened from another device — offers
     * the update again with no word of what stopped it.
     * @param {AbortSignal} signal - The mount's signal, aborted on disconnect.
     */
    async _loadLastAttempt(signal) {
        try {
            const s = await apiGet('/sysinfo/update-status', false);
            if (signal.aborted || this._updating) return;
            if (_FAILED_PHASES.has(s?.phase) && bareVersion(s.to) === bareVersion(this._update?.latest)) {
                this._failure = updateFailureText(s.phase, s.error);
            }
        } catch {
            // Non-blocking — the banner reads the same without it.
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
            'Update Audiogravity',
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
            this._failure = null;
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
                        // The toast is gone in seconds and the reason can run to a few
                        // lines: it stays under the banner, where it can be read.
                        this._failure = updateFailureText(this._phase, s?.error);
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
                ag-update-banner .ag-upd-icon  { color: var(--accent-primary-text); flex-shrink: 0; display: flex; }
                ag-update-banner .ag-upd-banner.mandatory .ag-upd-icon { color: var(--color-warning-text); }
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
                ag-update-banner .ag-upd-failure {
                    margin-top: var(--spacing-xs);
                    color: var(--color-warning-text);
                    font-size: var(--font-size-xs);
                }
                ag-update-banner .ag-upd-link {
                    display: inline-block;
                    margin-top: var(--spacing-xs);
                    color: var(--accent-primary-text);
                    text-decoration: none;
                    font-size: var(--font-size-xs);
                }
                @media (hover: hover) {
                    ag-update-banner .ag-upd-link:hover { text-decoration: underline; }
                }
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
                    <div class="ag-upd-title"><span>Updating Audiogravi<sup>ty</sup>…</span></div>
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
                    ${this._failure ? html`<div class="ag-upd-failure">${withBrand(this._failure)}</div>` : nothing}
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
