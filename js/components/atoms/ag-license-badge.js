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
 * @attr {string} status - 'trial' | 'lifetime' | 'starter' | 'tampered' | 'no_license' | 'version_expired' | 'expired'
 * @attr {string} expires-at - ISO end date, when the licence carries one. A licence with a
 *   term keeps the status 'lifetime' because the tier and the unlocked features are the
 *   same — but reading "Lifetime" beside "active until 31/12/2026" is the very confusion
 *   this badge should not create, so the label follows the date when there is one.
 * @attr {number} days-remaining - Days left for trial (shown only when status is 'trial')
 * @attr {boolean} pill - Render as pill shape
 *
 * @example
 * <ag-license-badge status="trial" days-remaining="22"></ag-license-badge>
 * <ag-license-badge status="lifetime" pill></ag-license-badge>
 */
export class AgLicenseBadge extends LitElement {
    static properties = {
        expiresAt:     { type: String, attribute: 'expires-at' },
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
            // A term that ran out, not a suspect file: 'warning', never 'critical'. It used
            // to arrive here as 'tampered' and paint the customer's own licence red.
            case 'expired':         return 'warning';
            default:                return 'neutral';
        }
    }

    _label() {
        switch (this.status) {
            case 'lifetime':        return this.expiresAt ? 'Licensed' : 'Lifetime';
            case 'trial':           return this.daysRemaining != null ? `Trial — ${this.daysRemaining}d` : 'Trial';
            case 'starter':         return 'Starter';
            case 'tampered':        return 'Invalid';
            case 'version_expired': return 'Version expired';
            case 'expired':         return 'License ended';
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
