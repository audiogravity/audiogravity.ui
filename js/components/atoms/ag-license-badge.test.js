/**
 * Tests for the licence badge.
 *
 * The badge is the one-word summary of a customer's licence, and it was wrong in two ways:
 * it had no case for a licence that had ended (so it read "No license", as if none had ever
 * been bought), and it read "Lifetime" for a licence bought with an end date.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import './ag-license-badge.js';

/** Render a badge and return its trimmed text. */
async function label(props) {
    const el = document.createElement('ag-license-badge');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    const text = el.textContent.trim();
    el.remove();
    return text;
}

/** Render a badge and return the variant class the wrapper carries. */
async function variant(props) {
    const el = document.createElement('ag-license-badge');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    const cls = el.querySelector('.badge')?.className ?? '';
    el.remove();
    return cls;
}

describe('ag-license-badge', () => {
    // Awaited, never returned: whenDefined resolves with the CLASS, and vitest treats a
    // value returned from beforeAll as a teardown callback — it then calls the constructor
    // without `new`.
    beforeAll(async () => {
        await customElements.whenDefined('ag-license-badge');
    });

    it('says Lifetime for a perpetual licence', async () => {
        expect(await label({ status: 'lifetime' })).toBe('Lifetime');
    });

    it('does not say Lifetime for a licence bought with an end date', async () => {
        // Same status — the tier and the unlocked features are identical — but reading
        // "Lifetime" beside "active until 31/12/2026" is what made a customer believe he
        // had bought one outright.
        const text = await label({ status: 'lifetime', expiresAt: '2026-12-31' });
        expect(text).toBe('Licensed');
        expect(text).not.toContain('Lifetime');
    });

    it('names an ended term instead of falling through to "No license"', async () => {
        // Until the component learned this status it hit the default branch, so a customer
        // whose term had just ended was shown a badge saying he had never had a licence.
        expect(await label({ status: 'expired' })).toBe('License ended');
    });

    it('paints an ended term as a warning, never as critical', async () => {
        // 'critical' is the tampering colour. A customer whose term ran out is not a suspect.
        expect(await variant({ status: 'expired' })).toContain('warning');
        expect(await variant({ status: 'expired' })).not.toContain('critical');
    });

    it('still paints a tampered file as critical', async () => {
        expect(await variant({ status: 'tampered' })).toContain('critical');
    });

    it('counts down the trial', async () => {
        expect(await label({ status: 'trial', daysRemaining: 12 })).toBe('Trial — 12d');
    });

    it('falls back to "No license" only for an unknown status', async () => {
        expect(await label({ status: 'something-new' })).toBe('No license');
    });
});
