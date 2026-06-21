/**
 * @module AgLicenseBadge
 * @description Atomic badge displaying the license status of the device.
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * License status badge — maps a license status string to a colored badge.
 * @element ag-license-badge
 *
 * @attr {string} status - 'trial' | 'lifetime' | 'starter' | 'tampered' | 'no_license' | 'version_expired'
 * @attr {number} days-remaining - Days left for trial (shown only when status is 'trial')
 * @attr {boolean} pill - Render as pill shape
 *
 * @example
 * <ag-license-badge status="trial" days-remaining="22"></ag-license-badge>
 * <ag-license-badge status="lifetime" pill></ag-license-badge>
 */
export class AgLicenseBadge extends LitElement {
    static properties = {
        status: { type: String },
        daysRemaining: { type: Number, attribute: 'days-remaining' },
        pill: { type: Boolean },
    };

    constructor() {
        super();
        this.status = 'no_license';
        this.daysRemaining = null;
        this.pill = false;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    _badgeType() {
        switch (this.status) {
            case 'lifetime':        return 'success';
            case 'trial':           return 'warning';
            case 'starter':         return 'neutral';
            case 'tampered':        return 'critical';
            case 'version_expired': return 'error';
            default:                return 'neutral';
        }
    }

    _label() {
        switch (this.status) {
            case 'lifetime':        return 'Lifetime';
            case 'trial':           return this.daysRemaining != null ? `Trial — ${this.daysRemaining}d` : 'Trial';
            case 'starter':         return 'Starter';
            case 'tampered':        return 'Invalid';
            case 'version_expired': return 'Version expired';
            default:                return 'No license';
        }
    }

    render() {
        const classes = {
            'badge': true,
            [this._badgeType()]: true,
            'pill': this.pill,
        };
        return html`<span class=${classMap(classes)}>${this._label()}</span>`;
    }
}

customElements.define('ag-license-badge', AgLicenseBadge);
