/**
 * Tests for the licence tier helper.
 *
 * The list of unlicensed statuses was written out inline in three components. A missed copy
 * leaves a paid feature open to a box that has not paid for it, and nothing reports it —
 * which is why the rule lives in one place and is tested here rather than three times over.
 */
import { describe, it, expect } from 'vitest';
import { isLicensed, shouldPromptForLicense, UNLICENSED_STATUSES } from './license-tiers.js';

describe('isLicensed', () => {
    it('unlocks the paid features for a live licence', () => {
        expect(isLicensed('lifetime')).toBe(true);
    });

    it('unlocks them during the trial', () => {
        expect(isLicensed('trial')).toBe(true);
    });

    it('locks them on the free tier', () => {
        expect(isLicensed('starter')).toBe(false);
    });

    it('locks them for a licence bought for an earlier major version', () => {
        expect(isLicensed('version_expired')).toBe(false);
    });

    it('locks them once a time-limited licence has ended', () => {
        // The customer paid and his term ran out: he keeps Starter, gated the same way.
        expect(isLicensed('expired')).toBe(false);
    });

    it('leaves tampered and no_license ungated, as they have always been', () => {
        // Not an oversight: gating them would change what those boxes can do, which is a
        // separate decision from naming the end of a paid term. Pinned so it is not
        // changed by accident.
        expect(isLicensed('tampered')).toBe(true);
        expect(isLicensed('no_license')).toBe(true);
    });

    it('treats an unknown status as licensed rather than guessing', () => {
        expect(isLicensed('something-new')).toBe(true);
    });

    it('cannot be widened by a caller', () => {
        // Asserts the PROPERTY, not the shape. `Object.freeze(new Set(…))` reads as a
        // guarantee and gives none — `.add()` still works while `Object.isFrozen` returns
        // true — so a test written against either method name passes on both. Trying every
        // way a caller might add to it, and checking the gate afterwards, does not.
        try { UNLICENSED_STATUSES.push?.('lifetime'); } catch { /* a frozen array refuses */ }
        try { UNLICENSED_STATUSES.add?.('lifetime'); } catch { /* not an array method */ }
        expect(isLicensed('lifetime')).toBe(true);
    });
});

describe('shouldPromptForLicense', () => {
    it('prompts a box on the free tier', () => {
        expect(shouldPromptForLicense('starter')).toBe(true);
    });

    it('prompts a customer whose term has ended', () => {
        expect(shouldPromptForLicense('expired')).toBe(true);
    });

    it('stays quiet for a version-locked licence', () => {
        // Its own upgrade flow sits in the licence panel, at a preferential rate. The
        // generic modal would offer the wrong purchase.
        expect(shouldPromptForLicense('version_expired')).toBe(false);
    });

    it('stays quiet for a licensed box', () => {
        expect(shouldPromptForLicense('lifetime')).toBe(false);
        expect(shouldPromptForLicense('trial')).toBe(false);
    });
});
