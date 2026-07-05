/**
 * @module AgVersionSkewBanner
 * @description Molecule that warns when the UI and the core are on incompatible
 * versions — e.g. one component was updated but not the other (multi-host, or a
 * partial update). Compares this UI's version to the core's (from GET /status)
 * at the major.minor level (0.x treats minor as breaking). Renders nothing when
 * they match or the core version is unknown.
 *
 * Uses light DOM (createRenderRoot override) so global theme tokens apply.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { UI_VERSION } from '../../core/config.js';
import { iconWarning } from '../../ag-icons.js';

/** major.minor of a version string ("v0.9.10-dev" → "0.9"). */
function _majorMinor(v) {
    const p = String(v || '').replace(/^v/i, '').split('-')[0].split('+')[0].split('.');
    return `${parseInt(p[0], 10) || 0}.${parseInt(p[1], 10) || 0}`;
}

/**
 * Whether the UI and core versions are compatible (same major.minor).
 * Unknown versions are treated as compatible (no false warning).
 * @param {string|null|undefined} uiVersion
 * @param {string|null|undefined} coreVersion
 * @returns {boolean}
 */
export function versionsMatch(uiVersion, coreVersion) {
    if (!uiVersion || !coreVersion) return true;
    return _majorMinor(uiVersion) === _majorMinor(coreVersion);
}

/**
 * Version-mismatch warning banner.
 * @element ag-version-skew-banner
 *
 * @example
 * <ag-version-skew-banner></ag-version-skew-banner>
 */
export class AgVersionSkewBanner extends LitElement {
    static properties = {
        _coreVersion: { state: true },
    };

    /** Light DOM — inherits global CSS variables. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._coreVersion = null;
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
            const data = await apiGet('/status');
            if (this._abortController?.signal.aborted) return;
            this._coreVersion = data?.version || null;
        } catch {
            // Best-effort — the warning is optional.
        }
    }

    render() {
        if (versionsMatch(UI_VERSION, this._coreVersion)) return nothing;

        return html`
            <style>
                ag-version-skew-banner .ag-skew-banner {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    margin-bottom: var(--spacing-sm);
                    border-radius: var(--radius-md);
                    background: var(--bg-secondary);
                    border-left: var(--spacing-xs) solid var(--color-warning);
                    font-size: var(--font-size-sm);
                }
                ag-version-skew-banner .ag-skew-icon { color: var(--color-warning); flex-shrink: 0; display: flex; }
                ag-version-skew-banner .ag-skew-title { color: var(--text-primary); margin-bottom: var(--spacing-xs); }
                ag-version-skew-banner .ag-skew-text { color: var(--text-secondary); font-size: var(--font-size-xs); }
            </style>
            <div class="ag-skew-banner">
                <span class="ag-skew-icon">
                    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none"
                         stroke="currentColor" stroke-width="1.5"
                         stroke-linecap="round" stroke-linejoin="round">${iconWarning}</svg>
                </span>
                <div>
                    <div class="ag-skew-title">Version mismatch</div>
                    <div class="ag-skew-text">
                        The interface (v${UI_VERSION}) and the core (v${this._coreVersion}) are on different
                        versions. Update the other component so both match.
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-version-skew-banner', AgVersionSkewBanner);
