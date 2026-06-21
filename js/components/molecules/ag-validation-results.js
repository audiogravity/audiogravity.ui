import { LitElement, html, nothing } from 'lit';
import { iconCheck, iconClose, iconWarning, iconFileText } from '../../ag-icons.js';

/**
 * Validation Results Molecule
 * @element ag-validation-results
 *
 * @prop {Object} result - Validation result object from API
 * @prop {string} successTitle - Title when valid
 * @prop {string} successMessage - Custom message when valid
 * @prop {string} errorTitle - Title when invalid
 * @prop {boolean} showSummary - Whether to show services/profiles count summary
 *
 * @dependency css/validation.css - Validation result styling (.validation-result, .error-list, .warning-list)
 * @dependency css/validation.css, css/utilities.css - Validation and utility classes
 */
export class AgValidationResults extends LitElement {
    static properties = {
        result: { type: Object },
        successTitle: { type: String, attribute: 'success-title' },
        successMessage: { type: String, attribute: 'success-message' },
        errorTitle: { type: String, attribute: 'error-title' },
        showSummary: { type: Boolean, attribute: 'show-summary' }
    };

    constructor() {
        super();
        this.result = null;
        this.successTitle = 'Configuration Valid';
        this.successMessage = '';
        this.errorTitle = 'Validation Errors';
        this.showSummary = true;
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    render() {
        if (!this.result) return nothing;

        const { valid, errors = [], warnings = [], summary, properties_preview = {} } = this.result;

        return html`
            <div class="validation-results">
                ${valid && errors.length === 0 ? this._renderSuccess(summary) : nothing}
                ${errors.length > 0 ? this._renderErrors(errors) : nothing}
                ${warnings.length > 0 ? this._renderWarnings(warnings) : nothing}
                ${properties_preview && Object.keys(properties_preview).length > 0 ? this._renderPreview(properties_preview) : nothing}
            </div>
        `;
    }

    _renderSuccess(summary) {
        return html`
            <div class="validation-success">
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCheck}</svg>
                <strong>${this.successTitle}</strong>
                ${this.successMessage ? html`
                    <div class="validation-summary"><span>${this.successMessage}</span></div>
                ` : nothing}
                ${this.showSummary && summary ? html`
                    <div class="validation-summary">
                        <span>${summary.services_count} services</span>
                        <span>${summary.profiles_count} profiles</span>
                        ${summary.critical_services > 0 ? html`<span>${summary.critical_services} critical services</span>` : nothing}
                    </div>
                ` : nothing}
            </div>
        `;
    }

    _renderErrors(errors) {
        return html`
            <div class="validation-errors">
                <div class="validation-header error">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconClose}</svg>
                    <strong>${this.errorTitle}</strong>
                    <span class="badge badge-error">${errors.length}</span>
                </div>
                <ul class="validation-list">
                    ${errors.map(error => {
            const message = typeof error === 'string' ? error : error.message;
            const location = typeof error === 'string' ? null : error.location;
            const type = typeof error === 'string' ? null : error.type;

            return html`
                            <li class="validation-error">
                                ${location ? html`<strong>${location}</strong>` : nothing}
                                <p>${message}</p>
                                ${type ? html`<code class="error-type">${type}</code>` : nothing}
                            </li>
                        `;
        })}
                </ul>
            </div>
        `;
    }

    _renderWarnings(warnings) {
        return html`
            <div class="validation-warnings">
                <div class="validation-header warning">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconWarning}</svg>
                    <strong>Warnings</strong>
                    <span class="badge badge-warning">${warnings.length}</span>
                </div>
                <ul class="validation-list">
                    ${warnings.map(warning => html`
                        <li class="validation-warning">
                            <p>${warning}</p>
                        </li>
                    `)}
                </ul>
            </div>
        `;
    }

    _renderPreview(properties) {
        return html`
            <div class="validation-preview mt-15">
                <div class="validation-header info">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconFileText}</svg>
                    <strong>Properties to Apply</strong>
                </div>
                <ul class="validation-list">
                    ${Object.entries(properties).map(([key, value]) => html`
                        <li class="validation-property">
                            <strong>${key}:</strong>
                            <span>${String(value)}</span>
                        </li>
                    `)}
                </ul>
            </div>
        `;
    }
}

customElements.define('ag-validation-results', AgValidationResults);
