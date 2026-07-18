/**
 * @module AgNetworkMountForm
 * @description "Add network share (NAS)" panel for the music-library pickers.
 * Collapsible CIFS/SMB form: label, host, share, optional credentials and a
 * read-only toggle. Submitting asks for the admin password (showPasswordConfirm,
 * captured transiently — never held in component state) then POSTs
 * /audio-stack/mounts — the core actually mounts the share before answering
 * (connectivity test) and rolls back on failure, so a success here means the
 * share is browsable. Also lists the AG-created shares with a remove action;
 * a 409 (share in use / busy) offers a forced removal.
 *
 * Autonomous molecule (own API calls, light DOM), embedded by
 * ag-prov-library-picker so every library picker gets it for free.
 *
 * @element ag-network-mount-form
 * @fires mount-created - Bubbles. detail: { mount } — after a successful mount;
 *   parents refresh their source list (the new share is mounted and visible).
 * @fires mount-removed - Bubbles. detail: { slug, mountpoint } — after a removal.
 * @dependency js/api.js
 * @dependency js/ui-helpers.js
 * @dependency js/ag-icons.js
 * @dependency css/audio-stack.css (ag-nmf-* block)
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost, apiDelete } from '../../api.js';
import { showConfirm, showPasswordConfirm, getUserFriendlyError } from '../../ui-helpers.js';
import { svgIcon } from '../utils-lit.js';
import { iconPlus, iconTrash, iconWifi, iconSpinner } from '../../ag-icons.js';

export class AgNetworkMountForm extends LitElement {
    static properties = {
        _open:    { state: true },
        _busy:    { state: true },
        _error:   { state: true },
        _mounts:  { state: true },
        _form:    { state: true },
    };

    constructor() {
        super();
        this._open = false;
        this._busy = false;
        this._error = '';
        /** @type {Array<{slug: string, label: string, host: string, share: string, mountpoint: string, mounted: boolean, in_use: boolean}>} */
        this._mounts = [];
        this._form = this._emptyForm();
    }

    createRenderRoot() {
        return this; // Light DOM (global theme + audio-stack.css)
    }

    /** @returns {object} A fresh form state (no admin password — asked at submit). */
    _emptyForm() {
        return {
            label: '', host: '', share: '',
            username: '', password: '',
            read_only: true,
        };
    }

    /** Toggle the panel; load the existing AG mounts on first open. */
    async _toggle() {
        this._open = !this._open;
        this._error = '';
        if (this._open) await this._loadMounts();
    }

    /** Refresh the list of AG-managed mounts (non-blocking on failure). */
    async _loadMounts() {
        try {
            this._mounts = await apiGet('/audio-stack/mounts');
        } catch (e) {
            console.error('[network-mount] list failed:', e);
        }
    }

    /**
     * Update one form field.
     * @param {string} field - Form field name.
     * @param {string|boolean} value - New value.
     */
    _set(field, value) {
        this._form = { ...this._form, [field]: value };
    }

    /** @returns {string} Client-side validation error, or '' when submittable. */
    _validate() {
        const f = this._form;
        if (!f.label.trim() || !f.host.trim() || !f.share.trim()) {
            return 'Label, host and share are required.';
        }
        if (!!f.username.trim() !== !!f.password) {
            return 'Provide both username and password, or neither (guest share).';
        }
        return '';
    }

    /** Ask for the admin password, then mount (the core tests the share live). */
    async _submit() {
        const invalid = this._validate();
        if (invalid) { this._error = invalid; return; }
        const adminPassword = await showPasswordConfirm(
            'Mount network share',
            'The share is mounted and tested right away, and its credentials are '
            + 'stored on the box. Enter your admin password to confirm.'
        );
        if (!adminPassword) return;
        this._busy = true;
        this._error = '';
        try {
            const f = this._form;
            const mount = await apiPost('/audio-stack/mounts', {
                label: f.label.trim(),
                host: f.host.trim(),
                share: f.share.trim(),
                username: f.username.trim() || null,
                password: f.password || null,
                read_only: f.read_only,
                admin_password: adminPassword,
            });
            this._form = this._emptyForm();
            await this._loadMounts();
            this.dispatchEvent(new CustomEvent('mount-created', {
                detail: { mount }, bubbles: true, composed: true,
            }));
        } catch (e) {
            this._error = getUserFriendlyError(e);
        } finally {
            this._busy = false;
        }
    }

    /**
     * Remove an AG-managed share (confirmation; forced retry on a 409 busy).
     * @param {{slug: string, label: string, in_use: boolean}} mount - The share.
     */
    async _remove(mount) {
        this._error = '';
        const sure = await showConfirm(
            'Remove network share',
            `Remove “${mount.label}”?`
            + (mount.in_use
                ? ' MPD currently uses it as the music library — playback and the '
                  + 'library view will break until you pick another source.'
                : ''),
            { okLabel: 'Remove' }
        );
        if (!sure) return;
        this._busy = true;
        try {
            await this._delete(mount.slug, mount.in_use);
            await this._loadMounts();
            this.dispatchEvent(new CustomEvent('mount-removed', {
                detail: { slug: mount.slug, mountpoint: mount.mountpoint },
                bubbles: true, composed: true,
            }));
        } catch (e) {
            this._error = getUserFriendlyError(e);
        } finally {
            this._busy = false;
        }
    }

    /**
     * DELETE the mount; on a 409 (in use / busy) ask again and retry forced.
     * @param {string} slug - The mount's slug.
     * @param {boolean} knownInUse - Already warned about in-use at confirm time.
     */
    async _delete(slug, knownInUse) {
        try {
            await apiDelete(`/audio-stack/mounts/${slug}${knownInUse ? '?force=true' : ''}`);
        } catch (e) {
            if (e?.status !== 409) throw e;
            const force = await showConfirm(
                'Share is busy',
                `${getUserFriendlyError(e)} Force-remove it anyway (lazy unmount)?`,
                { okLabel: 'Force remove' }
            );
            if (!force) throw e;
            await apiDelete(`/audio-stack/mounts/${slug}?force=true`);
        }
    }

    render() {
        return html`
            <div class="ag-nmf">
                <button class="ag-prov-card ag-nmf-toggle" @click=${() => this._toggle()}>
                    ${svgIcon(iconPlus)}
                    <span class="ag-prov-card-icon">${svgIcon(iconWifi)}</span>
                    <span class="ag-prov-card-label">Add network share (NAS)</span>
                    <span class="badge neutral">CIFS/SMB</span>
                </button>
                ${this._open ? this._panel() : nothing}
            </div>`;
    }

    /**
     * Render the open panel: the AG-share list (state badges + remove) above
     * the add form.
     * @returns {import('lit').TemplateResult} The panel template.
     */
    _panel() {
        const f = this._form;
        return html`
            <div class="ag-nmf-panel">
                ${this._mounts.length ? html`
                    <div class="ag-nmf-list">
                        ${this._mounts.map((m) => html`
                            <div class="ag-nmf-row">
                                <span class="ag-nmf-row-label">${m.label}</span>
                                <span class="ag-nmf-row-path">//${m.host}/${m.share} → ${m.mountpoint}</span>
                                ${m.in_use ? html`<span class="badge warning">LIBRARY</span>` : nothing}
                                <span class="badge ${m.mounted ? 'success' : 'neutral'}">${m.mounted ? 'MOUNTED' : 'ON-DEMAND'}</span>
                                <button class="ag-nmf-remove" title="Remove share"
                                        ?disabled=${this._busy}
                                        @click=${() => this._remove(m)}>
                                    ${svgIcon(iconTrash)}
                                </button>
                            </div>`)}
                    </div>` : nothing}

                <fieldset class="ag-nmf-fields" ?disabled=${this._busy}>
                    <div class="ag-nmf-grid">
                        <input class="ag-prov-input" type="text" placeholder="Name (e.g. NAS Music)"
                               .value=${f.label} @input=${(e) => this._set('label', e.target.value)}>
                        <input class="ag-prov-input" type="text" placeholder="Host or IP (e.g. 192.168.1.20)"
                               .value=${f.host} @input=${(e) => this._set('host', e.target.value)}>
                        <input class="ag-prov-input" type="text" placeholder="Share (e.g. music)"
                               .value=${f.share} @input=${(e) => this._set('share', e.target.value)}>
                        <input class="ag-prov-input" type="text" placeholder="Username (empty = guest)"
                               autocomplete="off"
                               .value=${f.username} @input=${(e) => this._set('username', e.target.value)}>
                        <input class="ag-prov-input" type="password" placeholder="Password"
                               autocomplete="new-password"
                               .value=${f.password} @input=${(e) => this._set('password', e.target.value)}>
                    </div>
                    <label class="ag-nmf-ro">
                        <input type="checkbox" .checked=${f.read_only}
                               @change=${(e) => this._set('read_only', e.target.checked)}>
                        Mount read-only (recommended for a music library)
                    </label>
                </fieldset>
                <p class="ag-nmf-note">CIFS/SMB only — for NFS or a hand-managed mount, see the
                    manual's NAS section (anything mounted under /mnt is detected).</p>

                ${this._error ? html`<div class="ag-nmf-error">${this._error}</div>` : nothing}

                <button class="action-btn primary compact" ?disabled=${this._busy}
                        @click=${() => this._submit()}>
                    ${this._busy
                        ? html`<svg class="ag-spin" viewBox="0 0 24 24" width="1em" height="1em"
                                    fill="none" stroke="currentColor" stroke-width="1.5"
                                    stroke-linecap="round" stroke-linejoin="round">${iconSpinner}</svg>
                               Testing &amp; mounting…`
                        : 'Mount share'}
                </button>
            </div>`;
    }
}

customElements.define('ag-network-mount-form', AgNetworkMountForm);
