/**
 * @module AgPackageInstallDialog
 * @description Molecule shown before a package is installed, when the package
 * has something the installation itself would never show.
 *
 * Two things land here, and both exist because of what a silent install hides:
 *
 * - **The vendor's licence.** Signalyst ships its end-user licence agreement as
 *   a debconf note. Audiogravity installs with the noninteractive frontend,
 *   which skips notes — so the licence was being accepted by someone who was
 *   never shown it. Both Signalyst packages carry one: HQPlayer Embedded's runs
 *   to about 6 900 characters, the NAA's to about 7 000.
 * - **Which major line to install.** Signalyst keeps two major lines published
 *   side by side, and only the person installing knows which one their licence
 *   covers. Lines this box cannot install — a dependency nothing provides, as
 *   `libgmpris` for HQPlayer Embedded 5 on Debian 13 — are not offered; they are
 *   named, with what they lack, so nobody concludes the box is hiding them.
 * - **A password for the package's own web interface** (ag-web-password-field).
 *   HQPlayer Embedded's package installs its web interface with no credentials:
 *   the settings pages refuse everybody and every sign-in attempt floods its
 *   log. The field comes prefilled with a random password, shown in clear so it
 *   can be noted down, and the core sets it right after the install. Nothing is
 *   asked when the box already has credentials — a reinstall keeps them.
 *
 * The dialog fetches both itself — a molecule owns its data — and stands in for
 * the plain confirmation on EVERY install, not only the packages that have
 * something extra. Deciding beforehand would mean asking the core what a package
 * carries and then asking again from in here, and a package that starts shipping
 * a licence would be the one nobody thought to re-check. With nothing to show it
 * renders the same question the old confirmation asked.
 *
 * Host it at the level of `<body>` (ag-audio-software-page appends it there),
 * never inside a tab:
 * `.main-content` is `position: fixed`, which makes it a stacking context of
 * its own, and a modal inside it stays under the top bar, the tabs and the
 * player bar whatever its z-index. Measured at 1366×768: both buttons sat
 * under the player bar and every click landed on it.
 *
 * @element ag-package-install-dialog
 *
 * @attr {Object}  pkg  - The package being installed, as `/packages/` returns it
 * @attr {boolean} show - Whether the dialog is visible
 *
 * @fires install-confirmed - `{ packageId, version, webPassword }` — version is
 *   null when the package offers no choice, which means "whatever the package's
 *   own rule picks"; webPassword is null when the package asks for none
 * @fires modal-close - The dialog was dismissed without installing
 *
 * @dependency ag-modal
 * @dependency ag-web-password-field
 * @dependency css/audio-software.css - ag-pid-* styles
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import '../organisms/ag-modal.js';
import { generateWebPassword, webPasswordProblem } from './ag-web-password-field.js';

export class AgPackageInstallDialog extends LitElement {
    static properties = {
        pkg:  { type: Object },
        show: { type: Boolean },

        _loading:  { state: true },
        _notices:  { state: true },
        _versions: { state: true },
        _chosen:   { state: true },
        _accepted: { state: true },
        _failed:   { state: true },
        _unreadable:  { state: true },
        _unavailable: { state: true },
        _webPassword: { state: true },
    };

    constructor() {
        super();
        this.pkg  = null;
        this.show = false;
        this._loading  = false;
        this._notices  = [];
        this._versions = [];
        this._chosen   = null;
        this._accepted = false;
        this._failed   = false;
        this._unreadable  = false;
        this._unavailable = [];
        this._webPassword = '';
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    /**
     * Load on opening, and reset on closing.
     *
     * Reset matters: the agreement checkbox must never survive a close. Leaving
     * it ticked would carry one package's acceptance over to the next one the
     * operator opens.
     *
     * @param {Map} changed - Properties Lit reports as changed.
     */
    updated(changed) {
        if (!changed.has('show')) return;
        if (this.show) {
            this._load();
        } else {
            this._accepted = false;
            this._chosen = null;
            this._notices = [];
            this._versions = [];
            this._failed = false;
            this._unreadable = false;
            this._unavailable = [];
            // Never kept past a close: the next dialog draws its own.
            this._webPassword = '';
        }
    }

    /**
     * Fetch what this package wants read, and what it lets the operator pick.
     *
     * The two are asked for together and neither is fatal: a vendor that cannot
     * be reached leaves the dialog able to say so, which is better than an
     * install that starts with nothing shown.
     *
     * @returns {Promise<void>}
     */
    async _load() {
        if (!this.pkg) return;
        this._loading = true;
        this._failed = false;
        if (this._asksWebPassword) this._webPassword = generateWebPassword();
        const id = encodeURIComponent(this.pkg.id);
        try {
            const [notices, versions] = await Promise.all([
                apiGet(`/packages/${id}/notices`).catch(() => null),
                this.pkg.offers_version_choice
                    ? apiGet(`/packages/${id}/versions`).catch(() => null)
                    : Promise.resolve(null),
            ]);
            this._notices = notices?.notices ?? [];
            // Unreadable is NOT "nothing to accept": the terms exist, they could
            // not be fetched. That confusion once left Install live with no
            // licence on screen.
            this._unreadable = notices === null || notices?.readable === false;
            this._versions = versions?.versions ?? [];
            this._unavailable = versions?.unavailable ?? [];
            this._failed = Boolean(this.pkg.offers_version_choice) && versions === null;
            this._chosen = this._defaultVersion();
        } finally {
            this._loading = false;
        }
    }

    /**
     * Which line to preselect.
     *
     * The one already installed, when there is one: an operator who holds a
     * licence for it is the common case, and preselecting a different major
     * would invite exactly the mistake this chooser exists to prevent.
     * Otherwise the newest, which is what the box would have taken by itself.
     *
     * @returns {string|null} The version, or null when there is nothing to choose.
     */
    _defaultVersion() {
        if (!this._versions.length) return null;
        const installed = this.pkg?.installed_version;
        if (installed) {
            const major = String(installed).match(/^(?:\d+:)?(\d+)/)?.[1];
            const sameLine = this._versions.find(v => String(v.major) === major);
            if (sameLine) return sameLine.version;
        }
        return this._versions[0].version;
    }

    /**
     * Whether the operator still has to agree to something.
     *
     * Also when the terms could not be read: accepting them is still what
     * installing means, and the core refuses the install without it.
     *
     * @returns {boolean}
     */
    get _needsAgreement() {
        return this._notices.length > 0 || this._unreadable;
    }

    /**
     * Whether this install sets a web interface password.
     *
     * Not when the box already has credentials: the core keeps them, so asking
     * for a new one would promise a change that does not happen.
     *
     * @returns {boolean}
     */
    get _asksWebPassword() {
        const credentials = this.pkg?.web_credentials;
        return Boolean(credentials) && !credentials.already_set;
    }

    /** @returns {boolean} Whether Install may be pressed. */
    get _canInstall() {
        if (this._loading) return false;
        if (this._needsAgreement && !this._accepted) return false;
        if (this._versions.length && !this._chosen) return false;
        if (this._asksWebPassword && webPasswordProblem(this._webPassword)) return false;
        return true;
    }

    /**
     * Emit the confirmation.
     *
     * Reached through an arrow function in the template, deliberately: the
     * buttons are handed to `ag-modal` as its `footerTemplate`, and Lit binds a bare
     * `@click=${this._method}` to the element that RENDERS the template — the
     * modal — not to the one that built it. Bound that way, every `this` in
     * here pointed at ag-modal, `_canInstall` was undefined, and the button did
     * nothing at all.
     */
    _confirm() {
        if (!this._canInstall) return;
        this.dispatchEvent(new CustomEvent('install-confirmed', {
            bubbles: true,
            composed: true,
            detail: {
                packageId: this.pkg?.id,
                version: this._chosen,
                webPassword: this._asksWebPassword ? this._webPassword : null,
            },
        }));
    }

    _close() {
        this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }));
    }

    /**
     * The version chooser, with the lines this box cannot install under it.
     *
     * One section for both: the lines left out are part of the answer to "which
     * version", and outside the section they sat after its closing space, flush
     * against the next section's heading as if they belonged to it. The section
     * also stands when no line can be installed, so that sentence is never left
     * without the space every other block of the dialog has.
     *
     * @returns {import('lit').TemplateResult|typeof nothing}
     */
    _renderVersions() {
        if (!this._versions.length && !this._unavailable.length) return nothing;
        return html`
            <div class="ag-pid-section">
                ${this._versions.length ? html`
                    <h4 class="ag-pid-heading">Which version</h4>
                    <p class="ag-pid-hint">
                        Pick the version your licence covers. Signalyst's terms provide for a
                        time-limited trial.
                    </p>
                    ${this._versions.map(entry => html`
                        <label class="ag-pid-choice">
                            <input
                                type="radio"
                                name="ag-pid-version"
                                .value=${entry.version}
                                .checked=${this._chosen === entry.version}
                                @change=${() => { this._chosen = entry.version; }}>
                            <span class="ag-pid-choice-major">Version ${entry.major}</span>
                            <span class="ag-pid-choice-version">${entry.version}</span>
                        </label>
                    `)}
                ` : nothing}
                ${this._renderUnavailable()}
            </div>
        `;
    }

    /**
     * Lines the vendor publishes that this box cannot install, and why.
     *
     * @returns {import('lit').TemplateResult|typeof nothing}
     */
    _renderUnavailable() {
        if (!this._unavailable.length) return nothing;
        return html`
            <p class="ag-pid-hint ag-pid-unavailable">
                ${this._unavailable.map(line => html`
                    Version ${line.major} (${line.version}) is published but cannot be
                    installed on this system: it needs ${line.missing.join(', ')}, which no
                    configured source provides.
                `)}
            </p>
        `;
    }

    /**
     * The password for the package's own web interface (ag-web-password-field).
     *
     * @returns {import('lit').TemplateResult|typeof nothing}
     */
    _renderWebCredentials() {
        const credentials = this.pkg?.web_credentials;
        if (!credentials) return nothing;
        if (credentials.already_set) {
            return html`
                <p class="ag-pid-hint">
                    ${this.pkg.label}'s web interface already has a password on this system; it is kept.
                </p>`;
        }
        return html`
            <ag-web-password-field
                .credentials=${credentials}
                .label=${this.pkg.label}
                .value=${this._webPassword}
                @password-input=${e => { this._webPassword = e.detail.value; }}>
            </ag-web-password-field>
        `;
    }

    /** @returns {import('lit').TemplateResult|typeof nothing} The vendor's notices. */
    _renderNotices() {
        if (!this._needsAgreement) return nothing;
        return html`
            ${this._unreadable ? html`
                <p class="ag-pid-warning">
                    The terms ${this.pkg?.label} asks you to accept could not be read from
                    the package just now. Installing it still means accepting them${this.pkg?.doc_url
                        ? html` — the vendor publishes them at
                            <a href=${this.pkg.doc_url} target="_blank" rel="noopener">${this.pkg.doc_url}</a>`
                        : nothing}.
                </p>` : nothing}
            ${this._notices.map(notice => html`
                <div class="ag-pid-section">
                    <h4 class="ag-pid-heading">${notice.title}</h4>
                    <div class="ag-pid-notice" tabindex="0">${notice.body}</div>
                </div>
            `)}
            <label class="ag-pid-agree">
                <input
                    type="checkbox"
                    .checked=${this._accepted}
                    @change=${e => { this._accepted = e.target.checked; }}>
                <span>${this._unreadable
                    ? 'I accept the vendor\'s terms'
                    : 'I have read and accept the terms above'}</span>
            </label>
        `;
    }

    /** @returns {import('lit').TemplateResult} The dialog body. */
    _renderBody() {
        if (this._loading) {
            return html`<p class="ag-pid-hint">Reading what ${this.pkg?.label} asks…</p>`;
        }
        const nothingToShow = !this._versions.length && !this._needsAgreement
            && !this.pkg?.web_credentials;
        return html`
            ${nothingToShow ? html`
                <p class="ag-pid-hint">
                    Install ${this.pkg?.label}? Nothing is configured by installing it —
                    that is a separate step.
                </p>` : nothing}
            ${this._failed ? html`
                <p class="ag-pid-warning">
                    The vendor could not be reached, so the versions it publishes cannot
                    be listed right now.
                </p>` : nothing}
            ${this._renderVersions()}
            ${this._renderWebCredentials()}
            ${this._renderNotices()}
        `;
    }

    /**
     * The dialog's buttons, for the modal's footer.
     *
     * Not the end of the body: the body is what scrolls once a licence makes it
     * taller than the screen, and buttons at its foot scrolled away with it.
     * The footer stays put under it.
     *
     * @returns {import('lit').TemplateResult}
     */
    _renderActions() {
        return html`
            <button class="action-btn secondary" @click=${() => this._close()}>Cancel</button>
            <button
                class="action-btn primary"
                ?disabled=${!this._canInstall}
                @click=${() => this._confirm()}>
                Install${this._chosen ? ` ${this._chosen}` : ''}
            </button>
        `;
    }

    render() {
        if (!this.pkg) return html``;
        return html`
            <ag-modal
                title="Install ${this.pkg.label}"
                ?show=${this.show}
                size="large"
                .bodyTemplate=${this._renderBody()}
                .footerTemplate=${this._renderActions()}
                @modal-close=${() => this._close()}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-package-install-dialog', AgPackageInstallDialog);
