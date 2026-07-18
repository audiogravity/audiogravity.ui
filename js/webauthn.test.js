/**
 * Tests for loginWithPasskey — adaptation to the server's anti-enumeration change
 * (/auth/webauthn/login/begin now returns 200 with empty allowCredentials for an
 * unknown / passkey-less user instead of a 404).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loginWithPasskey } from './webauthn.js';

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
