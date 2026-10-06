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
 * 6. rendered: a portal address that is not http(s) never becomes a link
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
 * The header carried an EDITIONS & LICENSE button that opened a hand-kept copy of the
 * editions and of the EULA. The editions are in the manual (01-introduction.md,
 * "Editions"), and the EULA is linked from the sign-in page and the footer; the user
 * chose to drop the button (2026-10-06).
 */
describe('the panel\'s header', () => {
    /**
     * Render the panel and return the labels of the buttons in its header.
     * @param {Object} status Licence status the core would report.
     */
    async function headerButtons(status) {
        api.status = status;
        api.config = {};
        const el = document.createElement('ag-license-status');
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        const labels = [...el.querySelectorAll('.tab-title-container button')]
            .map(b => b.textContent.trim());
        el.remove();
        return labels;
    }

    it.each([
        ['a running trial', { status: 'trial', days_remaining: 2, trial_days_total: 30, device_id: 'abc' }],
        ['Starter', { status: 'starter', days_remaining: 0, trial_days_total: 30, device_id: 'abc' }],
        ['a lifetime licence', { status: 'lifetime', device_id: 'abc' }],
    ])('offers the licence key alone on %s', async (_, status) => {
        expect(await headerButtons(status)).toEqual(['LICENSE KEY']);
    });
});

/**
 * Deleting the licence was the only red one among the buttons that delete; the user
 * chose orange for all of them (2026-10-05). Both states that offer it are checked:
 * the button is written twice in the template.
 */
describe('the button that deletes the licence', () => {
    /**
     * Render the panel and return the class lists of its "Delete license" buttons.
     * @param {Object} status Licence status the core would report.
     */
    async function deleteButtonClasses(status) {
        api.status = status;
        api.config = {};
        const el = document.createElement('ag-license-status');
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        const classes = [...el.querySelectorAll('button')]
            .filter(b => b.textContent.includes('Delete license'))
            .map(b => b.className);
        el.remove();
        return classes;
    }

    it('is orange on a lifetime licence', async () => {
        expect(await deleteButtonClasses({ status: 'lifetime', device_id: 'abc' }))
            .toEqual(['btn-action warning compact']);
    });

    it('is orange on a licence that has ended', async () => {
        expect(await deleteButtonClasses({ status: 'expired', device_id: 'abc', expires_at: '2026-01-01' }))
            .toEqual(['btn-action warning compact']);
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

/**
 * The portal address comes from the licence server and becomes the href of the panel's
 * portal links. An attribute binding does not stop a javascript: URL from running on
 * click, so the component keeps the address only when it is http(s).
 */
describe('the portal link', () => {
    /**
     * Render the panel and return the addresses of its links.
     * @param {string} portalUrl Portal address the licence server would return.
     */
    async function linkTargets(portalUrl) {
        api.status = { status: 'trial', days_remaining: 2, trial_days_total: 30, device_id: 'abc' };
        api.config = { portal_url: portalUrl };
        const el = document.createElement('ag-license-status');
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        const hrefs = [...el.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
        el.remove();
        return hrefs;
    }

    it('is offered for an https address', async () => {
        expect(await linkTargets('https://lic.example/portal')).toContain('https://lic.example/portal');
    });

    it('is dropped for a javascript: address', async () => {
        const hrefs = await linkTargets('javascript:alert(1)');
        expect(hrefs.some(h => /^javascript:/i.test(h))).toBe(false);
    });
});
