/**
 * Unit tests for api.js — every request that carries the session goes through the one
 * place that ends a session the core refused (auth.js fetchInSession).
 *
 * The check lived in apiCall alone: an upload made with an ended session came back
 * refused and left the page signed in, as did a passkey registration (webauthn.test.js).
 *
 * Covers:
 * 1. apiCall and apiUpload send through the session
 */
import { describe, it, expect, vi } from 'vitest';

const auth = vi.hoisted(() => ({
    fetchInSession: vi.fn(async () => new Response('{}', { status: 200 })),
    fetchJsonInSession: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./auth.js', () => ({ getAuthToken: () => 'tok', ...auth }));
vi.mock('./common.js', () => ({ AppState: {}, updateConnectionStatus: vi.fn() }));

const { apiCall, apiUpload } = await import('./api.js');

describe('requests carrying the session', () => {
    it('apiCall goes through the session', async () => {
        await apiCall('/sysinfo/current');
        const [url, options] = auth.fetchInSession.mock.calls[0];
        expect(url).toMatch(/\/sysinfo\/current$/);
        expect(options.headers.Authorization).toBe('Bearer tok');
    });

    it('apiUpload goes through the session', async () => {
        await apiUpload('/license/upload', new Blob(['x']));
        const [url, options] = auth.fetchJsonInSession.mock.calls[0];
        expect(url).toMatch(/\/license\/upload$/);
        expect(options.headers.Authorization).toBe('Bearer tok');
    });
});
