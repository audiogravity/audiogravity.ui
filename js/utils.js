/**
 * @module Utils
 * @description Utility functions for formatting and logging.
 * Formatters are canonical in components/utils-lit.js — re-exported here for backwards compatibility.
 */

export {
    safeToFixed,
    formatMemory,
    formatUptime,
    formatTimestamp,
    formatRate,
    autoExpandTextarea
} from './components/utils-lit.js';

// =====================
// DEVELOPMENT LOGGER
// =====================

/**
 * Conditional logger that only logs in development mode
 * Prevents console pollution in production builds
 *
 * @example
 * import { logger } from './utils.js';
 * logger.log('Component connected');
 * logger.warn('Deprecated prop used');
 * logger.error('Failed to fetch data');
 */
export const logger = {
    log: (...args) => {
        if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
            console.log(...args);
        }
    },

    warn: (...args) => {
        if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
            console.warn(...args);
        }
    },

    error: (...args) => {
        console.error(...args);
    },

    debug: (component, ...args) => {
        if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
            console.log(`[${component}]`, ...args);
        }
    }
};
