/**
 * @module EventBus
 * @description ES6 module exports for event system and app state.
 * Also sets window globals for legacy code (SSE, PWA).
 */

import {
    EventEmitter,
    showToast,
    showConfirm,
    handleError,
    addToHistory,
    AppState,
} from '../common.js';

export const EventBus = EventEmitter;
export { AppState };

if (typeof window !== 'undefined') {
    window.EventEmitter = EventEmitter;
    window.showToast = showToast;
    window.showConfirm = showConfirm;
    window.handleError = handleError;
    window.addToHistory = addToHistory;
    window.AppState = AppState;
}
