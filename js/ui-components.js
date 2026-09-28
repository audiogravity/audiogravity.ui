/**
 * @module UIComponents
 * @description Reusable UI components for consistent interface elements.
 * Provides the information modal the licence panel opens its terms in.
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
    }
};

// =====================
// EXPORTS
// =====================

// Make components globally accessible
window.UIComponents = {
    InfoModal
};
