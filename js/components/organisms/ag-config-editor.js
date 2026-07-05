/**
 * @module AgConfigEditor
 * @description Organism component for editing configuration files in form or raw mode
 *
 * @element ag-config-editor
 *
 * @prop {Object} service - Service info { id, displayName, path }
 * @prop {Object} schema - Form schema
 * @prop {Object} formData - Current form data
 * @prop {String} rawContent - Current raw configuration
 * @prop {String} configFormat - Format: 'conf', 'ini', 'libconfig', 'xml'
 * @prop {Array} backups - List of available backups
 * @prop {Boolean} isGuest - Whether the user is a guest (cannot save)
 *
 * @fires back - Request to return to selection
 * @fires save - Request to save configuration: detail = { mode: 'form'|'raw', data: Object|String, rawContent: String }
 * @fires restore - Request to restore backup: detail = { filename }
 *
 * @dependency ag-validation-results - Validation feedback display
 * @dependency js/utils.js - autoExpandTextarea helper
 * @dependency css/config.css - Editor layout and styling
 */
import { LitElement, html, css } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { autoExpandTextarea } from '../utils-lit.js';
import { iconArrowLeft, iconCode, iconCheck, iconWarning, iconSave, iconSliders, iconClose, iconHistory, iconInfo } from '../../ag-icons.js';
import './ag-guided-config.js';

export class AgConfigEditor extends LitElement {
    static properties = {
        service: { type: Object },
        schema: { type: Object },
        formData: { type: Object },
        rawContent: { type: String },
        configFormat: { type: String },
        backups: { type: Array },
        isGuest: { type: Boolean },
        guided: { type: Boolean },
        outputs: { type: Array },
        librarySources: { type: Array },
        serviceOutput: { type: Object },

        currentMode: { state: true },
        isDirty: { state: true },
        validationMsg: { state: true },
        validationValid: { state: true },
        showBackups: { state: true },
        _restartAfterSave: { state: true },
        _showDiff: { state: true }
    };

    constructor() {
        super();
        this.service = null;
        this.schema = null;
        this.formData = {};
        this.rawContent = '';
        this.configFormat = 'conf';
        this.backups = [];
        this.isGuest = false;
        this.guided = false;
        this.outputs = [];
        this.librarySources = [];
        this.serviceOutput = null;

        this.currentMode = 'form';
        this.isDirty = false;
        this.validationMsg = '';
        this.validationValid = true;
        this.showBackups = false;
        this._restartAfterSave = true;
        this._showDiff = false;

        this._originalFormData = {};
        this._originalRawContent = '';
        this._cmInstance = null;
    }

    createRenderRoot() {
        return this; // Use Light DOM for CodeMirror & global CSS
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._cmInstance) {
            this._cmInstance.toTextArea();
            this._cmInstance = null;
        }
    }

    willUpdate(changedProperties) {
        // A parent-driven (re)load sets formData AND rawContent together; a user edit
        // in one mode changes only one of them. Re-capture the originals on a load so
        // a guided apply (which reloads the config) doesn't leave stale form/raw
        // baselines that a later mode switch would revert to (dropping the change).
        if (changedProperties.has('formData') && changedProperties.has('rawContent')) {
            this._originalFormData = JSON.parse(JSON.stringify(this.formData || {}));
            this._originalRawContent = this.rawContent || '';
            this.isDirty = false;
        }
        // Provisionable services open in the guided view by default.
        if (changedProperties.has('service')) {
            this.currentMode = this.guided ? 'guided' : 'form';
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('currentMode') && this.currentMode === 'raw') {
            this._initCodeMirror();
        }

        // Handle auto-expand for textareas in form mode
        if (this.currentMode === 'form') {
            this.querySelectorAll('textarea:not(.config-editor)').forEach(textarea => {
                autoExpandTextarea(textarea);
            });
        }
    }

    _initCodeMirror() {
        const textarea = this.querySelector('#configEditorTextarea');
        if (!textarea || typeof CodeMirror === 'undefined' || this._cmInstance) return;

        this._cmInstance = CodeMirror.fromTextArea(textarea, {
            mode: this._getCodeMirrorMode(this.configFormat),
            lineNumbers: true,
            lineWrapping: true,
            theme: 'default',
            autofocus: false,
            extraKeys: { Tab: false },
        });

        // Set fixed height to enable internal scrolling for large files
        this._cmInstance.setSize('100%', '600px');

        this._cmInstance.on('change', () => {
            this.rawContent = this._cmInstance.getValue();
            this._checkRawDirty();
            this._validateRawContent();
        });

        // initial validation
        this._validateRawContent();
    }

    _getCodeMirrorMode(format) {
        const modes = {
            ini: 'properties',
            conf: 'properties',
            libconfig: 'text/x-csrc',
            xml: 'xml',
        };
        return modes[format] || 'properties';
    }

    _checkRawDirty() {
        this.isDirty = this.rawContent !== this._originalRawContent;
        if (this._cmInstance) {
            const wrapper = this._cmInstance.getWrapperElement();
            if (this.isDirty) wrapper.classList.add('dirty');
            else wrapper.classList.remove('dirty');
        }
    }

    _validateRawContent() {
        if (!this.rawContent || this.rawContent.trim().length === 0) {
            this._setValidation(false, 'Configuration cannot be empty');
            return;
        }

        let valid = true;
        let error = null;

        switch (this.configFormat) {
            case 'xml': {
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(this.rawContent, 'text/xml');
                    const parserError = doc.querySelector('parsererror');
                    if (parserError) {
                        valid = false;
                        error = parserError.textContent || 'XML parsing error';
                    }
                } catch (e) {
                    valid = false;
                    error = e.message;
                }
                break;
            }
            case 'libconfig': {
                const lines = this.rawContent.split('\n');
                let braceCount = 0;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('#') || line.startsWith('//') || line.length === 0) continue;
                    for (const char of line) {
                        if (char === '{') braceCount++;
                        if (char === '}') braceCount--;
                    }
                    if (braceCount < 0) {
                        valid = false;
                        error = `Line ${i + 1}: Unexpected closing brace '}'`;
                        break;
                    }
                }
                if (valid && braceCount !== 0) {
                    valid = false;
                    error = `Unbalanced braces: ${braceCount > 0 ? 'missing closing' : 'extra closing'} brace(s)`;
                }
                break;
            }
            case 'ini':
            case 'conf': {
                const lines = this.rawContent.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('#') || line.startsWith(';') || line.length === 0) continue;
                    if (line.startsWith('[')) {
                        if (!line.endsWith(']')) {
                            valid = false;
                            error = `Line ${i + 1}: Invalid section header (missing closing bracket)`;
                            break;
                        }
                    }
                }
                break;
            }
        }

        if (valid) {
            this._setValidation(true, this.isDirty ? 'Valid configuration (modified)' : 'Valid configuration');
        } else {
            this._setValidation(false, error);
        }
    }

    _setValidation(valid, msg) {
        this.validationValid = valid;
        this.validationMsg = msg;
        if (this._cmInstance) {
            const wrapper = this._cmInstance.getWrapperElement();
            if (valid) wrapper.classList.remove('validation-error');
            else wrapper.classList.add('validation-error');
        }
    }

    _handleBack() {
        if (this.isDirty) {
            window.showConfirm(
                'Unsaved Changes',
                'You have unsaved changes. Are you sure you want to go back?'
            ).then(confirmed => {
                if (confirmed) {
                    this.dispatchEvent(new CustomEvent('back'));
                }
            });
        } else {
            this.dispatchEvent(new CustomEvent('back'));
        }
    }

    _handleToggleMode() {
        if (this.isDirty) {
            window.showConfirm(
                'Switch Mode',
                'Switching modes will discard unsaved changes. Continue?'
            ).then(confirmed => {
                if (confirmed) {
                    this._doToggleMode();
                }
            });
        } else {
            this._doToggleMode();
        }
    }

    _doToggleMode() {
        this.currentMode = this.currentMode === 'form' ? 'raw' : 'form';
        this._revertChanges();
    }

    /** Switch to an explicit mode (guided | form | raw), confirming discard if dirty. */
    _setMode(mode) {
        if (mode === this.currentMode) return;
        if (this.isDirty) {
            window.showConfirm(
                'Switch Mode',
                'Switching modes will discard unsaved changes. Continue?'
            ).then(confirmed => {
                if (confirmed) this._applyMode(mode);
            });
        } else {
            this._applyMode(mode);
        }
    }

    _applyMode(mode) {
        this.currentMode = mode;
        this._revertChanges();
    }

    _revertChanges() {
        this.formData = JSON.parse(JSON.stringify(this._originalFormData));
        this.rawContent = this._originalRawContent;
        this.isDirty = false;

        if (this._cmInstance && this.currentMode === 'raw') {
            this._cmInstance.setValue(this._originalRawContent);
            this._cmInstance.getWrapperElement().classList.remove('dirty');
        }

        // Re-trigger render
        this.requestUpdate();
    }

    _handleSave() {
        if (this.currentMode === 'raw' && !this.validationValid) {
            window.showToast('error', 'Invalid Configuration', this.validationMsg);
            return;
        }

        const restartNote = this._restartAfterSave
            ? 'The service will be restarted automatically.'
            : 'The service will NOT be restarted — apply changes manually when ready.';

        window.showConfirm(
            'Save Configuration',
            `This will update the configuration file. ${restartNote} Continue?`
        ).then(confirmed => {
            if (confirmed) {
                if (this.currentMode === 'raw' && this._cmInstance) {
                    this.rawContent = this._cmInstance.getValue();
                }
                this._showDiff = false;
                this.dispatchEvent(new CustomEvent('save', {
                    detail: {
                        mode: this.currentMode,
                        data: this.currentMode === 'form' ? this.formData : this.rawContent,
                        rawContent: this.rawContent,
                        restart: this._restartAfterSave
                    }
                }));
            }
        });
    }

    _handleCancel() {
        if (this.isDirty) {
            window.showConfirm(
                'Cancel Changes',
                'This will discard all unsaved changes. Continue?'
            ).then(confirmed => {
                if (confirmed) {
                    this._revertChanges();
                    window.showToast('info', 'Changes Discarded', 'Configuration reverted to original');
                }
            });
        } else {
            window.showToast('info', 'No Changes', 'There are no unsaved changes to cancel');
        }
    }

    _handleToggleBackups() {
        this.showBackups = !this.showBackups;
    }

    _handleRestore(filename) {
        window.showConfirm(
            'Restore Backup',
            `This will restore the configuration from ${filename}. Current configuration will be backed up. Continue?`
        ).then(confirmed => {
            if (confirmed) {
                this.dispatchEvent(new CustomEvent('restore', { detail: { filename } }));
            }
        });
    }

    _handleFieldChange(e, key, schemaType) {
        let value = e.target.value;

        if (e.target.tagName === 'TEXTAREA') {
            autoExpandTextarea(e.target);
        }

        if (e.target.type === 'checkbox') {
            value = e.target.checked;
        } else if (e.target.type === 'number') {
            value = parseInt(value, 10);
        } else if (e.target.tagName === 'TEXTAREA' && schemaType !== 'string') {
            try {
                value = JSON.parse(value);
            } catch (err) { }
        }

        this.formData = { ...this.formData, [key]: value };
        this.isDirty = JSON.stringify(this.formData) !== JSON.stringify(this._originalFormData);

        if (this.isDirty) {
            e.target.classList.add('dirty');
        } else {
            e.target.classList.remove('dirty');
        }
    }

    render() {
        if (!this.service) return html``;

        return html`
            <div class="config-editor-container active">
                <div class="config-editor-header">
                    <div class="config-file-info">
                        <h3>${this.service.displayName} Configuration</h3>
                        <span class="config-file-path">${this.service.path}</span>
                    </div>
                    <div class="config-header-actions ml-auto flex-center">
                        <div class="has-tooltip">
                            <button class="btn-action compact" @click=${this._handleBack}>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconArrowLeft}</svg> Back
                            </button>
                            <div class="tooltip tooltip-bottom">Return to service selection</div>
                        </div>
                        ${this.guided ? html`
                            <div class="config-mode-tabs" role="tablist">
                                <button class="config-mode-tab ${this.currentMode === 'guided' ? 'active' : ''}" @click=${() => this._setMode('guided')}>Guided</button>
                                <button class="config-mode-tab ${this.currentMode === 'form' ? 'active' : ''}" @click=${() => this._setMode('form')}>Structured</button>
                                <button class="config-mode-tab ${this.currentMode === 'raw' ? 'active' : ''}" @click=${() => this._setMode('raw')}>Expert</button>
                            </div>
                        ` : html`
                        <div class="has-tooltip">
                            <button class="btn-action compact config-mode-toggle" @click=${this._handleToggleMode}>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCode}</svg> ${this.currentMode === 'form' ? 'Expert Mode' : 'Form Mode'}
                            </button>
                            <div class="tooltip tooltip-bottom-right">Switch between Form view and Raw file editor</div>
                        </div>
                        `}
                    </div>
                </div>
                
                <div class=${classMap({ 'config-form-editor': true, 'active': this.currentMode === 'form' })}>
                    ${this.currentMode === 'form' ? this._renderForm() : ''}
                </div>
                
                <div class=${classMap({ 'config-raw-editor': true, 'active': this.currentMode === 'raw' })}>
                    <!-- Wrapping in a div prevents Lit from getting confused by CodeMirror's DOM manipulation -->
                    <div style="display: ${this.currentMode === 'raw' ? 'block' : 'none'}">
                        <textarea class="config-editor" id="configEditorTextarea">${this.rawContent}</textarea>
                    </div>
                        <div class=${classMap({
            'validation-message': true,
            'validation-success': this.validationValid && this.validationMsg,
            'validation-error': !this.validationValid
        })}>
                            ${this.validationMsg ? html`
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mr-xxs">${this.validationValid ? iconCheck : iconWarning}</svg>
                                ${this.validationMsg}
                            ` : ''}
                        </div>
                </div>

                ${this.currentMode === 'guided' ? html`
                    <div class="config-guided-editor active">
                        <ag-guided-config .serviceId=${this.service?.id} .outputs=${this.outputs}
                            .librarySources=${this.librarySources} .serviceOutput=${this.serviceOutput}></ag-guided-config>
                    </div>
                ` : html`
                <div class="config-actions">
                    ${!this.isGuest ? html`
                        <div class="has-tooltip">
                            <button class="btn-action compact success" @click=${this._handleSave}>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSave}</svg> Save Changes
                            </button>
                            <div class="tooltip">${this._restartAfterSave ? 'Save and restart service' : 'Save without restarting service'}</div>
                        </div>
                        ${this.isDirty ? html`
                            <div class="has-tooltip">
                                <button class="btn-action compact" @click=${() => { this._showDiff = !this._showDiff; }}>
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSliders}</svg> ${this._showDiff ? 'Hide Diff' : 'Preview Changes'}
                                </button>
                                <div class="tooltip">Show what changed before saving</div>
                            </div>
                        ` : ''}
                        <label class="restart-toggle has-tooltip">
                            <input type="checkbox" .checked=${this._restartAfterSave}
                                   @change=${(e) => { this._restartAfterSave = e.target.checked; }}>
                            <span class="restart-toggle-label">Restart after save</span>
                            <div class="tooltip tooltip-bottom">Automatically restart the service after saving</div>
                        </label>
                    ` : ''}
                    <div class="has-tooltip">
                        <button class="btn-action compact" @click=${this._handleCancel}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconClose}</svg> Cancel
                        </button>
                        <div class="tooltip">Discard unsaved changes</div>
                    </div>
                    <div class="has-tooltip">
                        <button class="btn-action compact" @click=${this._handleToggleBackups}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconHistory}</svg> Backups (${this.backups.length})
                        </button>
                        <div class="tooltip">View and restore previous configuration versions</div>
                    </div>
                </div>
                
                ${this.showBackups ? this._renderBackups() : ''}
                ${this._showDiff ? html`
                    <ag-config-diff
                        mode=${this.currentMode}
                        .oldText=${this._originalRawContent}
                        .newText=${this._cmInstance ? this._cmInstance.getValue() : this.rawContent}
                        .schema=${this.schema}
                        .formData=${this.formData}
                        .originalFormData=${this._originalFormData}>
                    </ag-config-diff>
                ` : ''}
                `}
            </div>
        `;
    }

    _renderForm() {
        if (!this.schema) return html`<p>No schema available for this service.</p>`;

        const vals = Object.values(this.formData);
        const isBlank = vals.length > 0 && vals.every(
            v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0
        );

        const fields = Object.entries(this.schema).map(([key, fieldSchema]) => {
            return this._renderField(key, fieldSchema, this.formData[key]);
        });

        return html`
            ${isBlank ? html`
                <div class="config-blank-hint">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconInfo}</svg>
                    <span>Blank configuration — all sections are empty, package defaults are active.
                        Switch to
                        <button class="config-blank-hint-btn" @click=${this._handleToggleMode}>Expert Mode</button>
                        to view and uncomment settings.
                    </span>
                </div>
            ` : ''}
            ${fields}
        `;
    }

    _renderField(key, fieldSchema, value) {
        const inputId = `config_field_${key}`;
        const val = value !== undefined ? value : (fieldSchema.default !== undefined ? fieldSchema.default : '');
        const isDirty = JSON.stringify(this.formData[key]) !== JSON.stringify(this._originalFormData[key]);
        const inputClasses = { dirty: isDirty };

        switch (fieldSchema.type) {
            case 'string':
                return html`
                    <div class="config-field">
                        <label for=${inputId}>${fieldSchema.label}</label>
                        <input 
                            class=${classMap(inputClasses)}
                            type="text" 
                            id=${inputId}
                            name=${key}
                            .value=${val}
                            ?required=${fieldSchema.required}
                            @input=${(e) => this._handleFieldChange(e, key, 'string')}
                        >
                        <span class="field-help">${fieldSchema.description || ''}</span>
                    </div>
                `;

            case 'integer':
                return html`
                    <div class="config-field">
                        <label for=${inputId}>${fieldSchema.label}</label>
                        <input 
                            class=${classMap({ ...inputClasses, compact: true })}
                            type="number" 
                            id=${inputId}
                            name=${key}
                            .value=${val}
                            min=${fieldSchema.min !== undefined ? fieldSchema.min : ''}
                            max=${fieldSchema.max !== undefined ? fieldSchema.max : ''}
                            @input=${(e) => this._handleFieldChange(e, key, 'integer')}
                        >
                        <span class="field-help">${fieldSchema.description || ''}</span>
                    </div>
                `;

            case 'boolean':
                return html`
                    <div class="config-field">
                        <label class="switch">
                            <input 
                                type="checkbox" 
                                id=${inputId}
                                name=${key}
                                .checked=${!!val}
                                @change=${(e) => this._handleFieldChange(e, key, 'boolean')}
                            >
                            <span class="slider"></span>
                        </label>
                        <label for=${inputId}>${fieldSchema.label}</label>
                        <span class="field-help">${fieldSchema.description || ''}</span>
                    </div>
                `;

            case 'enum':
                return html`
                    <div class="config-field">
                        <label for=${inputId}>${fieldSchema.label}</label>
                        <select 
                            class=${classMap({ themeSelect: true, ...inputClasses })} 
                            id=${inputId} 
                            name=${key}
                            @change=${(e) => this._handleFieldChange(e, key, 'enum')}>
                            ${fieldSchema.options.map(opt => html`
                                <option value=${opt} ?selected=${val === opt}>
                                    ${opt}
                                </option>
                            `)}
                        </select>
                        <span class="field-help">${fieldSchema.description || ''}</span>
                    </div>
                `;

            default:
                const strVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
                return html`
                    <div class="config-field">
                        <label for=${inputId}>${fieldSchema.label}</label>
                        <textarea 
                            class=${classMap(inputClasses)}
                            id=${inputId}
                            name=${key}
                            rows="4"
                            @input=${(e) => this._handleFieldChange(e, key, fieldSchema.type)}
                        >${strVal}</textarea>
                        <span class="field-help">${fieldSchema.description || ''} (JSON format)</span>
                    </div>
                `;
        }
    }

    _renderBackups() {
        return html`
            <div class="config-backups-section">
                <h3 class="config-backups-title">Available Backups</h3>
                <div id="configBackupsList">
                    ${this.backups.length === 0 ? html`<p class="text-secondary-color text-sm">No backups available</p>` : ''}
                    ${this.backups.map(backup => html`
                        <div class="config-backup-item">
                            <span class="config-backup-filename">${backup.filename}</span>
                            <button class="config-backup-restore-btn" @click=${() => this._handleRestore(backup.filename)}>
                                Restore
                            </button>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-config-editor', AgConfigEditor);
