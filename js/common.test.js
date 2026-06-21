/**
 * Unit tests for the escapeHtml function (P1 fix).
 * common.js runs auth at module-level so we test the function
 * logic directly via jsdom — same implementation as common.js:169-172.
 */
import { describe, it, expect } from 'vitest';

/** Replicate escapeHtml from common.js without the auth side effects. */
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

describe('escapeHtml (P1 — XSS prevention)', () => {
    it('escapes < and > as entities', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes & as &amp;', () => {
        expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('neutralises XSS payload — no executable HTML tag', () => {
        const payload = '<img src=x onerror=alert(1)>';
        const result = escapeHtml(payload);
        // The raw < is escaped so no real HTML element is created
        expect(result).not.toContain('<img');
        expect(result).toContain('&lt;img');
        // The word "onerror" remains in the text but is inert (not an attribute)
        expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('leaves plain text unchanged', () => {
        expect(escapeHtml('Hello world')).toBe('Hello world');
    });

    it('passes through non-string values unchanged', () => {
        expect(escapeHtml(42)).toBe(42);
        expect(escapeHtml(null)).toBe(null);
        expect(escapeHtml(undefined)).toBe(undefined);
    });

    it('empty string returns empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});
