/**
 * Unit tests for sessionEnded (core/credentials.js).
 *
 * The core ends a session when its token expires or its account changes, and says
 * so with a 401 carrying a `WWW-Authenticate: Bearer` challenge. Other 401s — a
 * password re-typed wrong for a sensitive action, a streaming service refusing its
 * login — carry no challenge, and signing the user out on them would lose their page
 * over a typo.
 *
 * Covers:
 * 1. a challenged 401 on a request that carried a session ends it
 * 2. the same answer to a request that carried none does not (sign-in attempts)
 * 3. an unchallenged 401 does not, nor does a challenged answer of another status
 */
import { describe, it, expect } from 'vitest';
import { sessionEnded } from './credentials.js';

/**
 * Build a Response the way the core would send it.
 * @param {number} status - HTTP status.
 * @param {string|null} challenge - WWW-Authenticate value, or null for none.
 */
function answer(status, challenge) {
    const headers = new Headers();
    if (challenge) headers.set('WWW-Authenticate', challenge);
    return new Response(JSON.stringify({ detail: 'x' }), { status, headers });
}

describe('sessionEnded', () => {
    it('is true for a challenged 401 on a request that carried a session', () => {
        expect(sessionEnded(answer(401, 'Bearer'), 'Bearer abc')).toBe(true);
    });

    it('reads the RFC 6750 form with parameters, whatever the case', () => {
        expect(sessionEnded(answer(401, 'bearer error="invalid_token"'), 'Bearer abc')).toBe(true);
    });

    it('is false when the request carried no session — a sign-in attempt', () => {
        expect(sessionEnded(answer(401, 'Bearer'), undefined)).toBe(false);
    });

    it('is false for a 401 without the challenge — a password typed wrong', () => {
        expect(sessionEnded(answer(401, null), 'Bearer abc')).toBe(false);
    });

    it('is false for a challenge on another status', () => {
        expect(sessionEnded(answer(403, 'Bearer'), 'Bearer abc')).toBe(false);
    });
});
