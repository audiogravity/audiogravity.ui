/**
 * Unit tests for buildAuthedUrl — URL construction logic.
 *
 * Tests the URL-building behavior in isolation, without importing api.js
 * (which has module-level auth side-effects). We replicate the exact logic
 * from api.js:buildAuthedUrl to test it directly.
 */
import { describe, it, expect } from 'vitest';

/** Replicate buildAuthedUrl logic from api.js for isolated unit testing. */
function buildAuthedUrl(path, extraParams = {}, { apiKey = '', token = null, base = 'http://localhost:8001' } = {}) {
    const url = new URL(`${base}${path}`, window.location.origin);
    if (apiKey) url.searchParams.append('api_key', apiKey);
    if (token) url.searchParams.append('token', token);
    for (const [k, v] of Object.entries(extraParams)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v);
    }
    return url.toString();
}

describe('buildAuthedUrl — URL construction', () => {
    it('includes api_key param when provided', () => {
        const url = buildAuthedUrl('/sse', {}, { apiKey: 'mykey123' });
        expect(url).toContain('api_key=mykey123');
    });

    it('does not include api_key when empty', () => {
        const url = buildAuthedUrl('/sse', {}, { apiKey: '' });
        expect(url).not.toContain('api_key=');
    });

    it('appends JWT token when provided', () => {
        const url = buildAuthedUrl('/sse', {}, { token: 'jwt-abc-123' });
        expect(url).toContain('token=jwt-abc-123');
    });

    it('does not append token param when token is null', () => {
        const url = buildAuthedUrl('/sse', {}, { token: null });
        expect(url).not.toContain('token=');
    });

    it('forwards extra params', () => {
        const url = buildAuthedUrl('/stream', { format: 'flac', quality: 'hi' });
        expect(url).toContain('format=flac');
        expect(url).toContain('quality=hi');
    });

    it('does not append extra params with null/undefined/empty values', () => {
        const url = buildAuthedUrl('/stream', { foo: null, bar: undefined, baz: '' });
        expect(url).not.toContain('foo=');
        expect(url).not.toContain('bar=');
        expect(url).not.toContain('baz=');
    });

    it('includes the path in the returned URL', () => {
        const url = buildAuthedUrl('/audio-hw/devices');
        expect(url).toContain('/audio-hw/devices');
    });

    it('returns a string', () => {
        expect(typeof buildAuthedUrl('/path')).toBe('string');
    });

    it('api_key and token both present when both provided', () => {
        const url = buildAuthedUrl('/sse', {}, { apiKey: 'key1', token: 'tok1' });
        expect(url).toContain('api_key=key1');
        expect(url).toContain('token=tok1');
    });
});
