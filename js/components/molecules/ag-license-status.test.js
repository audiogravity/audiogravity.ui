/**
 * Unit tests for ag-license-status.js.
 *
 * Two halves, deliberately. The first tests pure functions that MIRROR the
 * component's security-critical logic — cheap, and enough for rules about values.
 * The second renders the component itself, because a mirror is blind to defects
 * that live in the template: an absent price once left "one-time payment of ,"
 * on the panel that asks the customer to buy, and no mirror could have seen it.
 *
 * Covers:
 * 1. _portalUrl validation: javascript: / data: URLs are rejected
 * 2. price display: numeric price formatted correctly, non-numeric rejected
 * 3. the purchase sentence: price is text-interpolated, not raw HTML
 * 4. rendered: the sentence survives a missing price, and states it only once
 * 5. rendered: the trial tile states the day count once, not three times
 */
import { describe, it, expect, vi } from 'vitest';

// --- Pure logic extracted from ag-license-status.js for isolated testing ---

/** Mirror of the _portalUrl validation added in the security fix. */
function isSafePortalUrl(url) {
    return /^https?:\/\//i.test(url || '');
}

/**
 * Mirror of _formatPrice from ag-license-status.js. It does NOT sanitise: a value
 * parseFloat cannot read comes back verbatim. What makes that safe is Lit, which
 * interpolates it as a text node — proved on the rendered component below, since a
 * mirror can say nothing about escaping.
 */
function formatPrice(price) {
    const amount = parseFloat(price);
    return isNaN(amount) ? price : `€${amount}`;
}

/**
 * Mirror of the Lit template string that used to use unsafeHTML. The price is now
 * interpolated in the purchase sentence only — the acquisition step that repeated it
 * says just "Click Pay with PayPal."
 */
function purchaseSentenceText(priceDisplay) {
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
        expect(formatPrice(29.99)).toBe('€29.99');
    });

    it('hands back a non-numeric price verbatim — it does not sanitise', () => {
        // Stated as it is, not as one might wish: the guard against a hostile value
        // is Lit's text interpolation, exercised on the rendered component below.
        expect(formatPrice('not-a-price')).toBe('not-a-price');
        expect(formatPrice('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    });

    it('hands back null unchanged', () => {
        expect(formatPrice(null)).toBe(null);
    });
});

describe('the purchase sentence — price as text node', () => {
    it('embeds a valid price string correctly', () => {
        const priceDisplay = formatPrice(29.99);
        const text = purchaseSentenceText(priceDisplay);
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
 * Render the panel and return its full text.
 * @param {Object|undefined} config Public config the licence server would return.
 * @param {Object} [status] Licence status the core would report; a running trial by default.
 */
async function panelText(config, status) {
    api.status = status
        ?? { status: 'trial', days_remaining: 2, trial_days_total: 45, device_id: 'abc' };
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

    it('states the price once, not again in the steps', async () => {
        const text = await panelText({ license_price: '29', paypal_url: 'https://paypal.me/x' });
        expect(text).toContain('Click Pay with PayPal.');
        // split, not match(/g): match returns null on no match, so the assertion that
        // was meant to report "0 instead of 1" would die on null.length instead.
        expect(text.split('€29').length - 1).toBe(1);
    });

    it('renders a hostile price as inert text', async () => {
        // _formatPrice returns a non-numeric price verbatim, so the only thing standing
        // between /license/public-config and the DOM is Lit's text interpolation.
        const el = document.createElement('ag-license-status');
        api.status = { status: 'trial', days_remaining: 2, trial_days_total: 45, device_id: 'abc' };
        api.config = { license_price: '<img src=x onerror=alert(1)>' };
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        expect(el.querySelector('img')).toBe(null);
        expect(el.textContent).toContain('<img src=x onerror=alert(1)>');   // text, not markup
        el.remove();
    });

    it('states the price in the steps once the trial has ended', async () => {
        // The starter wording is about the trial ending and carries no figure, so the
        // steps must — otherwise the whole panel asks for a purchase without a price.
        const text = await panelText(
            { license_price: '29', paypal_url: 'https://paypal.me/x' },
            { status: 'starter', days_remaining: 0, trial_days_total: 30, device_id: 'abc',
              message: 'Trial expired.' },
        );
        expect(text).toContain('Click Pay with PayPal — one-time payment of €29.');
    });
});

/**
 * The trial tile used to say the same number three times — the badge, a sentence
 * relayed from the core, and the bar's caption — and the sentence was built from a
 * template, so it read "27 day(s) remaining".
 */
describe('the trial tile says the day count once', () => {
    const trial = { status: 'trial', days_remaining: 27, trial_days_total: 30, device_id: 'abc',
                    message: 'Trial license: 27 day(s) remaining.' };

    it('keeps the badge and the bar caption, drops the relayed sentence', async () => {
        const text = await panelText({}, trial);
        expect(text).toContain('27 of 30 trial days left');
        expect(text).not.toContain('Trial license: 27 day(s) remaining.');
        expect(text).not.toContain('day(s)');
    });

    it('still relays the message for a state the tile does not otherwise explain', async () => {
        const text = await panelText({}, {
            status: 'starter', days_remaining: 0, trial_days_total: 30, device_id: 'abc',
            message: 'Trial expired. Audiogravity is running in Starter Edition.',
        });
        expect(text).toContain('Trial expired. Audiogravity is running in Starter Edition.');
    });
});
