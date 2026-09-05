/**
 * Unit tests for ag-qobuz-output.
 *
 * Covers the line under the account name: what Qobuz will actually play, which
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

import { AgQobuzOutput } from './ag-qobuz-output.js';

/** Read the description line for a connection state, without mounting. */
function desc(connection) {
    const el = Object.create(AgQobuzOutput.prototype);
    el._connection = connection;
    return el._connectedDesc;
}

describe('AgQobuzOutput connected description', () => {
    it('shows the plan and the format on a subscribed account', () => {
        expect(desc({ connected: true, subscription: 'Studio', format_id: 27,
                      has_subscription: true })).toBe('Studio · Hi-Res 24/192');
    });

    it('replaces the whole line when the plan has ended', () => {
        // "Studio · Hi-Res 24/192" would state the opposite of what is heard:
        // Qobuz serves 30-second MP3 excerpts to such an account.
        const line = desc({ connected: true, subscription: 'NO SUBSCRIPTION',
                            format_id: 27, has_subscription: false });
        expect(line).toBe('No subscription · 30-second previews');
        expect(line).not.toContain('Hi-Res');
    });

    it('reads an unknown answer as subscribed', () => {
        expect(desc({ connected: true, subscription: 'Studio', format_id: 27,
                      has_subscription: null })).toBe('Studio · Hi-Res 24/192');
        expect(desc({ connected: true, subscription: 'Studio', format_id: 27 }))
            .toBe('Studio · Hi-Res 24/192');
    });

    it('falls back to Active when the plan carries no name', () => {
        expect(desc({ connected: true, format_id: 6, has_subscription: true }))
            .toBe('Active · FLAC 16/44');
    });

    it('names an unknown format id rather than hiding it', () => {
        expect(desc({ connected: true, subscription: 'Studio', format_id: 99,
                      has_subscription: true })).toBe('Studio · Format 99');
    });
});
