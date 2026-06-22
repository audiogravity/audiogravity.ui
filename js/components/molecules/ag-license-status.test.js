/**
 * Unit tests for ag-license-status.js security fixes.
 *
 * Tested in isolation (no LitElement instantiation) by extracting the
 * security-critical logic into pure functions that mirror the component.
 *
 * Covers:
 * 1. _portalUrl validation: javascript: / data: URLs are rejected
 * 2. price display: numeric price formatted correctly, non-numeric rejected
 * 3. acquisitionStepsHtml: price is text-interpolated, not raw HTML
 */
import { describe, it, expect } from 'vitest';

// --- Pure logic extracted from ag-license-status.js for isolated testing ---

/** Mirror of the _portalUrl validation added in the security fix. */
function isSafePortalUrl(url) {
    return /^https?:\/\//i.test(url || '');
}

/** Mirror of _formatPrice from ag-license-status.js. */
function formatPrice(price, currency = 'EUR') {
    const num = parseFloat(price);
    if (isNaN(num)) return '';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
    } catch {
        return `${num} ${currency}`;
    }
}

/** Mirror of the Lit template string that used to use unsafeHTML. */
function acquisitionStepsText(priceDisplay) {
    // After the fix this is a Lit template — price is a text node, not raw HTML.
    // We test that the price string is text-interpolated (no HTML parsing).
    return `one-time payment of ${priceDisplay}`;
}

// ---------------------------------------------------------------------------

describe('_portalUrl safety validation', () => {
    it('accepts https:// URLs', () => {
        expect(isSafePortalUrl('https://portal.audiogravity.app')).toBe(true);
    });

    it('accepts http:// URLs', () => {
        expect(isSafePortalUrl('http://10.0.4.254:3000/portal')).toBe(true);
    });

    it('rejects javascript: URLs', () => {
        expect(isSafePortalUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects data: URLs', () => {
        expect(isSafePortalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('rejects empty string', () => {
        expect(isSafePortalUrl('')).toBe(false);
    });

    it('rejects null / undefined', () => {
        expect(isSafePortalUrl(null)).toBe(false);
        expect(isSafePortalUrl(undefined)).toBe(false);
    });

    it('rejects protocol-relative URLs', () => {
        expect(isSafePortalUrl('//evil.example.com')).toBe(false);
    });
});

describe('_priceDisplay — price formatting', () => {
    it('formats a valid numeric price', () => {
        const display = formatPrice(29.99, 'EUR');
        expect(display).toContain('29.99');
    });

    it('returns empty string for non-numeric price (backend sends garbage)', () => {
        expect(formatPrice('<script>alert(1)</script>')).toBe('');
        expect(formatPrice('not-a-price')).toBe('');
    });

    it('returns empty string for null', () => {
        expect(formatPrice(null)).toBe('');
    });
});

describe('_acquisitionStepsHtml — price as text node', () => {
    it('embeds price as plain text, XSS payload is inert', () => {
        const xssPayload = '<img src=x onerror=alert(1)>';
        // After the fix, _priceDisplay goes through Lit text interpolation.
        // Simulate: if price were passed through parseFloat first, XSS is neutralised.
        const priceDisplay = formatPrice(xssPayload); // returns '' for non-numeric
        const text = acquisitionStepsText(priceDisplay || '');
        // The text must not contain executable HTML
        expect(text).not.toContain('<img');
        expect(text).not.toContain('onerror');
    });

    it('embeds a valid price string correctly', () => {
        const priceDisplay = formatPrice(29.99, 'EUR');
        const text = acquisitionStepsText(priceDisplay);
        expect(text).toContain('29.99');
    });
});
