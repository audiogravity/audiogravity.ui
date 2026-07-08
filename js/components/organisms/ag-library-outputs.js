/**
 * @module AgLibraryOutputs
 * @description Output / DAC selector view. Lists all physical audio outputs
 * from the steering module and allows switching the active output.
 * Fetches from GET /api/steering/outputs.
 *
 * @element ag-library-outputs
 *
 * @attr {string} source-id - Active source ID (used to derive service name for switch-output)
 * @fires lib-output-change - Bubbles. detail: { outputId } — user selected an output
 */
import { LitElement, html } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { loadWithState } from '../utils-lit.js';
import { showToast } from '../../ui-helpers.js';
import {
    iconConnectorUsbA, iconConnectorToslink,
    iconConnectorRj45, iconConnectorDefault,
} from '../../ag-icons.js';

/** Maps pipeline source IDs to their steerable service name when the two differ. */
const SOURCE_TO_SERVICE = {
    'src_mono-sgen': 'roonbridge',
    'src_roon':      'roonbridge',
};

const CONNECTOR_ICONS = {
    'usb-a':   iconConnectorUsbA,
    'toslink': iconConnectorToslink,
    'rj45':    iconConnectorRj45,
    'default': iconConnectorDefault,
};

export class AgLibraryOutputs extends LitElement {
    static properties = {
        sourceId: { type: String, attribute: 'source-id' },
        _outputs: { state: true },
        _loading: { state: true },
        _switching: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId = '';
        this._outputs = [];
        this._loading = false;
        this._switching = null;   // id of the output currently being switched to
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    async _load() {
        await loadWithState(this, async () => {
            this._outputs = await apiGet('/steering/outputs');
        });
    }

    async _activate(output) {
        // Guard: ignore clicks on the active output or while a switch is in flight.
        if (output.active || this._switching) return;

        this._switching = output.id;
        try {
            const fallback = (this.sourceId || '').replace('src_', '') || 'mpd';
            const service  = SOURCE_TO_SERVICE[this.sourceId] ?? fallback;
            // The backend reports honestly (SPEC §10): a switch that was not applied
            // returns 4xx (error detail), so a resolved POST means it took.
            await apiPost('/steering/switch-output', { service, output: output.id });
            this.dispatchEvent(new CustomEvent('lib-output-change', {
                detail: { outputId: output.id },
                bubbles: true,
            }));
        } catch (e) {
            console.error('[outputs] switch failed:', e);
            showToast('error', 'Output switch failed', e?.message || 'Could not switch output');
        } finally {
            // Re-fetch the real state so the UI reflects what actually happened
            // (rollback to the previous output if the switch did not take).
            this._switching = null;
            await this._load();
        }
    }

    render() {
        if (this._loading) return html`<div class="lib-loading">Loading…</div>`;

        return html`
            <div class="lib-out-list">
                ${this._outputs.length === 0
                    ? html`<div class="lib-empty">No outputs configured</div>`
                    : this._outputs.map(o => this._renderCard(o))
                }
                <div style="height:12px"></div>
            </div>
        `;
    }

    _renderCard(output) {
        const isActive   = output.active;
        const isSwitching = this._switching === output.id;
        const connector  = output.connector ?? 'default';
        const icon       = CONNECTOR_ICONS[connector] ?? CONNECTOR_ICONS.default;
        const badge      = isSwitching
            ? html`<span class="lib-out-badge line">SWITCHING…</span>`
            : isActive
                ? html`<span class="lib-out-badge ok">ACTIVE</span>`
                : html`<span class="lib-out-badge line">READY</span>`;

        return html`
            <div
                class="lib-out-card ${isActive ? 'active' : ''} ${isSwitching ? 'switching' : ''}"
                @click=${() => this._activate(output)}
            >
                <div class="lib-out-hd">
                    <div class="lib-out-hd-left">
                        <div class="lib-out-ic">
                            <svg viewBox="0 0 24 24">${icon}</svg>
                        </div>
                        <div class="lib-out-col">
                            <div class="lib-out-name">${output.label}</div>
                            <div class="lib-out-desc">
                                ${output.connector?.toUpperCase() ?? ''}
                                ${output.alsa_card_name ? ` · ${output.alsa_card_name}` : ''}
                                ${output.target_device_id ? ` → ${output.target_device_id}` : ''}
                            </div>
                        </div>
                    </div>
                    ${badge}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-library-outputs', AgLibraryOutputs);
