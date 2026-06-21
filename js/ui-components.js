/**
 * @module UIComponents
 * @description Reusable UI components for consistent interface elements
 * Provides skeleton loaders and information modals
 */

// =====================
// ES6 MODULE IMPORTS (Phase 2)
// =====================

import { showConfirm } from './ui-helpers.js';

// =====================
// INFO MODAL
// =====================

const InfoModal = {
    /**
     * Show an information modal
     * @param {string} title - Modal title
     * @param {string} content - HTML content to display
     */
    show(title, content) {
        showConfirm(title, content, { isInfo: true });
    },

    /**
     * Create standardized info content with bullet points
     * @param {string} description - Main description paragraph
     * @param {Array<{title: string, text: string}>} features - Array of features with title and text
     * @returns {string} Formatted HTML content
     */
    createContent(description, features) {
        const featuresList = features.map(feature => `
            <li style="margin-bottom: var(--spacing-sm);">
                <strong style="color: var(--text-primary);">${feature.title}</strong>: ${feature.text}
            </li>
        `).join('');

        return `
            <div style="line-height: 1.6;">
                <p style="margin-bottom: var(--spacing-md); color: var(--text-primary);">${description}</p>
                <ul style="padding-left: 20px; list-style-type: disc; color: var(--text-secondary);">
                    ${featuresList}
                </ul>
            </div>
        `;
    }
};

// =====================
// EXPORTS
// =====================

// Make components globally accessible
window.UIComponents = {
    InfoModal
};
