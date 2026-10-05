/**
 * Unit tests for ag-profile-card.js (logic only, no DOM mount): how a profile's
 * state reads on its tile.
 *
 * On 2026-09-24 a service systemd kept restarting held every tile naming it on
 * PENDING. The core now reads such a loop as a failure, so the profile arrives in
 * `error` — which the tile showed as IDLE, like a stopped profile. It reads FAILED.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('lit/directives/class-map.js', () => ({ classMap: (classes) => classes }));
vi.mock('../atoms/ag-health-bar.js', () => ({}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));
vi.mock('../../auth.js', () => ({ isGuest: () => false }));
vi.mock('../utils-lit.js', () => ({ formatTimestamp: () => '' }));

import { AgProfileCard, profileStatus } from './ag-profile-card.js';
import { flat } from '../../test-utils.js';

describe('profileStatus', () => {
    it('reads FAILED, in red, for a profile in error', () => {
        expect(profileStatus('error')).toEqual({ statusClass: 'error', statusText: 'FAILED', isPending: false });
    });

    it('keeps the three readings it had', () => {
        expect(profileStatus('active')).toEqual({ statusClass: 'up', statusText: 'UP', isPending: false });
        for (const state of ['activating', 'deactivating']) {
            expect(profileStatus(state)).toEqual({ statusClass: 'pending', statusText: 'PENDING', isPending: true });
        }
        for (const state of ['inactive', 'partial', 'unknown', undefined]) {
            expect(profileStatus(state)).toEqual({ statusClass: 'down', statusText: 'IDLE', isPending: false });
        }
    });
});


/**
 * A badge beside the ACTIVATE button that is not a button: a tint without a frame.
 * Outlined, UNAVAILABLE and "n failed" had the shape of the button beside them.
 */
describe('the badges beside ACTIVATE', () => {
    /** Render a tile for a profile, with the metrics the page hands it. */
    function renderTile(profile, metrics = null) {
        const el = Object.create(AgProfileCard.prototype);
        el.profile = { id: 'upnp', name: 'UPnP Renderer', state: 'idle', start: [], stop: [], ...profile };
        el.isActive = false;
        el.profileMetrics = metrics;
        el.servicesConfig = {};
        el.pipelineOutputs = {};
        return flat(el.render());
    }

    it('says UNAVAILABLE as a tint', () => {
        expect(renderTile({ is_available: false })).toContain('<span class="badge error">UNAVAILABLE</span>');
    });

    it('counts the failed services as a tint', () => {
        expect(renderTile({}, { services_failed: 2 })).toContain('<span class="badge error">2 failed</span>');
    });

    it('shows neither for an available profile with nothing failed', () => {
        const out = renderTile({});
        expect(out).not.toContain('UNAVAILABLE');
        expect(out).not.toContain('failed</span>');
    });
});
