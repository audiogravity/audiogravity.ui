/**
 * @module AgJsonConfigModal
 * @description Generic modal for editing JSON files using CodeMirror.
 * 
 * @element ag-json-config-modal
 * 
 * @attr {boolean} is-open - Modal visibility state
 * @attr {boolean} isGuest - Current user role
 * @attr {string} configText - Initial JSON content
 * @attr {boolean} allowFileTransfer - Show Download / Upload buttons for the edited file
 *
 * @dependency ag-modal
 * @dependency js/core/CodeMirrorController.js - CodeMirror 5, the JSON editor, loaded on first open
 * @dependency css/components/forms.css, css/validation.css - Form and validation styles
 * 
 * @fires save-request - Dispatched when SAVE button is clicked, with {config} detail
 * @fires close-request - Dispatched when modal requests to close
 */

import { LitElement, html } from 'lit';
import { iconCheck, iconWarning, iconPencil, iconDownload, iconUpload } from '../../ag-icons.js';
import './ag-modal.js';
import { downloadTextFile } from '../../ui-helpers.js';
import { CodeMirrorController, EDITOR_LOAD_FAILED } from '../../core/CodeMirrorController.js';

export class AgJsonConfigModal extends LitElement {
    static properties = {
        isOpen: { type: Boolean, attribute: 'is-open' },
        isGuest: { type: Boolean },
        configText: { type: String },
        modalTitle: { type: String },
        filename: { type: String },
        allowFileTransfer: { type: Boolean },

        // Internal state
        _isEditMode: { type: Boolean, state: true },
        _isValid: { type: Boolean, state: true },
        _validationMessage: { type: String, state: true },
        _isDirty: { type: Boolean, state: true },
        _isLoading: { type: Boolean, state: true }
    };

    constructor() {
        super();
        this.isOpen = false;
        this.isGuest = false;
        this.configText = '';
        this.modalTitle = 'Packages Configuration';
        this.filename = 'packages-config.json';
        this.allowFileTransfer = false;

        this._isEditMode = false;
        this._isValid = true;
        this._validationMessage = '';
        this._isDirty = false;
        this._isLoading = false;
        /** Loads CodeMirror on demand and says where that stands (.state). */
        this._cm = new CodeMirrorController(this);

        // Unique IDs to avoid conflicts when multiple instances are in the DOM
        const uid = Math.random().toString(36).slice(2, 9);
        this._editorId = `json-config-editor-${uid}`;
        this._editorWrapperId = `json-config-editor-wrapper-${uid}`;
        this._validationId = `json-config-validation-${uid}`;
        this._fileInputId = `json-config-file-${uid}`;

        this._editor = null;
        this._handleClose = this._handleClose.bind(this);
        this._enableEditMode = this._enableEditMode.bind(this);
        this._handleSave = this._handleSave.bind(this);
        this._handleDownload = this._handleDownload.bind(this);
        this._handleUploadClick = this._handleUploadClick.bind(this);
        this._handleFileSelected = this._handleFileSelected.bind(this);
    }

    createRenderRoot() {
        return this; // Light DOM for CodeMirror compatibility and CSS
    }

    updated(changedProperties) {
        if (changedProperties.has('isOpen')) {
            if (this.isOpen) {
                this._resetState();
                this._initCodeMirror();
            } else {
                this._isEditMode = false;
            }
        }

        if (changedProperties.has('configText') && this._editor && this.isOpen && !this._isEditMode) {
            this._editor.setValue(this.configText);
            this._editor.setOption('readOnly', true);

            // Allow CodeMirror to render
            setTimeout(() => {
                if (this._editor) this._editor.refresh();
            }, 100);
        }
    }

    _resetState() {
        this._isEditMode = false;
        this._isValid = true;
        this._validationMessage = '';
        this._isDirty = false;
        this._isLoading = false;
    }

    /**
     * Show the file in the editor, building it — and loading CodeMirror — on first open.
     *
     * The library is a chunk of its own, loaded by this._cm (CodeMirrorController): this
     * component is in the main bundle, and a static import would bring the editor along
     * with it. Its textarea is never filled without the editor, so until the editor
     * exists the modal says it is loading — or that it failed — rather than show what
     * looks like an empty file; Edit and Upload wait for it too.
     */
    async _initCodeMirror() {
        if (!this._editor) {
            await this._cm.build((CodeMirror) => this._buildEditor(CodeMirror));
            if (!this._editor) {
                if (this._cm.state === 'failed') {
                    this._isValid = false;
                    this._validationMessage = EDITOR_LOAD_FAILED;
                }
                return;
            }
        } else {
            // Reopened: let the modal lay itself out again before the editor measures.
            await this._rendered();
        }
        this._showFile();
    }

    /**
     * Wait until this component and its ag-modal have rendered: the textarea is in the
     * body ag-modal renders, after this component's own update.
     *
     * @returns {Promise<void>}
     */
    async _rendered() {
        await this.updateComplete;
        await this.querySelector('ag-modal')?.updateComplete;
    }

    /**
     * Build the editor on the modal's textarea.
     *
     * A modal closed meanwhile wants no editor. A textarea missing once both have
     * rendered is a failed build, said so — rather than "Loading the editor…" for as
     * long as the modal stays open.
     *
     * @param {Function} CodeMirror - The CodeMirror constructor.
     * @returns {Promise<?Object>} The editor, or null if the modal was closed first.
     */
    async _buildEditor(CodeMirror) {
        await this._rendered();
        if (!this.isOpen) return null;
        const textarea = this.querySelector(`#${this._editorId}`);
        if (!textarea) throw new Error('the editor textarea is not in the modal');

        const editor = CodeMirror.fromTextArea(textarea, {
            mode: { name: "javascript", json: true },
            theme: 'default',
            lineNumbers: true,
            readOnly: true,
            lineWrapping: false,
            matchBrackets: true,
            autoCloseBrackets: true,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            indentUnit: 2,
            tabSize: 2,
            indentWithTabs: false
        });
        editor.on('change', () => this._validateCode());
        this._editor = editor;
        return editor;
    }

    /** Show the file in the editor and make the editor measure itself again. */
    _showFile() {
        if (!this._editor) return;
        // Edit may have been pressed meanwhile: then the user is editing, and what they
        // see must stay theirs and stay writable.
        if (!this._isEditMode) {
            this._editor.setOption('readOnly', true);
            this._editor.setValue(this.configText);
        }

        const wrapper = this._editor.getWrapperElement();
        const rawEditorDiv = wrapper.parentElement;
        if (rawEditorDiv) {
            rawEditorDiv.classList.add('active');
        }

        this._editor.refresh();
        setTimeout(() => this._editor?.refresh(), 100); // UI double check
    }

    _validateCode() {
        if (!this._isEditMode) return;

        const configText = this._editor.getValue();
        this._isDirty = true;

        try {
            JSON.parse(configText);
            this._isValid = true;
            this._validationMessage = 'Valid JSON';
        } catch (e) {
            this._isValid = false;
            if (e instanceof SyntaxError) {
                this._validationMessage = `Invalid JSON: ${e.message}`;
            } else {
                this._validationMessage = 'Invalid Data';
            }
        }
    }

    _enableEditMode() {
        if (!this._editor) return;
        this._isEditMode = true;
        this._editor.setOption('readOnly', false);

        this._isValid = true;
        this._validationMessage = 'Valid JSON (not modified)';
        this._isDirty = false;

        this._editor.focus();
    }

    _handleSave() {
        if (!this._isValid) return;

        const configText = this._editor.getValue();
        let parsedConfig;

        try {
            parsedConfig = JSON.parse(configText);
        } catch (e) {
            this._isValid = false;
            this._validationMessage = `Parse Error before save: ${e.message}`;
            return;
        }

        this._validationMessage = 'Valid JSON - Saving...';

        this.dispatchEvent(new CustomEvent('save-request', {
            bubbles: true,
            composed: true,
            detail: { config: parsedConfig }
        }));
    }

    /**
     * Download the currently displayed JSON as a local file.
     * Uses the live editor content when available, else the initial configText.
     */
    _handleDownload() {
        const content = this._editor ? this._editor.getValue() : (this.configText || '');
        downloadTextFile(content, this.filename || 'config.json', 'application/json');
    }

    /** Open the native file picker for uploading a replacement file — once the editor is there to show it. */
    _handleUploadClick() {
        if (!this._editor) return;
        const input = this.querySelector(`#${this._fileInputId}`);
        if (input) input.click();
    }

    /**
     * Load the selected file into the editor for review.
     * The content is not persisted here — the user reviews it and the existing
     * Save flow validates it before saving.
     * @param {Event} e - change event from the file input
     */
    async _handleFileSelected(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';  // allow re-selecting the same file later
        if (!file) return;

        let text;
        try {
            text = await file.text();
        } catch (err) {
            this._isEditMode = true;
            this._isValid = false;
            this._validationMessage = `Cannot read file: ${err.message}`;
            return;
        }

        // Switch to edit mode and drop the file content into the editor; the
        // 'change' handler validates the JSON syntax automatically.
        if (!this._isEditMode) this._enableEditMode();
        // Upload waits for the editor (_handleUploadClick), so it is there.
        this._editor?.setValue(text);
    }

    _handleClose() {
        this.isOpen = false;
        this.dispatchEvent(new CustomEvent('close-request', { bubbles: true, composed: true }));
    }

    render() {
        const title = this._isEditMode ? `${this.modalTitle} (Edit Mode)` : `${this.modalTitle} (View Mode)`;

        let validationClass = 'validation-message';
        // Outside edit mode only one thing invalidates the view: the editor failed to load.
        if (this._isEditMode || !this._isValid) {
            validationClass += this._isValid ? ' validation-success' : ' validation-error';
        }

        const wrapperClasses = `config-raw-editor active ${this._isDirty ? 'dirty' : ''} ${!this._isValid && this._isEditMode ? 'validation-error' : ''}`;

        return html`
            <ag-modal 
                ?show=${this.isOpen} 
                @modal-close=${this._handleClose}
                heading=${title}
                size="large"
                .bodyTemplate=${html`
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>${this.filename}</label>
                        <div class="validation-wrapper">
                            <div class="${wrapperClasses}" id="${this._editorWrapperId}">
                                <!-- Read-only: a placeholder until CodeMirror replaces it (_initCodeMirror). -->
                                <textarea id="${this._editorId}" class="config-editor" readonly></textarea>
                            </div>
                            <div class="${validationClass}" id="${this._validationId}">
                                ${this._validationMessage ? html`
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">${this._isValid ? iconCheck : iconWarning}</svg>
                                    ${this._validationMessage}
                                ` : this._cm.state === 'loading' ? 'Loading the editor…' : ''}
                            </div>
                        </div>
                        ${this.allowFileTransfer ? html`
                            <input type="file" id="${this._fileInputId}" accept="application/json,.json" hidden @change=${this._handleFileSelected}>
                        ` : ''}
                    </div>
                `}
                .footerTemplate=${html`
                    <button class="btn-action" @click=${this._handleClose} ?disabled=${this._isLoading}>
                        Cancel
                    </button>
                    ${this.allowFileTransfer ? html`
                        <button class="btn-action" @click=${this._handleDownload} ?disabled=${this._isLoading}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg> Download
                        </button>
                    ` : ''}
                    ${this.allowFileTransfer && !this.isGuest ? html`
                        <button class="btn-action" @click=${this._handleUploadClick} ?disabled=${this._isLoading}
                            aria-disabled="${this._cm.state === 'ready' ? 'false' : 'true'}">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUpload}</svg> Upload
                        </button>
                    ` : ''}
                    ${!this._isEditMode && !this.isGuest ? html`
                        <!-- Unavailable, not disabled, until the editor exists: a disabled button
                             throws the focus off itself (convention of ag-audio-software-page). -->
                        <button class="btn-action" @click=${this._enableEditMode}
                            aria-disabled="${this._cm.state === 'ready' ? 'false' : 'true'}">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPencil}</svg> Edit
                        </button>
                    ` : ''}
                    ${this._isEditMode ? html`
                        <button class="btn-action success" @click=${this._handleSave} ?disabled=${!this._isValid || this._isLoading}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCheck}</svg> Save
                        </button>
                    ` : ''}
                `}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-json-config-modal', AgJsonConfigModal);
