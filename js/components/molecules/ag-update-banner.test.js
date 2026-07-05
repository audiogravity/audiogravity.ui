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

const _TERMINAL_PHASES = new Set(['done', 'rolled_back', 'failed']);

function updatePhaseLabel(phase) {
    return {
        starting:    'Starting…',
        downloading: 'Downloading…',
        installing:  'Installing…',
        verifying:   'Verifying…',
        done:        'Update complete',
        rolled_back: 'Update failed — previous version restored',
        failed:      'Update failed',
    }[phase] || 'Updating…';
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

describe('ag-update-banner — updatePhaseLabel', () => {
    it('maps known phases to human labels', () => {
        expect(updatePhaseLabel('downloading')).toBe('Downloading…');
        expect(updatePhaseLabel('installing')).toBe('Installing…');
        expect(updatePhaseLabel('verifying')).toBe('Verifying…');
        expect(updatePhaseLabel('done')).toBe('Update complete');
        expect(updatePhaseLabel('rolled_back')).toContain('previous version restored');
    });

    it('falls back to a generic label for unknown/empty phases', () => {
        expect(updatePhaseLabel('bogus')).toBe('Updating…');
        expect(updatePhaseLabel(undefined)).toBe('Updating…');
    });
});

describe('ag-update-banner — terminal phases', () => {
    it('treats done/rolled_back/failed as terminal', () => {
        expect(_TERMINAL_PHASES.has('done')).toBe(true);
        expect(_TERMINAL_PHASES.has('rolled_back')).toBe(true);
        expect(_TERMINAL_PHASES.has('failed')).toBe(true);
    });

    it('does not treat in-progress phases as terminal', () => {
        for (const p of ['starting', 'downloading', 'installing', 'verifying']) {
            expect(_TERMINAL_PHASES.has(p)).toBe(false);
        }
    });
});
