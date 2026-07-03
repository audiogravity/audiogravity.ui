/**
 * @module AgLibrarySourceCard
 * @description Source card molecule for the library source switcher.
 * Renders a single audio source card (MPD, Roon, Qobuz, UPnP…).
 * For Roon sources, toggles an inline zone picker and fetches zones autonomously.
 *
 * @element ag-library-source-card
 *
 * @attr {object}  .node    - Source descriptor: { id: string, name: string, status: string }
 * @attr {boolean} active   - Whether this source is currently active
 * @attr {string}  zone-id  - Currently active zone ID (used to display zone name when active)
 *
 * @fires source-select - Bubbles. detail: { sourceId: string, zoneId: string }
 */
import { LitElement, html, nothing } from 'lit';
import { getRoonZones } from '../../library-store.js';
import { ROON_IDS, SOURCE_LABELS, SOURCE_ICONS } from '../library-constants.js';
import { iconChevronDown, iconOutput, iconCheck } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';

export class AgLibrarySourceCard extends LitElement {
    static properties = {
        node:            { type: Object },
        active:          { type: Boolean },
        zoneId:          { type: String, attribute: 'zone-id' },
        zoneDisplayName: { type: String, attribute: 'zone-display-name' },
        _expanded:       { state: true },
        _roonZones:      { state: true },
        _zonesLoading:   { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.node            = null;
        this.active          = false;
        this.zoneId          = '';
        this.zoneDisplayName = '';
        this._expanded       = false;
        this._roonZones      = [];
        this._zonesLoading   = false;
    }

    _isRoon() {
        return this.node && ROON_IDS.has(this.node.id);
    }

    async _toggleExpand() {
        if (!this._isRoon()) {
            this._emit('');
            return;
        }
        this._expanded = !this._expanded;
        if (this._expanded && this._roonZones.length === 0) {
            this._zonesLoading = true;
            try {
                this._roonZones = await getRoonZones();
            } catch (_) {
                this._roonZones = [];
            } finally {
                this._zonesLoading = false;
            }
        }
    }

    _selectZone(e, zone) {
        e.stopPropagation();
        this._expanded = false;
        this._emit(zone.zone_id, zone.display_name || '');
    }

    _emit(zoneId, zoneDisplayName = '') {
        this.dispatchEvent(new CustomEvent('source-select', {
            detail: { sourceId: this.node.id, zoneId, zoneDisplayName },
            bubbles: true,
        }));
    }

    render() {
        const { node, active, zoneId, zoneDisplayName } = this;
        if (!node) return nothing;

        const icon     = SOURCE_ICONS[node.id] ?? SOURCE_ICONS.default;
        const name     = SOURCE_LABELS[node.id] ?? node.name;
        // Source cards carry no subtitle — the label ('Local Library', 'Qobuz'…)
        // is self-explanatory and every source stays visually consistent.
        const desc     = null;
        const isRoon   = this._isRoon();
        const expanded = isRoon && this._expanded;
        const stCls    = node.status === 'active' ? 'up' : 'down';
        const stLbl    = node.status === 'active' ? 'Active' : 'Idle';

        // For Roon active source, prefer the backend-provided display name.
        // Fall back to the picker's cached zones, then to the source name so the
        // description row never disappears during the async zones-load window.
        const displayDesc = active && isRoon
            ? (zoneDisplayName
                || this._roonZones.find(z => z.zone_id === zoneId)?.display_name
                || name)
            : desc;

        return html`
            <div class="lib-src-card ${active ? 'active' : ''} ${expanded ? 'expanded' : ''}">
                <div class="lib-src-card-hd" @click=${() => this._toggleExpand()}>
                    <div class="lib-src-ic">${icon}</div>
                    <div class="lib-src-col">
                        <span class="lib-src-name">${name}</span>
                        ${displayDesc ? html`<span class="lib-src-desc">${displayDesc}</span>` : nothing}
                    </div>
                    <ag-status-indicator state="${stCls}" label="${stLbl}"></ag-status-indicator>
                    ${isRoon ? html`
                        <svg class="lib-src-chevron ${expanded ? 'open' : ''}"
                            viewBox="0 0 24 24" width="14" height="14"
                            fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round">
                            ${iconChevronDown}
                        </svg>
                    ` : nothing}
                </div>

                ${expanded ? html`
                    <div class="lib-src-zones">
                        ${this._zonesLoading
                            ? html`<div class="lib-src-zone-row loading">Loading zones…</div>`
                            : this._roonZones.length === 0
                                ? html`<div class="lib-src-zone-row empty">No zones available</div>`
                                : this._roonZones.map(zone => html`
                                    <div
                                        class="lib-src-zone-row ${zone.zone_id === zoneId ? 'active' : ''}"
                                        @click=${(e) => this._selectZone(e, zone)}
                                    >
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                                            stroke="currentColor" stroke-width="1.5">
                                            ${iconOutput}
                                        </svg>
                                        <span class="lib-src-zone-name">${zone.display_name}</span>
                                        <span class="lib-src-zone-state">${zone.state ?? ''}</span>
                                        ${zone.zone_id === zoneId
                                            ? html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                                                stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                                                ${iconCheck}
                                              </svg>`
                                            : nothing
                                        }
                                    </div>
                                `)
                        }
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-library-source-card', AgLibrarySourceCard);
