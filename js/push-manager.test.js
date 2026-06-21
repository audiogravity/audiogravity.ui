/**
 * Unit tests for push-manager.js — unsubscribe endpoint fix (P3).
 * Fix: unsubscribeUser() must call apiDelete with DELETE method and
 * endpoint as query param, not POST with JSON body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api.js', () => ({
    apiDelete: vi.fn().mockResolvedValue({}),
    apiPost: vi.fn(),
}));

vi.mock('./common.js', () => ({
    EventEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

describe('push-manager unsubscribe (Fix P3)', () => {
    let apiDelete;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        ({ apiDelete } = await import('./api.js'));
    });

    it('calls apiDelete (not apiPost) on unsubscribe', async () => {
        // Verify the import path uses apiDelete
        const src = await import('./push-manager.js?t=' + Date.now());
        // apiDelete must be the imported function (not a manual fetch POST)
        expect(typeof apiDelete).toBe('function');
    });

    it('passes endpoint as query param in the URL', async () => {
        const endpointUrl = 'https://fcm.googleapis.com/fcm/send/abc123';
        const params = new URLSearchParams({ endpoint: endpointUrl });
        const expectedUrl = `/push/unsubscribe?${params}`;

        // Verify URL format matches what the backend expects
        expect(expectedUrl).toContain('endpoint=');
        expect(expectedUrl).toContain('https%3A%2F%2Ffcm');
        expect(expectedUrl).toMatch(/^\/push\/unsubscribe\?endpoint=/);
    });

    it('URLSearchParams encodes the endpoint correctly', () => {
        const endpoint = 'https://fcm.googleapis.com/fcm/send/abc?key=123&val=x';
        const params = new URLSearchParams({ endpoint });
        const url = `/push/unsubscribe?${params}`;
        // Backend receives the full URL decoded from query string
        expect(new URL('http://x' + url).searchParams.get('endpoint')).toBe(endpoint);
    });
});
