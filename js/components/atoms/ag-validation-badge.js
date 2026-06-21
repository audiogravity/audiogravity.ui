import { LitElement, html, nothing } from 'lit';
import { iconCheck, iconWarning, iconClose } from '../../ag-icons.js';

/**
 * Validation Badge Atom
 * @element ag-validation-badge
 *
 * @prop {Object} result - Validation result object {valid, errors, warnings}
 *
 * @dependency css/validation.css - Classes .validation-badge, .success, .warning, .error
 */
export class AgValidationBadge extends LitElement {
    static properties = {
        result: { type: Object }
    };

    constructor() {
        super();
        this.result = null;
    }

    createRenderRoot() {
        return this; // Light DOM for validation.css
    }

    render() {
        if (!this.result) return nothing;

        const { valid, errors = [], warnings = [] } = this.result;

        if (valid && warnings.length === 0) {
            return html`
                <span class="validation-badge success" title="Valid configuration">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCheck}</svg> Valid
                </span>
            `;
        } else if (valid && warnings.length > 0) {
            return html`
                <span class="validation-badge warning" title="${warnings.length} warning(s)">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconWarning}</svg> ${warnings.length} warning(s)
                </span>
            `;
        } else {
            return html`
                <span class="validation-badge error" title="${errors.length} error(s)">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconClose}</svg> ${errors.length} error(s)
                </span>
            `;
        }
    }
}

customElements.define('ag-validation-badge', AgValidationBadge);
