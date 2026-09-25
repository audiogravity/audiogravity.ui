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

import { profileStatus } from './ag-profile-card.js';

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
