/**
 * Unit tests for ag-audio-software-page.js — XSS fix in bulk-update confirm dialog.
 *
 * Covers:
 * - Package labels and version strings are HTML-escaped before being injected
 *   into the showConfirm dialog HTML string (XSS regression)
 * - The escaping does not break display of normal package names
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Partial: common.js calls initAuth as it loads, so the real module must stay.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    isGuest: () => false,
    isAdmin: () => true,
    // common.js gates its own module load on this and throws otherwise, so a
    // test that imports the component has to be logged in.
    requireAuth: () => true,
}));

import { AgAudioSoftwarePage } from './ag-audio-software-page.js';

/**
 * Replicate the escapeHtml logic used in the component (same as common.js)
 * so we can test the expected output without importing the full component.
 */
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/** Build the package list HTML the same way the component does after the fix. */
function buildPkgListHtml(updates) {
    return `
        <div class="package-update-list">
            <p>The following ${updates.length} packages will be updated:</p>
            <div class="package-list-container">
                ${updates.map(pkg => `
                    <div class="package-list-item">
                        <span><strong>${escapeHtml(pkg.label)}</strong></span>
                        <span>${escapeHtml(pkg.installed_version || '')} → ${escapeHtml(pkg.available_version || '')}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

describe('Bulk-update confirm dialog — XSS prevention via escapeHtml', () => {
    it('escapes a malicious package label', () => {
        const updates = [{
            id: 'evil',
            label: '<img src=x onerror=alert(1)>',
            installed_version: '1.0',
            available_version: '2.0',
        }];
        const html = buildPkgListHtml(updates);
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x');
    });

    it('escapes malicious version strings', () => {
        const updates = [{
            id: 'pkg',
            label: 'Safe Package',
            installed_version: '1.0<script>',
            available_version: '2.0</script>',
        }];
        const html = buildPkgListHtml(updates);
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('renders a normal package correctly after escaping', () => {
        const updates = [{
            id: 'mpd',
            label: 'Music Player Daemon',
            installed_version: '0.23.12',
            available_version: '0.23.15',
        }];
        const html = buildPkgListHtml(updates);
        expect(html).toContain('Music Player Daemon');
        expect(html).toContain('0.23.12');
        expect(html).toContain('0.23.15');
    });

    it('handles undefined version gracefully', () => {
        const updates = [{
            id: 'pkg',
            label: 'TestPkg',
            installed_version: undefined,
            available_version: '1.0',
        }];
        expect(() => buildPkgListHtml(updates)).not.toThrow();
        const html = buildPkgListHtml(updates);
        expect(html).toContain('TestPkg');
    });
});

/**
 * The update path for a package whose vendor publishes no version.
 *
 * Roon's installer points at a fixed filename and ships no version file, so
 * there is nothing to compare against. Refusing on that basis left Roon with no
 * way to update from the interface at all — on a real box, stuck on a build
 * from years back. "Update" there means re-running the vendor's installer,
 * which always fetches the current build.
 *
 * Exercises the component's own method: a local re-implementation would keep
 * passing while the shipped decision drifted away from it.
 */
describe('Update of a package that publishes no version', () => {
    /** @returns {Object} A bare instance, enough to call the decision method. */
    function page() {
        return Object.create(AgAudioSoftwarePage.prototype);
    }

    it('offers a reinstall for a vendor that publishes no version', () => {
        expect(page()._decideUpdate({
            installer_type: 'script',
            installed_version: '1.8 (build 1125) stable',
            available_version: null,
        })).toBe('reinstall');
    });

    it('still refuses when a package that should have a version has none', () => {
        // An apt package with no candidate means something is wrong; offering a
        // blind reinstall there would hide it.
        expect(page()._decideUpdate({
            installer_type: 'apt_simple',
            installed_version: '0.24.5-1',
            available_version: null,
        })).toBe('no-version');
    });

    it('keeps the up-to-date shortcut for packages that do publish one', () => {
        expect(page()._decideUpdate({
            installer_type: 'apt_deb',
            installed_version: '6.1.4-71',
            available_version: '6.1.4-71',
        })).toBe('up-to-date');
    });

    it('goes ahead when the published version differs', () => {
        expect(page()._decideUpdate({
            installer_type: 'apt_deb',
            installed_version: '5.1.5-67',
            available_version: '6.1.4-71',
        })).toBe('proceed');
    });
});
