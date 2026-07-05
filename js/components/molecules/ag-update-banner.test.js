/**
 * Unit tests for ag-update-banner.js visibility logic.
 *
 * The pure predicate is re-declared here (mirroring the component) to avoid the
 * auth-check thrown by api.js when the component module is imported — same
 * approach as ag-announcement-banner.test.js.
 */
import { describe, it, expect } from 'vitest';

// ── Pure logic mirroring the component ───────────────────────────────────────

function isUpdateAvailable(update) {
    return !!(update && update.available && update.latest);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ag-update-banner — isUpdateAvailable', () => {
    it('is false for null / undefined / empty', () => {
        expect(isUpdateAvailable(null)).toBe(false);
        expect(isUpdateAvailable(undefined)).toBe(false);
        expect(isUpdateAvailable({})).toBe(false);
    });

    it('is false when available is false', () => {
        expect(isUpdateAvailable({ available: false })).toBe(false);
        expect(isUpdateAvailable({ available: false, latest: '0.9.11' })).toBe(false);
    });

    it('is false when available but latest is missing', () => {
        expect(isUpdateAvailable({ available: true })).toBe(false);
        expect(isUpdateAvailable({ available: true, latest: '' })).toBe(false);
    });

    it('is true when available with a latest version', () => {
        expect(isUpdateAvailable({ available: true, latest: '0.9.11' })).toBe(true);
        expect(isUpdateAvailable({ available: true, latest: '1.0.0', mandatory: true })).toBe(true);
    });
});
