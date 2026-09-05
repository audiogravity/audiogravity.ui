/**
 * Unit tests for ag-tidal-output.
 *
 * Covers the line under the account name: what Tidal will actually play, which
 * is not what AG asks for once the plan has ended. The subscribed/unknown rule
 * itself is tested once, in library-store.test.js.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
vi.mock('../../library-store.js', () => ({
    hasSubscription: (conn) => conn?.has_subscription !== false,
}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

import { AgTidalOutput } from './ag-tidal-output.js';

/** Read the description line for a connection state, without mounting. */
function desc(connection) {
    const el = Object.create(AgTidalOutput.prototype);
    el._connection = connection;
    return el._connectedDesc;
}

describe('AgTidalOutput connected description', () => {
    it('shows the asked-for tier and country on a subscribed account', () => {
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR',
                      has_subscription: true })).toBe('Hi-Res · FR');
        expect(desc({ connected: true, quality: 'LOSSLESS', country_code: 'FR',
                      has_subscription: true })).toBe('Lossless · FR');
    });

    it('replaces the tier when the plan has ended', () => {
        // Printing "Hi-Res" here would state the opposite of what is heard.
        const line = desc({ connected: true, quality: 'HI_RES_LOSSLESS',
                            country_code: 'FR', has_subscription: false });
        expect(line).toBe('No subscription · 30-second previews · FR');
        expect(line).not.toContain('Hi-Res');
    });

    it('says it without a country when the core reports none', () => {
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', has_subscription: false }))
            .toBe('No subscription · 30-second previews');
    });

    it('reads an unknown answer as subscribed', () => {
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR',
                      has_subscription: null })).toBe('Hi-Res · FR');
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR' }))
            .toBe('Hi-Res · FR');
    });
});
