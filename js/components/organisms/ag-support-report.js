/**
 * @module AgSupportReport
 * @description Organism that fetches the box's support report and shows it as text
 * the owner can read, copy or download.
 *
 * Why it exists: diagnosing a box remotely used to be done by deduction — a version
 * inferred from a timestamp, a service assumed off from a screenshot, a hand-edited
 * config guessed from a description — and some deductions were wrong. This is one
 * gesture that produces something the owner can paste into a message.
 *
 * The owner triggering it *is* the consent: nothing is collected until the button is
 * pressed, nothing is sent anywhere, and the report never leaves the browser unless
 * they copy or download it themselves. Secrets are redacted by the core before the
 * report is built (see `modules/sysinfo/support_report.py`).
 *
 * Hosted at body level in `index.html`, like every other modal, and opened by id. It
 * cannot live inside the System tab: the tab's panel is `display: none` when another
 * tab is active, and a `position: fixed` overlay under a hidden ancestor is not
 * displayed at all — switching tabs would make an open report vanish while the
 * component still believed it was showing.
 *
 * @element ag-support-report
 *
 * @attr {boolean} show - Whether the report window is open.
 *
 * @dependency ag-modal
 * @fires close-request - Dispatched when the window is closed.
 */

import { LitElement, html } from 'lit';
import { apiGet } from '../../api.js';
import { copyToClipboard, downloadTextFile, showToast } from '../../ui-helpers.js';
import { iconCopy, iconDownload } from '../../ag-icons.js';
import { formatSupportReport } from '../../core/support-report-format.js';
import './ag-modal.js';

export class AgSupportReport extends LitElement {
    static properties = {
        show: { type: Boolean },
        _loading: { state: true },
        _text: { state: true },
        _error: { state: true },
    };

    constructor() {
        super();
        // Bound in the constructor because these handlers travel inside the templates
        // handed to <ag-modal> as `.bodyTemplate` / `.footerTemplate`. Lit binds a
        // listener's `this` to the component that RENDERS the template — the modal —
        // not to the one that wrote it, so an unbound handler would look for these
        // methods on <ag-modal> and throw on its first line, silently.
        this._handleClose = this._handleClose.bind(this);
        this._copy = this._copy.bind(this);
        this._download = this._download.bind(this);
        this.show = false;
        this._loading = false;
        this._text = '';
        this._error = '';
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    updated(changedProperties) {
        // Collected on open, never on a timer: the report shells out (lsblk, findmnt,
        // dpkg) and this box is an audio machine before it is a web server.
        if (changedProperties.has('show') && this.show && !this._text && !this._loading) {
            this.load();
        }
    }

    /**
     * Fetch the report and render it to text.
     * @returns {Promise<void>}
     */
    async load() {
        this._loading = true;
        this._error = '';
        try {
            const report = await apiGet('/sysinfo/support-report');
            this._text = formatSupportReport(report);
        } catch (err) {
            this._error = err?.message || 'Could not collect the report.';
            this._text = '';
        } finally {
            this._loading = false;
        }
    }

    /** Close the window and let the host know. */
    _handleClose() {
        this.show = false;
        // A failure is not kept for the next opening. `load()` clears it too, but only
        // once it runs — and the window paints first, so a stale red banner would be
        // the first thing shown on reopening after a refused collection.
        this._error = '';
        this.dispatchEvent(new CustomEvent('close-request', { bubbles: true, composed: true }));
    }

    /**
     * Copy the report to the clipboard.
     * @returns {Promise<void>}
     */
    async _copy() {
        if (!this._text) return;
        try {
            await copyToClipboard(this._text);
            showToast('success', 'Copied', 'The report is on your clipboard — paste it into your message.');
        } catch {
            showToast('error', 'Copy Failed', 'The browser blocked copying. Use Download instead.');
        }
    }

    /** Save the report as a text file named after the day it was taken. */
    _download() {
        if (!this._text) return;
        const stamp = new Date().toISOString().slice(0, 10);
        downloadTextFile(this._text, `audiogravity-support-${stamp}.txt`);
    }

    render() {
        return html`
            <ag-modal
                ?show=${this.show}
                @modal-close=${this._handleClose}
                size="large"
                title="Support Report"
                no-backdrop-close
                .bodyTemplate=${html`
                    <p class="support-report-intro">
                        A snapshot of this box: version, licence, services, audio stack and
                        configuration files. Passwords, API keys and access tokens are removed
                        before the report is built. Nothing is sent anywhere — copy or download
                        it and attach it to your message yourself.
                    </p>
                    ${this._loading ? html`
                        <div class="support-report-status">Collecting…</div>
                    ` : ''}
                    ${this._error ? html`
                        <div class="support-report-status error">${this._error}</div>
                    ` : ''}
                    ${this._text ? html`
                        <pre class="support-report-body">${this._text}</pre>
                    ` : ''}
                `}
                .footerTemplate=${html`
                    <button class="btn-action" ?disabled=${!this._text} @click=${this._copy}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCopy}</svg> Copy
                    </button>
                    <button class="btn-action" ?disabled=${!this._text} @click=${this._download}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg> Download
                    </button>
                    <button class="btn-action" @click=${this._handleClose}>Close</button>
                `}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-support-report', AgSupportReport);
