/**
 * Unit tests for ag-version-skew-banner.js version comparison.
 *
 * The pure comparison is re-declared here (mirroring the component) to avoid the
 * auth-check thrown by api.js when the component module is imported — same
 * approach as the other banner tests.
 */
import { describe, it, expect } from 'vitest';

// ── Pure logic mirroring the component ───────────────────────────────────────

function _majorMinor(v) {
    const p = String(v || '').replace(/^v/i, '').split('-')[0].split('+')[0].split('.');
    return `${parseInt(p[0], 10) || 0}.${parseInt(p[1], 10) || 0}`;
}

function versionsMatch(uiVersion, coreVersion) {
    if (!uiVersion || !coreVersion) return true;
    return _majorMinor(uiVersion) === _majorMinor(coreVersion);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ag-version-skew-banner — versionsMatch', () => {
    it('matches on identical major.minor (patch/pre-release differences ignored)', () => {
        expect(versionsMatch('0.9.10', '0.9.11')).toBe(true);
        expect(versionsMatch('0.9.10-dev', '0.9.10')).toBe(true);
        expect(versionsMatch('v0.9.0', '0.9.9')).toBe(true);
    });

    it('flags a minor-level difference (0.x treats minor as breaking)', () => {
        expect(versionsMatch('0.9.10', '0.10.0')).toBe(false);
        expect(versionsMatch('0.9.0', '0.8.0')).toBe(false);
    });

    it('flags a major-level difference', () => {
        expect(versionsMatch('0.9.10', '1.0.0')).toBe(false);
        expect(versionsMatch('1.2.3', '2.0.0')).toBe(false);
    });

    it('treats unknown versions as compatible (no false warning)', () => {
        expect(versionsMatch(null, '0.9.10')).toBe(true);
        expect(versionsMatch('0.9.10', null)).toBe(true);
        expect(versionsMatch('0.9.10', '')).toBe(true);
    });
});
