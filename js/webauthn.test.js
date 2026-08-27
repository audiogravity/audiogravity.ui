/**
 * Tests for loginWithPasskey — adaptation to the server's anti-enumeration change
 * (/auth/webauthn/login/begin now returns 200 with empty allowCredentials for an
 * unknown / passkey-less user instead of a 404).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loginWithPasskey } from './webauthn.js';
import { isNetworkError } from './net-errors.js';

const okJson = (body) => ({ ok: true, json: async () => body });

describe('loginWithPasskey', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        if (!navigator.credentials) {
            Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
        }
        navigator.credentials.get = vi.fn();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('short-circuits (NoPasskeyError) without prompting when the username has no passkey', async () => {
        // begin → 200 with empty allowCredentials (unknown / passkey-less user)
        fetch.mockResolvedValueOnce(okJson({ challenge: 'AA', allowCredentials: [] }));

        await expect(loginWithPasskey('alice')).rejects.toMatchObject({ name: 'NoPasskeyError' });
        // Must NOT prompt the authenticator (would offer other accounts' passkeys).
        expect(navigator.credentials.get).not.toHaveBeenCalled();
        // Only the begin call was made — no /complete.
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('prompts and completes when the user has passkeys', async () => {
        fetch
            .mockResolvedValueOnce(okJson({ challenge: 'AA', allowCredentials: [{ id: 'Y3JlZA', type: 'public-key' }] }))
            .mockResolvedValueOnce(okJson({ access_token: 't', username: 'alice', role: 'user' }));
        navigator.credentials.get.mockResolvedValueOnce({
            id: 'cred',
            rawId: new Uint8Array([1]).buffer,
            type: 'public-key',
            response: {
                clientDataJSON: new Uint8Array([1]).buffer,
                authenticatorData: new Uint8Array([2]).buffer,
                signature: new Uint8Array([3]).buffer,
            },
        });

        const res = await loginWithPasskey('alice');

        expect(navigator.credentials.get).toHaveBeenCalledTimes(1);
        expect(res).toMatchObject({ access_token: 't' });
    });

    it('discoverable flow (no username) still prompts even with empty allowCredentials', async () => {
        fetch
            .mockResolvedValueOnce(okJson({ challenge: 'AA', allowCredentials: [], _token: 'tok' }))
            .mockResolvedValueOnce(okJson({ access_token: 't2', username: 'bob', role: 'user' }));
        navigator.credentials.get.mockResolvedValueOnce({
            id: 'cred', rawId: new Uint8Array([1]).buffer, type: 'public-key',
            response: {
                clientDataJSON: new Uint8Array([1]).buffer,
                authenticatorData: new Uint8Array([2]).buffer,
                signature: new Uint8Array([3]).buffer,
                userHandle: new Uint8Array([4]).buffer,
            },
        });

        const res = await loginWithPasskey();  // no username → discoverable

        expect(navigator.credentials.get).toHaveBeenCalledTimes(1);
        expect(res).toMatchObject({ access_token: 't2' });
    });
});

describe('webauthnFetch — what a refusal and a dead network look like to the caller', () => {
    // Until now only `ok: true` was ever mocked, so the branch every sign-in message depends on
    // ran untested. These are the responses the servers really send.
    beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('carries the status and the core\'s own sentence on a 401', async () => {
        fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'Credential not found' }) });
        const err = await loginWithPasskey('alice').catch(e => e);
        expect(err.status).toBe(401);
        expect(err.detail).toBe('Credential not found');
        expect(isNetworkError(err)).toBe(false);
    });

    it('reads a slowapi rate limit, which is worded under `error`, not `detail`', async () => {
        fetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'Rate limit exceeded: 5 per 1 minute' }) });
        const err = await loginWithPasskey('alice').catch(e => e);
        expect(err.status).toBe(429);
        expect(err.detail).toBe('Rate limit exceeded: 5 per 1 minute');
        expect(err.message).toBe('Rate limit exceeded: 5 per 1 minute');
    });

    it('leaves detail null on a proxy 502 whose body is HTML', async () => {
        fetch.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new SyntaxError('not JSON'); } });
        const err = await loginWithPasskey('alice').catch(e => e);
        expect(err.status).toBe(502);
        expect(err.detail).toBeNull();
        expect(err.message).toBe('HTTP 502');
    });

    it('tags a transport failure whatever the engine calls it', async () => {
        fetch.mockRejectedValueOnce(new TypeError('Load failed'));
        const err = await loginWithPasskey('alice').catch(e => e);
        expect(isNetworkError(err)).toBe(true);
        expect(err.status).toBeUndefined();
    });
});
