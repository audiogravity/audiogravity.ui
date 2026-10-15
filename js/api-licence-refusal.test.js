/**
 * Unit tests for api.js — a refusal of the core for want of Pro makes the tab read the
 * box's licence again.
 *
 * The licence was read once, when the tab bar mounted: a trial that ended while the app
 * stayed open left every padlock off and every refusal of the core reading as a failure
 * (review, 2026-10-15). The words come from the core's require_full_license
 * (modules/license/router.py); no other 403 of the core names the licence.
 *
 * Covers:
 * 1. the core's licence refusals ask for the licence again (`ag:license-changed`)
 * 2. other refusals, and other statuses naming the licence, do not
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const auth = vi.hoisted(() => ({
    fetchInSession: vi.fn(),
    fetchJsonInSession: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./auth.js', () => ({ getAuthToken: () => 'tok', ...auth }));
vi.mock('./common.js', () => ({ AppState: {}, updateConnectionStatus: vi.fn() }));
// A key, so the keyless gate stays out of the way: a 403 would otherwise lock it.
vi.mock('./core/config.js', () => ({
    API_BASE_URL: 'http://core.test', API_KEY_HEADER: 'X-API-Key', API_KEY: 'k',
}));

const { apiCall } = await import('./api.js');

/** The core's answer, as FastAPI shapes an HTTPException. */
const answer = (status, detail) => new Response(JSON.stringify({ detail }), {
    status, headers: { 'Content-Type': 'application/json' },
});

describe('a refusal for want of Pro', () => {
    const heard = vi.fn();
    beforeEach(() => {
        heard.mockClear();
        window.addEventListener('ag:license-changed', heard);
    });
    afterEach(() => window.removeEventListener('ag:license-changed', heard));

    it.each([
        'Full license required. Activate your trial or purchase a license.',
        'This license ended on 2026-10-01. Renew it to use this feature.',
        'This license has ended. Renew it to use this feature.',
    ])('asks for the licence again: %s', async (detail) => {
        auth.fetchInSession.mockResolvedValueOnce(answer(403, detail));
        await expect(apiCall('/library/qobuz-shelves')).rejects.toMatchObject({ status: 403 });
        expect(heard).toHaveBeenCalledOnce();
    });

    it.each([
        [403, 'Guests are not allowed to modify this resource'],
        [403, 'Administrator access required'],
        [503, 'License service not initialised.'],
    ])('leaves the licence alone for a %i "%s"', async (status, detail) => {
        auth.fetchInSession.mockResolvedValueOnce(answer(status, detail));
        await expect(apiCall('/library/queue')).rejects.toMatchObject({ status });
        expect(heard).not.toHaveBeenCalled();
    });

    it('leaves it alone when the core answers', async () => {
        auth.fetchInSession.mockResolvedValueOnce(answer(200, 'license'));
        await apiCall('/license/status');
        expect(heard).not.toHaveBeenCalled();
    });
});
