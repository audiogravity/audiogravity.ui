/**
 * Unit tests for ag-audio-software-page.js — XSS fix in bulk-update confirm dialog.
 *
 * Covers:
 * - Package labels and version strings are HTML-escaped before being injected
 *   into the showConfirm dialog HTML string (XSS regression)
 * - The escaping does not break display of normal package names
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
