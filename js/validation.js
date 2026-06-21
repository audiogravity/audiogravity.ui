/**
 * Validation Module
 * Handles audio-config.json validation using the backend validation API
 */

// =====================
// ES6 MODULE IMPORTS (Phase 2)
// =====================

import { html } from 'lit';
import { apiPost } from './api.js';
import { showConfirm } from './ui-helpers.js';

// =====================
// API CALLS
// =====================

/**
 * Validate audio configuration data
 * @param {Object} config - Configuration object to validate
 * @returns {Promise<Object>} Validation result with errors/warnings
 */
export async function validateAudioConfig(config) {
    try {
        const response = await apiPost('/config_validation/validate', config);
        return response;
    } catch (error) {
        console.error('Validation API error:', error);
        throw error;
    }
}

// =====================
// UI RENDERING
// =====================

/**
 * Show validation modal with results
 * @param {Object} validationResult - Result from validation API
 * @param {Function} onContinue - Callback if user wants to continue despite warnings
 */
export function showValidationModal(validationResult, onContinue = null) {
    const { valid, errors = [], warnings = [] } = validationResult;

    const title = valid ? 'Configuration Validation' : 'Invalid Configuration';
    const content = html`<ag-validation-results .result=${validationResult}></ag-validation-results>`;

    // If valid but has warnings, allow continue
    if (valid && warnings.length > 0 && onContinue) {
        showConfirm(
            title,
            html`${content}<p class="validation-question">Continue with these warnings?</p>`,
            { okLabel: 'Continue', cancelLabel: 'Cancel' }
        ).then(confirmed => {
            if (confirmed) {
                onContinue();
            }
        });
    }
    // If errors, just show them
    else if (!valid) {
        showConfirm(title, content, { isInfo: true });
    }
    // If valid with no warnings, just show success
    else {
        showConfirm(title, content, { isInfo: true });
    }
}





