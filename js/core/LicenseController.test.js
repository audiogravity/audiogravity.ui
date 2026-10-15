/**
 * LicenseController — the one place a component follows the box's licence.
 *
 * Five components kept their own copy of the listener (review, 2026-10-15). These tests pin
 * what each copy did: start from the licence already read, follow every new reading while
 * in the page, stop when it leaves, and tell the component what changed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LicenseController } from './LicenseController.js';
import { setLicense } from '../license-tiers.js';

const STARTER = { status: 'starter', pro: false };
const PRO = { status: 'lifetime', pro: true };

/** A host as Lit gives one: controllers added, updates requested. */
function makeHost() {
    return { addController: vi.fn(), requestUpdate: vi.fn() };
}

afterEach(() => setLicense(null));

describe('LicenseController', () => {
    it('starts from the licence already read', () => {
        setLicense(PRO);
        const host = makeHost();
        const ctl = new LicenseController(host);
        expect(host._license).toEqual(PRO);
        expect(host.addController).toHaveBeenCalledWith(ctl);
    });

    it('starts from nothing while the licence is not read', () => {
        const host = makeHost();
        new LicenseController(host);
        expect(host._license).toBe(null);
    });

    it('follows every reading while the component is in the page', () => {
        const host = makeHost();
        const ctl = new LicenseController(host);
        ctl.hostConnected();
        try {
            setLicense(STARTER);
            expect(host._license).toEqual(STARTER);
            expect(host.requestUpdate).toHaveBeenCalled();
        } finally {
            ctl.hostDisconnected();
        }
    });

    it('stops following once the component has left', () => {
        const host = makeHost();
        const ctl = new LicenseController(host);
        ctl.hostConnected();
        ctl.hostDisconnected();
        setLicense(STARTER);
        expect(host._license).toBe(null);
    });

    it('tells the component the new licence and the one before, the new one in place', () => {
        setLicense(PRO);
        const host = makeHost();
        const seen = [];
        const ctl = new LicenseController(host, (license, previous) => {
            seen.push([license, previous, host._license]);
        });
        ctl.handleEvent({ detail: STARTER });
        expect(seen).toEqual([[STARTER, PRO, STARTER]]);
    });

    it('reads a forgotten licence as none', () => {
        const host = makeHost();
        const ctl = new LicenseController(host);
        ctl.handleEvent({ detail: null });
        expect(host._license).toBe(null);
    });

    it('works on a host without controllers (a component built in a unit test)', () => {
        const host = {};
        const ctl = new LicenseController(host);
        ctl.handleEvent({ detail: STARTER });
        expect(host._license).toEqual(STARTER);
    });
});
