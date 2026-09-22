/**
 * @module AgPackageUninstallDialog
 * @description Molecule shown before a package is uninstalled: the confirmation,
 * and the choice of deleting its settings too.
 *
 * A plain uninstall keeps a package's settings — apt leaves its configuration
 * files — so a reinstall finds them again. That is what an uninstall should do
 * by default: HQPlayer's filter and modulator choices live in exactly those
 * files. Deleting them as well (the core's `uninstall?purge=true`) is offered as
 * an explicit, unticked choice, and only for a package whose settings a plain
 * uninstall keeps (`keeps_settings_on_uninstall`): a vendor-script package
 * deletes its own anyway. The operator decided it on 2026-09-21.
 *
 * Nothing here says where a vendor keeps its licence: that was not measured for
 * HQPlayer. The warning asks for a copy of any licence before deleting, which
 * is right wherever the licence lives.
 *
 * Host it at the level of `<body>` (ag-audio-software-page appends it there),
 * never inside a tab — the same reason as ag-package-install-dialog:
 * `.main-content` is a stacking context of its own, and a modal inside it stays
 * under the top bar, the tabs and the player bar whatever its z-index.
 *
 * @element ag-package-uninstall-dialog
 *
 * @attr {Object}  pkg  - The package being uninstalled, as `/packages/` returns it
 * @attr {boolean} show - Whether the dialog is visible
 * @attr {string}  note - What the uninstall interrupts, as plain text (the page's
 *   playback warning), or '' when nothing is at stake
 *
 * @fires uninstall-confirmed - `{ packageId, purge }` — purge is true only when
 *   the operator ticked the box, for a package that offers it
 * @fires modal-close - The dialog was dismissed without uninstalling
 *
 * @dependency ag-modal
 * @dependency css/audio-software.css - ag-pud-* styles (shared with ag-pid-*)
 */

import { LitElement, html, nothing } from 'lit';
import '../organisms/ag-modal.js';

export class AgPackageUninstallDialog extends LitElement {
    static properties = {
        pkg:  { type: Object },
        show: { type: Boolean },
        note: { type: String },

        _purge: { state: true },
    };

    constructor() {
        super();
        this.pkg = null;
        this.show = false;
        this.note = '';
        this._purge = false;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    /**
     * Untick on closing: the choice to delete one package's settings must never
     * carry over to the next package the operator opens. In `willUpdate`, before
     * rendering: set in `updated`, it would cost a second render every close.
     *
     * @param {Map} changed - Properties Lit reports as changed.
     */
    willUpdate(changed) {
        if (changed.has('show') && !this.show) this._purge = false;
    }

    /** @returns {boolean} Whether this package's settings survive a plain uninstall. */
    get _offersPurge() {
        return Boolean(this.pkg?.keeps_settings_on_uninstall);
    }

    /**
     * Emit the confirmation.
     *
     * Reached through an arrow function in the template, as in the install
     * dialog: the buttons are rendered by ag-modal as its footer, and a bare
     * `@click=${this._method}` would run with `this` set to the modal.
     */
    _confirm() {
        this.dispatchEvent(new CustomEvent('uninstall-confirmed', {
            bubbles: true,
            composed: true,
            detail: { packageId: this.pkg?.id, purge: this._offersPurge && this._purge },
        }));
    }

    _close() {
        this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }));
    }

    /** @returns {import('lit').TemplateResult|typeof nothing} The delete-settings choice. */
    _renderPurge() {
        if (!this._offersPurge) return nothing;
        const label = this.pkg.label;
        return html`
            <label class="ag-pud-agree">
                <input
                    type="checkbox"
                    .checked=${this._purge}
                    @change=${e => { this._purge = e.target.checked; }}>
                <span>Also delete its settings and data</span>
            </label>
            ${this._purge ? html`
                <p class="ag-pud-warning">
                    This cannot be undone: reinstalled, ${label} starts again from its
                    factory settings. If it has a licence, keep a copy of it first.
                </p>` : html`
                <p class="ag-pud-hint">
                    Its settings are kept: a reinstall finds them again.
                </p>`}
        `;
    }

    /** @returns {import('lit').TemplateResult} The dialog body. */
    _renderBody() {
        return html`
            <p class="ag-pud-hint">
                Uninstall ${this.pkg?.label}?${this.note ? ` ${this.note.trim()}` : ''}
            </p>
            ${this._renderPurge()}
        `;
    }

    /** @returns {import('lit').TemplateResult} The dialog's buttons, for the modal's footer. */
    _renderActions() {
        return html`
            <button class="action-btn secondary" @click=${() => this._close()}>Cancel</button>
            <button class="action-btn primary" @click=${() => this._confirm()}>
                ${this._purge && this._offersPurge ? 'Uninstall and delete' : 'Uninstall'}
            </button>
        `;
    }

    render() {
        if (!this.pkg) return html``;
        return html`
            <ag-modal
                title="Uninstall ${this.pkg.label}"
                ?show=${this.show}
                .bodyTemplate=${this._renderBody()}
                .footerTemplate=${this._renderActions()}
                @modal-close=${() => this._close()}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-package-uninstall-dialog', AgPackageUninstallDialog);
