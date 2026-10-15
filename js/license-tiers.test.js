/**
 * Tests for the licence helper: what the Pro edition opens, as the core answers it.
 *
 * The interface used to keep its own list of the statuses that lock Pro, and it disagreed
 * with the core: `tampered` showed every Pro tab open while the core refused them all. The
 * answer now comes from the core (`pro` on /license/status, `pro` on each source) and these
 * tests pin that it is read rather than re-derived.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    isLicensed, proState, shouldPromptForLicense, setLicense, currentLicense,
    isProSource, isLockedSource, openLicensePanel,
} from './license-tiers.js';

beforeEach(() => {
    setLicense(null);
});

describe('isLicensed', () => {
    it('reads the verdict the core publishes', () => {
        expect(isLicensed({ status: 'lifetime', pro: true })).toBe(true);
        expect(isLicensed({ status: 'starter', pro: false })).toBe(false);
    });

    it('takes the verdict over the status, whatever the status says', () => {
        // The core decides; the interface does not second-guess it.
        expect(isLicensed({ status: 'lifetime', pro: false })).toBe(false);
        expect(isLicensed({ status: 'tampered', pro: true })).toBe(true);
    });

    it('locks a tampered box — the core refuses it every Pro route', () => {
        expect(isLicensed({ status: 'tampered', pro: false })).toBe(false);
        expect(isLicensed('tampered')).toBe(false);
    });

    it('opens only a licence or a trial from a core that publishes no verdict', () => {
        // The core's own rule (PRO_STATUSES): anything else locks, a status added later too.
        expect(isLicensed('lifetime')).toBe(true);
        expect(isLicensed('trial')).toBe(true);
        for (const s of ['starter', 'version_expired', 'expired', 'tampered', 'no_license', 'something-new']) {
            expect(isLicensed(s)).toBe(false);
        }
    });

    it('leaves everything open while the licence is not read yet', () => {
        // No padlock flashes on a box with Pro; the core refuses what it must meanwhile.
        expect(isLicensed()).toBe(true);
        expect(isLicensed(null)).toBe(true);
    });

    it('reads the box\'s licence once it is recorded', () => {
        setLicense({ status: 'starter', pro: false });
        expect(isLicensed()).toBe(false);
        expect(currentLicense()).toEqual({ status: 'starter', pro: false });
    });
});

describe('proState', () => {
    it('is unknown until the licence is read, then locked or open', () => {
        expect(proState()).toBe('unknown');
        setLicense({ status: 'starter', pro: false });
        expect(proState()).toBe('locked');
        setLicense({ status: 'trial', pro: true });
        expect(proState()).toBe('open');
    });
});

describe('setLicense', () => {
    it('tells every listener, with the whole answer', () => {
        const heard = vi.fn();
        window.addEventListener('license-status', heard);
        try {
            setLicense({ status: 'trial', pro: true, days_remaining: 12 });
            expect(heard).toHaveBeenCalledOnce();
            expect(heard.mock.calls[0][0].detail).toEqual({ status: 'trial', pro: true, days_remaining: 12 });
        } finally {
            window.removeEventListener('license-status', heard);
        }
    });
});

describe('shouldPromptForLicense', () => {
    it('prompts a box on the free tier, and one whose term ended', () => {
        expect(shouldPromptForLicense({ status: 'starter', pro: false })).toBe(true);
        expect(shouldPromptForLicense({ status: 'expired', pro: false })).toBe(true);
    });

    it('stays quiet for a version-locked licence', () => {
        // Its own upgrade flow sits in the licence panel, at a preferential rate.
        expect(shouldPromptForLicense({ status: 'version_expired', pro: false })).toBe(false);
        expect(shouldPromptForLicense('version_expired')).toBe(false);
    });

    it('stays quiet for a box with Pro', () => {
        expect(shouldPromptForLicense({ status: 'lifetime', pro: true })).toBe(false);
        expect(shouldPromptForLicense({ status: 'trial', pro: true })).toBe(false);
    });
});

describe('isProSource / isLockedSource', () => {
    const qobuz = { source_id: 'src_qobuz', pro: true };
    const library = { source_id: 'src_mpd', pro: false };

    it('reads the flag the core puts on each source', () => {
        expect(isProSource(qobuz)).toBe(true);
        expect(isProSource(library)).toBe(false);
    });

    it('reads a source without the flag as Starter — an older core refuses it nothing', () => {
        expect(isProSource({ source_id: 'src_qobuz' })).toBe(false);
        expect(isProSource(null)).toBe(false);
    });

    it('locks a Pro source on a Starter box only', () => {
        setLicense({ status: 'starter', pro: false });
        expect(isLockedSource(qobuz)).toBe(true);
        expect(isLockedSource(library)).toBe(false);
        setLicense({ status: 'lifetime', pro: true });
        expect(isLockedSource(qobuz)).toBe(false);
    });
});

describe('openLicensePanel', () => {
    it('takes the user to the Admin tab and opens the activation window', () => {
        const tabs = document.createElement('ag-tabs');
        tabs.selectTab = vi.fn();
        document.body.appendChild(tabs);
        const emit = vi.fn();
        window.EventEmitter = { emit };
        try {
            openLicensePanel({ status: 'starter', pro: false });
            expect(tabs.selectTab).toHaveBeenCalledWith('admin', { keepOpen: false });
            expect(emit).toHaveBeenCalledWith('show-license-modal');
        } finally {
            tabs.remove();
            delete window.EventEmitter;
        }
    });

    it('reaches the tab bar it is handed, and passes keepOpen on', () => {
        // The tab bar's own locked tabs go through here: it hands itself over.
        const tabs = { selectTab: vi.fn() };
        openLicensePanel({ status: 'starter', pro: false }, { keepOpen: true, tabs });
        expect(tabs.selectTab).toHaveBeenCalledWith('admin', { keepOpen: true });
    });

    it('does not offer the generic window to a version-locked licence', () => {
        const emit = vi.fn();
        window.EventEmitter = { emit };
        try {
            openLicensePanel({ status: 'version_expired', pro: false });
            expect(emit).not.toHaveBeenCalled();
        } finally {
            delete window.EventEmitter;
        }
    });
});
