/**
 * Unit tests for ag-tabs.js — the mobile sidebar drag cleanup.
 *
 * Regression: an inline `transform` applied during an edge-swipe was left on the
 * sidebar (and toggle button) when the gesture turned vertical or ended without
 * a committed swipe. The stuck inline transform overrides the class-based CSS,
 * leaving the sidebar off-screen while its state says "open" — only a full reload
 * cleared it. _clearDragTransform() must run on every such path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readStylesheet, cssRuleBody } from '../../test-utils.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('lit', () => ({ LitElement: class {}, html: () => ({}), nothing: null }));
vi.mock('lit/directives/class-map.js', () => ({ classMap: () => ({}) }));
vi.mock('../../ag-icons.js', () => ({
    iconTabProfiles: '', iconTabServices: '', iconTabPipeline: '', iconTabSystem: '',
    iconTabPerformance: '', iconTabLibrary: '', iconHeadphones: '', iconSettingsSliders: '',
    iconSliders: '', iconShield: '', iconLock: '', iconBell: '', iconDownload: '',
    // ag-lib-tabbar's, which the column carries: read when its module loads.
    iconQueue: '', iconSearch: '', iconQueuePlay: '', iconLibraryGrid: '', iconRadio: '',
}));
vi.mock('../../auth.js', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn() }));

import { AgTabs } from './ag-tabs.js';
import { apiGet } from '../../api.js';

/** Bare instance with mocked style targets. */
function makeEl(overrides = {}) {
    const el = Object.create(AgTabs.prototype);
    el.style = { removeProperty: vi.fn(), transition: '' };
    el._sidebarToggleEl = { style: { removeProperty: vi.fn(), transition: '' } };
    return Object.assign(el, overrides);
}

describe('ag-tabs — drag transform cleanup', () => {
    beforeEach(() => {
        vi.spyOn(document, 'querySelector').mockReturnValue(null);
    });
    afterEach(() => vi.restoreAllMocks());

    describe('_clearDragTransform', () => {
        it('removes the inline transform from the sidebar and the toggle button', () => {
            const el = makeEl();
            el._clearDragTransform();
            expect(el.style.removeProperty).toHaveBeenCalledWith('transform');
            expect(el._sidebarToggleEl.style.removeProperty).toHaveBeenCalledWith('transform');
        });

        it('also resets the config modal when present', () => {
            const modal = { style: { removeProperty: vi.fn(), transition: 'none' } };
            document.querySelector.mockReturnValue(modal);
            makeEl()._clearDragTransform();
            expect(modal.style.removeProperty).toHaveBeenCalledWith('transform');
            expect(modal.style.transition).toBe('');
        });

        it('is safe when the toggle button is not present', () => {
            const el = makeEl({ _sidebarToggleEl: null });
            expect(() => el._clearDragTransform()).not.toThrow();
        });
    });

    describe('_handleTouchMove — edge-swipe turned vertical', () => {
        it('clears the inline transform instead of leaving it stuck', () => {
            const el = makeEl({ _touchOpening: true, _touchStartX: 100, _touchStartY: 100 });
            const spy = vi.spyOn(el, '_clearDragTransform');

            // Mostly-vertical move (dy=30 > dx=5, > 8px threshold) → cancels the edge-swipe.
            el._handleTouchMove({
                touches: [{ clientX: 105, clientY: 130 }],
                preventDefault: vi.fn(),
            });

            expect(el._touchOpening).toBe(false);
            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    describe('_handleTouchEnd — ends with no active/opening drag', () => {
        it('clears any orphaned transform before the early return', () => {
            const el = makeEl({ _touchOpening: false, _touchActive: false });
            const spy = vi.spyOn(el, '_clearDragTransform');

            el._handleTouchEnd({ changedTouches: [{ clientX: 0, clientY: 0 }] });

            expect(spy).toHaveBeenCalledTimes(1);
        });
    });
});


// ---------------------------------------------------------------------------
// Which tabs a Starter edition may not open
// ---------------------------------------------------------------------------

describe('ag-tabs — licence gating', () => {
    const STARTER = { status: 'starter', pro: false };
    const PRO = { status: 'lifetime', pro: true };
    const gate = (tabId, license) => {
        const el = makeEl({ _license: license });
        return AgTabs.prototype._isLocked.call(el, tabId);
    };

    it('blocks the Pro tabs on Starter', () => {
        for (const tab of ['systemd', 'performance', 'pipeline']) {
            expect(gate(tab, STARTER)).toBe(true);
        }
    });

    it('opens the library on every edition — its padlocks are on the Pro sources inside', () => {
        expect(gate('library', STARTER)).toBe(false);
    });

    it('leaves the config tab open on Starter', () => {
        // Editing a service's own configuration file is not a licensed feature,
        // and /audio_app_config/* carries no gate on the server either.
        expect(gate('config', STARTER)).toBe(false);
        expect(gate('config', { status: 'version_expired', pro: false })).toBe(false);
    });

    it('follows the core\'s verdict, so a tampered box is locked like the core locks it', () => {
        expect(gate('pipeline', { status: 'tampered', pro: false })).toBe(true);
    });

    it('blocks nothing with Pro', () => {
        for (const tab of ['systemd', 'performance', 'pipeline', 'library', 'config']) {
            expect(gate(tab, PRO)).toBe(false);
            expect(gate(tab, { status: 'trial', pro: true })).toBe(false);
        }
    });

    it('blocks nothing before the licence is read', () => {
        for (const tab of ['systemd', 'performance', 'pipeline']) {
            expect(gate(tab, null)).toBe(false);
        }
    });
});

describe('ag-tabs — reading the licence', () => {
    afterEach(() => { apiGet.mockReset(); });

    it('shares the verdict, and leaves a tab it locks that opened before it arrived', async () => {
        apiGet.mockResolvedValue({ status: 'starter', pro: false });
        const heard = vi.fn();
        window.addEventListener('license-status', heard);
        try {
            const el = makeEl({ activeTab: 'pipeline', _license: null });
            el.selectTab = vi.fn();
            el._isLocked = AgTabs.prototype._isLocked;
            await AgTabs.prototype._fetchLicenseStatus.call(el);
            expect(el._license).toEqual({ status: 'starter', pro: false });
            expect(heard.mock.calls.at(-1)[0].detail).toEqual({ status: 'starter', pro: false });
            expect(el.selectTab).toHaveBeenCalledWith('admin', { keepOpen: true });
        } finally {
            window.removeEventListener('license-status', heard);
        }
    });

    it('asks once for triggers that arrive together', async () => {
        // The connection back, a licence changed, a refusal of the core: one reading.
        let answer;
        apiGet.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        const el = makeEl({ activeTab: 'library', _license: null });
        el.selectTab = vi.fn();
        const first = el._fetchLicenseStatus();
        const second = el._fetchLicenseStatus();
        expect(second).toBe(first);
        answer({ status: 'trial', pro: true });
        await first;
        expect(apiGet).toHaveBeenCalledOnce();
        // Over, the next trigger reads it again.
        apiGet.mockResolvedValue({ status: 'trial', pro: true });
        await el._fetchLicenseStatus();
        expect(apiGet).toHaveBeenCalledTimes(2);
    });

    it('reads it again when the core comes back, not while it stays reachable', () => {
        // A reading that failed at mount left every Pro section waiting for the session
        // (review, 2026-10-15).
        const el = makeEl({ _connected: false });
        el._fetchLicenseStatus = vi.fn();
        el._onConnectionStatus({ connected: true });
        expect(el._fetchLicenseStatus).toHaveBeenCalledOnce();
        el._onConnectionStatus({ connected: true });
        el._onConnectionStatus({ connected: false });
        expect(el._fetchLicenseStatus).toHaveBeenCalledOnce();
        expect(el._connected).toBe(false);
        el._onConnectionStatus({ connected: true });
        expect(el._fetchLicenseStatus).toHaveBeenCalledTimes(2);
    });

    it('opens the licence panel for a locked tab, as every padlock does', () => {
        const el = makeEl({
            _license: { status: 'starter', pro: false }, activeTab: 'library',
            tabs: [{ id: 'admin', label: 'ADMIN' }], _vertical: false, dispatchEvent: vi.fn(),
        });
        const emit = vi.fn();
        window.EventEmitter = { emit };
        const selectTab = vi.spyOn(el, 'selectTab');
        try {
            el.selectTab('pipeline', { keepOpen: true });
            expect(selectTab).toHaveBeenCalledWith('admin', { keepOpen: true });
            expect(emit).toHaveBeenCalledWith('show-license-modal');
        } finally {
            delete window.EventEmitter;
        }
    });

    it('takes an answer that names no status for no verdict, and locks nothing on it', async () => {
        apiGet.mockResolvedValue({});
        const el = makeEl({ activeTab: 'pipeline', _license: null });
        el.selectTab = vi.fn();
        el._isLocked = AgTabs.prototype._isLocked;
        await AgTabs.prototype._fetchLicenseStatus.call(el);
        expect(el._license).toBeNull();
        expect(el.selectTab).not.toHaveBeenCalled();
    });

    it('stays on a tab the verdict leaves open', async () => {
        apiGet.mockResolvedValue({ status: 'starter', pro: false });
        const el = makeEl({ activeTab: 'library', _license: null });
        el.selectTab = vi.fn();
        el._isLocked = AgTabs.prototype._isLocked;
        await AgTabs.prototype._fetchLicenseStatus.call(el);
        expect(el.selectTab).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// The Admin tab carries no connected-users counter
// ---------------------------------------------------------------------------

describe('ag-tabs — no connected-users counter', () => {
    afterEach(() => vi.restoreAllMocks());

    it('ignores an "admin" entry served by an older core, and keeps the others', async () => {
        // The frontend and the core ship as separate packages: a core that
        // predates the removal still answers with the counter.
        apiGet.mockResolvedValueOnce({
            profiles: { num: 1, den: 10 },
            services: { num: 2, den: 5 },
            admin: { num: 1, den: 3 },
        });

        const el = makeEl({ _tabStats: {} });
        await AgTabs.prototype._fetchInitialStats.call(el);

        expect(el._tabStats.admin).toBeUndefined();
        expect(el._tabStats.profiles).toEqual({ num: 1, den: 10 });
        expect(el._tabStats.services).toEqual({ num: 2, den: 5 });
    });

});

// ---------------------------------------------------------------------------
// Manual at the foot of the column
// ---------------------------------------------------------------------------

describe('ag-tabs — Manual at the foot of the column', () => {
    const css = () => readStylesheet('css', 'layout.css');

    it('takes the foot, on a phone and on a computer alike', () => {
        expect(cssRuleBody(css(), '.tabs--vertical .tab-manual-btn')).toMatch(/margin-top:\s*auto/);
    });

    it('takes the right-hand end of the horizontal bar, and only there', () => {
        // In the column, an automatic left margin would push it to the right edge.
        expect(cssRuleBody(css(), '.tabs:not(.tabs--vertical) .tab-manual-btn')).toMatch(/margin-left:\s*auto/);
        expect(cssRuleBody(css(), '.tabs--vertical .tab-manual-btn')).not.toMatch(/margin-left/);
        // Nor from any other rule on Manual: in the column it would also stop the button
        // stretching to the column's width.
        const bare = css().replace(/\/\*[\s\S]*?\*\//g, '');
        const pushing = [...bare.matchAll(/([^{}]*\.tab-manual-btn[^{}]*)\{([^}]*)\}/g)]
            .filter(([, , body]) => /margin-left:\s*auto/.test(body))
            .map(([, selector]) => selector.trim());
        expect(pushing).toEqual(['.tabs:not(.tabs--vertical) .tab-manual-btn']);
    });

    it('keeps no style for the Switch button, gone with the choice of layout', () => {
        // It stood under Manual on a computer's column; a computer has no column now.
        expect(css()).not.toMatch(/\.tab-orientation-btn/);
    });
});

// ---------------------------------------------------------------------------
// The mark at the head of the column
// ---------------------------------------------------------------------------

describe('ag-tabs — the raw bar index.html writes', () => {
    it('stays hidden until the component is defined, keeping its place', () => {
        // After a sign-in the splash screen is skipped on purpose, and the plain buttons
        // showed as a horizontal bar on a blank page — on a phone too (user, 2026-10-09;
        // 59 frames in Chromium after a real sign-in, 0 with this rule).
        const css = readStylesheet('css', 'layout.css');
        expect(cssRuleBody(css, 'ag-tabs:not(:defined)')).toMatch(/visibility:\s*hidden/);
    });

    it('is the markup the component reads: the plain buttons are still in the page', () => {
        const page = readStylesheet('index.html');
        expect(page).toMatch(/<ag-tabs id="mainTabs" class="tabs">\s*<button class="tab-btn active" data-tab="profiles">/);
    });
});

describe('ag-tabs — the mark at the head of the column', () => {
    it('stands at the lg step, the largest that keeps its row on one line', () => {
        // With "Version expired", the longest licence label, xl (20px) left the badge
        // touching the mark and pushed the dot out of the column.
        const css = readStylesheet('css', 'layout.css');
        expect(cssRuleBody(css, '.tabs--vertical .tabs-logo')).toMatch(/font-size:\s*var\(--font-size-lg\)/);
    });
});

// ---------------------------------------------------------------------------
// The order of the tabs
// ---------------------------------------------------------------------------

describe('ag-tabs — the order of the tabs', () => {
    it('ends on Library, after Admin', () => {
        // The order is read from index.html, and everything follows it: the column, the
        // horizontal bar, the swipe from tab to tab and the arrow keys.
        const page = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        const order = [...page.matchAll(/class="tab-btn[^"]*" data-tab="([^"]+)"/g)].map(m => m[1]);
        expect(order.indexOf('admin')).toBeGreaterThan(-1);
        expect(order.at(-1)).toBe('library');
        expect(order.indexOf('library')).toBe(order.indexOf('admin') + 1);
    });
});
