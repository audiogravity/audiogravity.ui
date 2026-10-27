/**
 * @module AgStatsRecording
 * @description Whether the box keeps a history of what it plays, and the way to erase it.
 *
 * Open on every edition: the box records on Starter too, so whoever owns it can see that
 * it does, switch it off and erase what it kept — the history's figures are what Pro
 * opens. Reads and writes its settings itself (/listening/settings, /listening/history).
 *
 * Read each time its view is shown, and only then: the page that holds it stays mounted
 * whatever tab is open, and read on mounting, the settings were asked at every start of
 * the app (measured in Chromium, 2026-10-16) and the count of listens went stale.
 *
 * @element ag-stats-recording
 *
 * @attr {boolean} visible - Whether its view is shown.
 *
 * @fires listening-changed - Bubbles. The history was erased or the recording switched:
 *   what shows the history reads it again. detail: the settings now.
 *
 * @dependency ag-switch - The switch
 * @dependency css/components/library-stats.css - Classes .lib-stats-recording*
 */
import { LitElement, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { clearListeningHistory, listeningSettings, setListeningRecording } from '../../listening-api.js';
import { showConfirm, showToast } from '../../ui-helpers.js';
import { fmtIsoDate } from '../utils-lit.js';
import '../atoms/ag-switch.js';

export class AgStatsRecording extends LitElement {
    static properties = {
        visible:   { type: Boolean },
        _settings: { state: true },
        _busy:     { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.visible = false;
        /** `{recording, listens, since}`, null until read. @type {object|null} */
        this._settings = null;
        /** A change is on its way to the core. @type {boolean} */
        this._busy = false;
    }

    /**
     * Read the settings when the view is shown.
     *
     * @param {Map<string, unknown>} changed - Lit's changed-properties map.
     * @returns {void}
     */
    updated(changed) {
        if (changed.has('visible') && this.visible) this._load();
    }

    /** Read the settings from the core. @returns {Promise<void>} */
    async _load() {
        try {
            this._settings = await listeningSettings();
        } catch (err) {
            console.error('[ag-stats-recording] settings failed:', err);
        }
    }

    /**
     * Tell whatever shows the history that it changed.
     *
     * @param {object} settings - The settings now.
     * @returns {void}
     */
    _announce(settings) {
        this.dispatchEvent(new CustomEvent('listening-changed', { detail: settings, bubbles: true }));
    }

    /**
     * Switch the recording; the switch goes back where it was when the core refuses.
     *
     * @param {CustomEvent} e - `ag-change` from the switch; detail.checked.
     * @returns {Promise<void>}
     */
    async _toggle(e) {
        const on = e.detail.checked;
        this._busy = true;
        try {
            this._settings = await setListeningRecording(on);
            this._announce(this._settings);
        } catch (err) {
            showToast('error', on ? 'History not turned on' : 'History not turned off',
                err?.detail || err?.message || 'The change was refused.');
            this._settings = { ...this._settings };       // redraws; live() puts the switch back
        } finally {
            this._busy = false;
        }
    }

    /** Erase the history, once confirmed. @returns {Promise<void>} */
    async _clear() {
        if (this._busy) return;
        const confirmed = await showConfirm(
            'Clear the listening history',
            'Every listen this box has recorded is erased. This cannot be undone.',
            { okLabel: 'Clear', destructive: true },
        );
        if (!confirmed) return;
        this._busy = true;
        try {
            await clearListeningHistory();
            await this._load();
            showToast('success', 'History cleared', 'Every recorded listen is erased.');
            this._announce(this._settings);
        } catch (err) {
            showToast('error', 'History not cleared', err?.detail || err?.message || 'The core refused it.');
        } finally {
            this._busy = false;
        }
    }

    /**
     * What the history holds, in one sentence.
     *
     * @param {{listens: number, since: (string|null)}} s - The settings.
     * @returns {string} `2 listens since 17/09/2026.`
     */
    _held(s) {
        const count = `${s.listens.toLocaleString()} ${s.listens === 1 ? 'listen' : 'listens'}`;
        return s.since ? `${count} since ${fmtIsoDate(s.since)}.` : `${count}.`;
    }

    render() {
        const s = this._settings;
        return html`
            <div class="lib-stats-recording">
                <div class="lib-stats-recording-row">
                    <span class="lib-stats-recording-label" aria-hidden="true">Keep a history of what plays</span>
                    <!-- live(): the switch flips itself on a tap, so the value the core holds
                         is set again whatever was bound last — a refusal left it where tapped. -->
                    <ag-switch .checked=${live(s ? s.recording : true)} ?disabled=${!s || this._busy}
                        label="Keep a history of what plays"
                        @ag-change=${this._toggle}></ag-switch>
                </div>
                <p class="lib-stats-hint">
                    The history stays on this box. A listen counts from 30 seconds.
                    ${s?.listens ? this._held(s) : nothing}
                </p>
                <button type="button" class="action-btn compact warning"
                        aria-disabled=${this._busy || !s?.listens ? 'true' : 'false'}
                        @click=${() => { if (s?.listens) this._clear(); }}>
                    Clear history…
                </button>
            </div>
        `;
    }
}

customElements.define('ag-stats-recording', AgStatsRecording);
