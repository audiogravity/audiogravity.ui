/**
 * @module AgAnnouncementBanner
 * @description Molecule that displays broadcast announcements from the license server.
 * Fetches GET /license/online-status on mount, shows one banner per unread announcement.
 * Dismissed IDs are persisted in localStorage so banners do not reappear across sessions.
 *
 * Uses light DOM (createRenderRoot override) so global theme tokens and stylesheet
 * rules apply without shadow-DOM piercing.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';

const _STORAGE_KEY = 'ag_dismissed_announcements';

/** @returns {Set<string>} Set of dismissed announcement IDs. */
function _getDismissed() {
    try {
        return new Set(JSON.parse(localStorage.getItem(_STORAGE_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

/** @param {Set<string>} ids */
function _saveDismissed(ids) {
    localStorage.setItem(_STORAGE_KEY, JSON.stringify([...ids]));
}

/**
 * Announcement banner molecule.
 * Polls GET /license/online-status on connect and renders dismissable banners for
 * each active announcement not yet dismissed by the user.
 *
 * @element ag-announcement-banner
 *
 * @example
 * <ag-announcement-banner></ag-announcement-banner>
 */
export class AgAnnouncementBanner extends LitElement {
    static properties = {
        _announcements: { state: true },
        _dismissed:     { state: true },
    };

    /** Light DOM — inherits global CSS variables and stylesheet rules. */
    createRenderRoot() { return this; }

    constructor() {
        super();
        this._announcements = [];
        this._dismissed = _getDismissed();
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
            this._announcements = data.announcements || [];
            this._emitBadge();
        } catch {
            // Non-blocking — banner is optional
        }
    }

    /** Emit the unread count so ag-tabs can update the Admin tab badge. */
    _emitBadge() {
        const count = this._announcements.filter(a => !this._dismissed.has(a.id)).length;
        window.dispatchEvent(new CustomEvent('announcement-badge', { detail: { count } }));
    }

    /** @param {string} id */
    _dismiss(id) {
        this._dismissed = new Set([...this._dismissed, id]);
        _saveDismissed(this._dismissed);
        this._emitBadge();
        this.requestUpdate();
    }

    /** @param {string} type @returns {string} */
    _icon(type) {
        return { version: '🚀', promo: '🎉', alert: '⚠️', info: 'ℹ️' }[type] ?? 'ℹ️';
    }

    render() {
        const visible = this._announcements.filter(a => !this._dismissed.has(a.id));
        if (!visible.length) return nothing;

        return html`
            <style>
                ag-announcement-banner .ag-ann-banner {
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
                ag-announcement-banner .ag-ann-banner.version { border-left-color: var(--accent-primary); }
                ag-announcement-banner .ag-ann-banner.promo   { border-left-color: var(--color-success); }
                ag-announcement-banner .ag-ann-banner.alert   { border-left-color: var(--color-warning); }
                ag-announcement-banner .ag-ann-banner.info    { border-left-color: var(--border-color); }
                ag-announcement-banner .ag-ann-icon  { font-size: var(--font-size-md); flex-shrink: 0; }
                ag-announcement-banner .ag-ann-body  { flex: 1; }
                ag-announcement-banner .ag-ann-title { font-size: var(--font-size-sm); color: var(--text-primary); margin-bottom: var(--spacing-xs); }
                ag-announcement-banner .ag-ann-text  { color: var(--text-secondary); font-size: var(--font-size-xs); }
                ag-announcement-banner .ag-ann-link  {
                    display: inline-block;
                    margin-top: var(--spacing-xs);
                    color: var(--accent-primary);
                    text-decoration: none;
                    font-size: var(--font-size-xs);
                }
                ag-announcement-banner .ag-ann-link:hover { text-decoration: underline; }
                ag-announcement-banner .ag-ann-dismiss {
                    background: none;
                    border: none;
                    color: var(--text-tertiary);
                    cursor: pointer;
                    padding: 0 var(--spacing-xs);
                    font-size: var(--font-size-md);
                    line-height: var(--font-size-md);
                    flex-shrink: 0;
                }
                ag-announcement-banner .ag-ann-dismiss:hover { color: var(--text-primary); }
            </style>
            ${visible.map(a => html`
                <div class="ag-ann-banner ${a.type}">
                    <span class="ag-ann-icon">${this._icon(a.type)}</span>
                    <div class="ag-ann-body">
                        <div class="ag-ann-title">${a.title}</div>
                        ${a.body ? html`<div class="ag-ann-text">${a.body}</div>` : nothing}
                        ${a.url  ? html`<a class="ag-ann-link" href="${a.url}" target="_blank" rel="noopener">Learn more →</a>` : nothing}
                    </div>
                    <button class="ag-ann-dismiss" @click=${() => this._dismiss(a.id)} aria-label="Dismiss">✕</button>
                </div>
            `)}
        `;
    }
}

customElements.define('ag-announcement-banner', AgAnnouncementBanner);
