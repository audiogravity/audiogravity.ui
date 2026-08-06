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
import { describe, it, expect, vi } from 'vitest';

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

describe('_renderAcquisitionSteps — price as text node', () => {
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

// ---------------------------------------------------------------------------
// The rendered component. The mirrors above cannot see a defect in the template
// itself, which is where this one lived: the price was interpolated into the
// middle of a sentence, so an absent price left "one-time payment of ,".
// ---------------------------------------------------------------------------

/** Responses the mocked API hands back; each test sets them before rendering. */
const api = vi.hoisted(() => ({ status: null, config: {} }));

vi.mock('../../api.js', () => ({
    apiGet: (path) => {
        if (path === '/license/status')         return Promise.resolve(api.status);
        if (path === '/license/public-config')  return Promise.resolve(api.config);
        return Promise.reject(new Error(`unmocked: ${path}`));
    },
    apiCall: () => Promise.reject(new Error('unmocked')),
}));

vi.mock('../../ui-helpers.js', () => ({
    showPasswordConfirm: () => Promise.resolve(null),
    showToast: () => {},
    copyToClipboard: () => {},
}));

await import('./ag-license-status.js');

/**
 * Render the panel for a running trial and return its full text.
 * @param {Object|undefined} config Public config the licence server would return.
 */
async function panelText(config) {
    api.status = { status: 'trial', days_remaining: 2, trial_days_total: 45, device_id: 'abc' };
    api.config = config;
    const el = document.createElement('ag-license-status');
    document.body.appendChild(el);
    // connectedCallback awaits its fetches before the first render settles.
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;
    const text = el.textContent.replace(/\s+/g, ' ');
    el.remove();
    return text;
}

describe('the purchase sentence when the licence server gives no price', () => {
    it('keeps a whole sentence — no dangling comma', async () => {
        const text = await panelText({});
        expect(text).toContain('Lifetime license — one-time payment, no subscription.');
        expect(text).not.toContain('payment of ,');
    });

    it('states the price when there is one', async () => {
        const text = await panelText({ license_price: '29' });
        expect(text).toContain('one-time payment of €29, no subscription.');
    });
});
