/**
 * @module AgPackageWebPasswordDialog
 * @description Molecule: sets the password of an installed package's web
 * interface, when it has none.
 *
 * The install sets it. This is for when it could not — the vendor's tool
 * failed, sudo refused — or when the package came some other way: the only way
 * back to a usable web interface used to be to uninstall and reinstall,
 * downloading 144 MB again. Existing credentials are never overwritten; the
 * vendor's own web interface changes them.
 *
 * The core restarts the package's service once the password is set — HQPlayer
 * reads its credentials only when it starts — so the dialog says that anything
 * playing through it stops for a moment.
 *
 * Host it at the level of `<body>` (ag-audio-software-page appends it there),
 * never inside a tab — the same reason as ag-package-install-dialog:
 * `.main-content` is a stacking context of its own, and a modal inside it stays
 * under the top bar, the tabs and the player bar whatever its z-index.
 *
 * @element ag-package-web-password-dialog
 *
 * @attr {Object}  pkg  - The package, as `/packages/` returns it
 * @attr {boolean} show - Whether the dialog is visible
 *
 * @fires web-password-confirmed - `{ packageId, webPassword }`
 * @fires modal-close - The dialog was dismissed without setting anything
 *
 * @dependency ag-modal
 * @dependency ag-web-password-field
 * @dependency css/audio-software.css - ag-pid-* styles
 */

import { LitElement, html } from 'lit';
import '../organisms/ag-modal.js';
import { generateWebPassword, webPasswordProblem } from './ag-web-password-field.js';

export class AgPackageWebPasswordDialog extends LitElement {
    static properties = {
        pkg:  { type: Object },
        show: { type: Boolean },

        _password: { state: true },
    };

    constructor() {
        super();
        this.pkg = null;
        this.show = false;
        this._password = '';
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    /**
     * Draw a password on opening, forget it on closing — never kept past a
     * close, as in the install dialog. In `willUpdate`: set in `updated`, it
     * would cost a second render each time.
     *
     * @param {Map} changed - Properties Lit reports as changed.
     */
    willUpdate(changed) {
        if (changed.has('show')) this._password = this.show ? generateWebPassword() : '';
    }

    /** @returns {boolean} Whether the password in the field may be sent. */
    get _canSet() {
        return webPasswordProblem(this._password) === null;
    }

    /**
     * Emit the confirmation.
     *
     * Reached through an arrow function in the template, as in the install
     * dialog: the buttons are rendered by ag-modal as its footer, and a bare
     * `@click=${this._method}` would run with `this` set to the modal.
     */
    _confirm() {
        if (!this._canSet) return;
        this.dispatchEvent(new CustomEvent('web-password-confirmed', {
            bubbles: true,
            composed: true,
            detail: { packageId: this.pkg?.id, webPassword: this._password },
        }));
    }

    _close() {
        this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }));
    }

    /**
     * The dialog body: what setting the password does, then the field.
     *
     * The explanation is a section of its own, like every block of the install
     * dialog: a bare hint keeps only the small space a hint leaves under itself
     * inside a section, and the field's heading sat right under it.
     *
     * @returns {import('lit').TemplateResult}
     */
    _renderBody() {
        return html`
            <div class="ag-pid-section">
                <p class="ag-pid-hint">
                    ${this.pkg.label}'s web interface has no password yet. Once it is set,
                    ${this.pkg.label} restarts to use it: anything playing through it stops
                    for a moment.
                </p>
            </div>
            <ag-web-password-field
                .credentials=${this.pkg.web_credentials}
                .label=${this.pkg.label}
                .value=${this._password}
                @password-input=${e => { this._password = e.detail.value; }}>
            </ag-web-password-field>
        `;
    }

    /** @returns {import('lit').TemplateResult} The dialog's buttons, for the modal's footer. */
    _renderActions() {
        return html`
            <button class="action-btn secondary" @click=${() => this._close()}>Cancel</button>
            <button class="action-btn primary" ?disabled=${!this._canSet}
                @click=${() => this._confirm()}>Set password</button>
        `;
    }

    render() {
        if (!this.pkg?.web_credentials) return html``;
        return html`
            <ag-modal
                title="Web interface password — ${this.pkg.label}"
                ?show=${this.show}
                .bodyTemplate=${this._renderBody()}
                .footerTemplate=${this._renderActions()}
                @modal-close=${() => this._close()}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-package-web-password-dialog', AgPackageWebPasswordDialog);
