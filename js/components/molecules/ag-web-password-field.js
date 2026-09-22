/**
 * @module AgWebPasswordField
 * @description Molecule: the password for a package's own web interface —
 * where to sign in, as whom, and the field itself, prefilled by its host.
 *
 * HQPlayer Embedded's package installs its web interface with no credentials:
 * its settings pages refuse everybody and every sign-in attempt floods its log.
 * The operator picks a password here and the core sets it with the vendor's
 * command. Shared by the two dialogs that ask for one — the install dialog, and
 * the dialog that sets it on an installed package whose install could not —
 * so that the field, its rules and what it tells the operator are written once.
 *
 * Shown in clear, in a plain text field: the operator has to note it down, and
 * Audiogravity keeps no copy to show later. The address is the core's host,
 * which is where the package is installed — not necessarily the host this page
 * was loaded from.
 *
 * @element ag-web-password-field
 *
 * @attr {Object} credentials - The package's `web_credentials`, as `/packages/`
 *   returns it (`username`, `port`)
 * @attr {string} label - The package's label
 * @attr {string} value - The password shown in the field
 *
 * @fires password-input - `{ value }`, at each keystroke
 *
 * @dependency css/audio-software.css - ag-pid-* styles
 */

import { LitElement, html, nothing } from 'lit';
import { API_BASE_URL } from '../../core/config.js';

/** Characters a generated web password is drawn from: no punctuation to mistype. */
const WEB_PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const WEB_PASSWORD_LENGTH = 16;

/** Distinguishes the fields of two dialogs present in the page at once. */
let fieldCount = 0;

/**
 * Draw a random password for a package's web interface.
 *
 * Rejection sampling rather than `byte % 62`: 256 is not a multiple of 62, and
 * the modulo would make the first eight characters of the alphabet likelier.
 *
 * @returns {string} Sixteen letters and digits.
 */
export function generateWebPassword() {
    const limit = 256 - (256 % WEB_PASSWORD_ALPHABET.length);
    let out = '';
    while (out.length < WEB_PASSWORD_LENGTH) {
        const bytes = crypto.getRandomValues(new Uint8Array(WEB_PASSWORD_LENGTH));
        for (const byte of bytes) {
            if (byte < limit && out.length < WEB_PASSWORD_LENGTH) {
                out += WEB_PASSWORD_ALPHABET[byte % WEB_PASSWORD_ALPHABET.length];
            }
        }
    }
    return out;
}

/**
 * Say what is wrong with a web interface password, or nothing.
 *
 * The same rules as the core's `web_credentials.password_problem`, which is the
 * one that decides — this copy only answers while typing instead of after the
 * round-trip. Printable ASCII without spaces (it is typed later into a browser's
 * sign-in box), and no leading dash (the vendor's tool could read it as an option).
 *
 * @param {string} password - As typed.
 * @returns {string|null} A sentence for the operator, or null when acceptable.
 */
export function webPasswordProblem(password) {
    if (password.length < 8) return 'The password needs at least 8 characters.';
    if (password.length > 64) return 'The password can have at most 64 characters.';
    if (!/^[\x21-\x7e]+$/.test(password)) {
        return 'Letters, digits and punctuation only — no spaces or accented letters.';
    }
    if (password.startsWith('-')) return 'The password cannot start with a dash.';
    return null;
}

export class AgWebPasswordField extends LitElement {
    static properties = {
        credentials: { type: Object },
        label: { type: String },
        value: { type: String },
    };

    constructor() {
        super();
        this.credentials = null;
        this.label = '';
        this.value = '';
        this._inputId = `ag-web-password-${++fieldCount}`;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    /**
     * Pass the keystroke on: the host owns the value.
     *
     * @param {InputEvent} e - The field's input event.
     */
    _onInput(e) {
        this.dispatchEvent(new CustomEvent('password-input', {
            bubbles: true,
            composed: true,
            detail: { value: e.target.value },
        }));
    }

    render() {
        if (!this.credentials) return nothing;
        const host = new URL(API_BASE_URL, window.location.href).hostname;
        const address = this.credentials.port ? `http://${host}:${this.credentials.port}` : null;
        const problem = webPasswordProblem(this.value);
        return html`
            <div class="ag-pid-section">
                <h4 class="ag-pid-heading">Web interface password</h4>
                <p class="ag-pid-hint">
                    ${this.label} has its own web interface${address
                        ? html`, at <span class="ag-pid-mono">${address}</span>` : nothing}.
                    Sign in there as <span class="ag-pid-mono">${this.credentials.username}</span>
                    with this password. Note it down: Audiogravity does not keep it.
                </p>
                <div class="form-field">
                    <label class="form-label" for=${this._inputId}>Password</label>
                    <input
                        id=${this._inputId}
                        class="form-control form-control--dialog ag-pid-password"
                        type="text"
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck="false"
                        .value=${this.value}
                        @input=${e => this._onInput(e)}>
                </div>
                ${problem ? html`<p class="ag-pid-warning">${problem}</p>` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-web-password-field', AgWebPasswordField);
