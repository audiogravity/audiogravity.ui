/**
 * Unit tests for ag-update-banner.js: visibility logic, the Admin-tab badge, the
 * progress polling, and what the banner says when an update does not go through.
 *
 * The component is imported and mounted for real, with api.js, auth.js and the
 * dialogs mocked. Importing it unmocked throws the auth check, which is why its
 * logic used to be re-declared here — and tested as a copy that could drift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../auth.js', () => ({ isAdmin: vi.fn(() => true) }));
vi.mock('../../ui-helpers.js', () => ({
    showConfirm: vi.fn(async () => true),
    showPasswordConfirm: vi.fn(async () => 'secret'),
    showToast: vi.fn(),
}));

import { apiGet, apiPost } from '../../api.js';
import { isAdmin } from '../../auth.js';
import { showToast } from '../../ui-helpers.js';
import { isUpdateAvailable, updatePhaseLabel, updateFailureText } from './ag-update-banner.js';

const POLL_MS = 3000;

/** What the core installer says on a Debian 12 box, word for word (ops tests check the same). */
const REFUSED = 'This system (Debian GNU/Linux 12 (bookworm)) has glibc 2.36; this core needs 2.38 '
    + 'or later. Audiogravity requires Debian 13 (Trixie) or later — DietPi and Raspberry Pi OS '
    + 'included, in their Trixie-based release. The installed version is left as it is.';

/** The update the licence server offers in most tests. */
const OFFER = { available: true, latest: '0.9.65' };

/** A promise the test settles itself, to unmount while a request is on its way. */
function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('ag-update-banner — isUpdateAvailable', () => {
    it('is false for null / undefined / empty', () => {
        expect(isUpdateAvailable(null)).toBe(false);
        expect(isUpdateAvailable(undefined)).toBe(false);
        expect(isUpdateAvailable({})).toBe(false);
    });

    it('is false when available is false', () => {
        expect(isUpdateAvailable({ available: false })).toBe(false);
        expect(isUpdateAvailable({ available: false, latest: '0.9.11' })).toBe(false);
    });

    it('is false when available but latest is missing', () => {
        expect(isUpdateAvailable({ available: true })).toBe(false);
        expect(isUpdateAvailable({ available: true, latest: '' })).toBe(false);
    });

    it('is true when available with a latest version', () => {
        expect(isUpdateAvailable({ available: true, latest: '0.9.11' })).toBe(true);
        expect(isUpdateAvailable({ available: true, latest: '1.0.0', mandatory: true })).toBe(true);
    });
});

describe('ag-update-banner — updatePhaseLabel', () => {
    it('maps known phases to human labels', () => {
        expect(updatePhaseLabel('downloading')).toBe('Downloading…');
        expect(updatePhaseLabel('installing')).toBe('Installing…');
        expect(updatePhaseLabel('verifying')).toBe('Verifying…');
        expect(updatePhaseLabel('done')).toBe('Update complete');
        expect(updatePhaseLabel('rolled_back')).toContain('previous version restored');
    });

    it('falls back to a generic label for unknown/empty phases', () => {
        expect(updatePhaseLabel('bogus')).toBe('Updating…');
        expect(updatePhaseLabel(undefined)).toBe('Updating…');
    });
});

describe('ag-update-banner — updateFailureText', () => {
    it('follows the label with the reason the box gave', () => {
        expect(updateFailureText('rolled_back', REFUSED))
            .toBe(`Update failed — previous version restored. ${REFUSED}`);
    });

    it('is the label alone when the box gave no reason', () => {
        expect(updateFailureText('failed', null)).toBe('Update failed');
        expect(updateFailureText('failed', undefined)).toBe('Update failed');
        expect(updateFailureText('failed', '  ')).toBe('Update failed');
    });
});

// ── The mounted component ────────────────────────────────────────────────────

describe('ag-update-banner — mounted', () => {
    let el;
    /** What GET /license/online-status offers. */
    let offer;
    /** What GET /sysinfo/update-status answers next. */
    let status;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        isAdmin.mockReturnValue(true);
        offer = OFFER;
        status = { phase: 'idle' };
        apiGet.mockImplementation(async (path) => (path === '/license/online-status'
            ? { update: offer }
            : status));
        apiPost.mockResolvedValue({ status: 'updating' });
    });

    afterEach(() => {
        el?.remove();
        el = null;
        vi.useRealTimers();
    });

    /** Mount the banner and let it read the update on offer (and the last attempt). */
    async function mount() {
        el = document.createElement('ag-update-banner');
        document.body.appendChild(el);
        await vi.advanceTimersByTimeAsync(0);
        await el.updateComplete;
    }

    /** Click through an update whose progress polls as ``final``. */
    async function attempt(final) {
        status = { phase: 'installing' };
        await el._handleUpdate();
        status = final;
        await vi.advanceTimersByTimeAsync(POLL_MS);
        await el.updateComplete;
    }

    /** How many times the progress has been polled. */
    const polls = () => apiGet.mock.calls.filter(([path]) => path === '/sysinfo/update-status').length;

    describe('the Admin-tab badge (update-badge event)', () => {
        /** The badge details emitted while mounting with ``update`` on offer. */
        async function badgesFor(update) {
            offer = update;
            const events = [];
            const handler = e => events.push(e.detail);
            window.addEventListener('update-badge', handler);
            try { await mount(); } finally { window.removeEventListener('update-badge', handler); }
            return events;
        }

        it('says an update is available', async () => {
            expect(await badgesFor({ available: true, latest: '1.0.0' }))
                .toEqual([{ available: true, mandatory: false }]);
        });

        it('clears when there is none', async () => {
            expect(await badgesFor(null)).toEqual([{ available: false, mandatory: false }]);
        });

        it('flags a mandatory update', async () => {
            expect(await badgesFor({ available: true, latest: '1.0.0', mandatory: true }))
                .toEqual([{ available: true, mandatory: true }]);
        });

        it('says none when available but latest is missing', async () => {
            const [detail] = await badgesFor({ available: true });
            expect(detail.available).toBe(false);
        });
    });

    describe('the progress polling', () => {
        it.each(['starting', 'downloading', 'installing', 'verifying'])(
            'keeps polling while the update is %s', async (phase) => {
                await mount();
                await attempt({ phase });
                const seen = polls();
                await vi.advanceTimersByTimeAsync(POLL_MS);
                expect(polls()).toBe(seen + 1);
                expect(el._updating).toBe(true);
            });

        it.each(['rolled_back', 'failed'])('stops at %s and offers the update again', async (phase) => {
            await mount();
            await attempt({ phase, error: null });
            const seen = polls();
            await vi.advanceTimersByTimeAsync(3 * POLL_MS);
            expect(polls()).toBe(seen);
            expect(el._updating).toBe(false);
            expect(el.querySelector('.ag-upd-btn')).not.toBeNull();
        });

        it('stops at done and says so before reloading', async () => {
            await mount();
            await attempt({ phase: 'done' });
            // The poll loop is gone; time is not advanced to the reload it schedules,
            // which jsdom cannot perform.
            expect(el._pollTimer).toBeNull();
            expect(showToast).toHaveBeenCalledWith('success', 'Update complete', 'Reloading…');
        });
    });

    describe('an update that does not go through says why', () => {
        it('says nothing before an attempt', async () => {
            await mount();
            expect(el.querySelector('.ag-upd-failure')).toBeNull();
        });

        it('leaves the reason under the banner, which still offers the update', async () => {
            await mount();
            await attempt({ phase: 'rolled_back', error: REFUSED });
            expect(el.querySelector('.ag-upd-failure').textContent)
                .toBe(`Update failed — previous version restored. ${REFUSED}`);
            expect(el.querySelector('.ag-upd-btn')).not.toBeNull();
            expect(showToast).toHaveBeenCalledWith(
                'error', 'Update not applied', 'Update failed — previous version restored');
        });

        it('sets the brand in the reason as the interface sets it', async () => {
            await mount();
            await attempt({ phase: 'rolled_back', error: REFUSED });
            // Without the comments Lit leaves between the parts it renders.
            const markup = el.querySelector('.ag-upd-failure').innerHTML.replace(/<!--[^>]*-->/g, '');
            expect(markup).toContain('Audiogravi<sup>ty</sup> requires Debian 13');
            expect(markup).not.toMatch(/Audiogravity/);
        });

        it('says only what happened when the box gave no reason', async () => {
            await mount();
            await attempt({ phase: 'failed', error: null });
            expect(el.querySelector('.ag-upd-failure').textContent).toBe('Update failed');
        });

        it('gives the next failure its own words, not the previous reason', async () => {
            await mount();
            await attempt({ phase: 'rolled_back', error: REFUSED });
            await attempt({ phase: 'failed', error: null });
            expect(el.querySelector('.ag-upd-failure').textContent).toBe('Update failed');
        });

        it('does not show the previous reason after an attempt that never ended', async () => {
            await mount();
            await attempt({ phase: 'rolled_back', error: REFUSED });
            // The next one stays in progress until the banner stops waiting (6 min).
            await attempt({ phase: 'installing' });
            await vi.advanceTimersByTimeAsync(6 * 60 * 1000 + POLL_MS);
            await el.updateComplete;
            expect(el._updating).toBe(false);
            expect(el.querySelector('.ag-upd-failure')).toBeNull();
        });
    });

    describe('opened after an attempt', () => {
        it('reads back why the last attempt at this version did not go through', async () => {
            status = { phase: 'rolled_back', from: '0.9.64', to: '0.9.65', error: REFUSED };
            await mount();
            expect(el.querySelector('.ag-upd-failure').textContent)
                .toBe(`Update failed — previous version restored. ${REFUSED}`);
        });

        it.each([['v0.9.65', '0.9.65'], ['0.9.65', 'v0.9.65-dev'], ['0.9.65', '0.9.65+build.7']])(
            'takes %j on offer and %j attempted for the same version', async (latest, to) => {
                offer = { available: true, latest };
                status = { phase: 'failed', to, error: 'Download failed.' };
                await mount();
                expect(el.querySelector('.ag-upd-failure').textContent).toBe('Update failed. Download failed.');
            });

        it('neither asks the box nor shows a reason to a user who is not an admin', async () => {
            isAdmin.mockReturnValue(false);
            status = { phase: 'rolled_back', to: '0.9.65', error: REFUSED };
            await mount();
            expect(polls()).toBe(0);
            expect(el.querySelector('.ag-upd-failure')).toBeNull();
            expect(el.querySelector('.ag-upd-btn')).toBeNull();
            expect(el.querySelector('.ag-upd-banner')).not.toBeNull();   // the offer itself still shows
        });

        it('says nothing of an attempt at another version', async () => {
            status = { phase: 'rolled_back', to: '0.9.64', error: REFUSED };
            await mount();
            expect(el.querySelector('.ag-upd-failure')).toBeNull();
        });

        it.each([{ phase: 'done', to: '0.9.65' }, { phase: 'idle' }, null])(
            'says nothing after %j', async (last) => {
                status = last;
                await mount();
                expect(el.querySelector('.ag-upd-failure')).toBeNull();
            });

        it('does not ask when no update is on offer', async () => {
            offer = null;
            await mount();
            expect(polls()).toBe(0);
        });

        it('writes nothing once unmounted while the offer is on its way', async () => {
            const pending = deferred();
            apiGet.mockImplementation(async (path) => (path === '/license/online-status' ? pending.promise : status));
            const events = [];
            const handler = e => events.push(e.detail);
            window.addEventListener('update-badge', handler);
            try {
                el = document.createElement('ag-update-banner');
                document.body.appendChild(el);
                el.remove();
                pending.resolve({ update: OFFER });
                await vi.advanceTimersByTimeAsync(0);
            } finally {
                window.removeEventListener('update-badge', handler);
            }
            expect(events).toEqual([]);
            expect(el._update).toBeNull();
            expect(polls()).toBe(0);
        });

        it('writes no reason once unmounted while the last attempt is read', async () => {
            const pending = deferred();
            apiGet.mockImplementation(async (path) => (path === '/license/online-status'
                ? { update: OFFER }
                : pending.promise));
            el = document.createElement('ag-update-banner');
            document.body.appendChild(el);
            await vi.advanceTimersByTimeAsync(0);          // the offer is in, the status asked
            expect(polls()).toBe(1);
            el.remove();
            pending.resolve({ phase: 'rolled_back', to: '0.9.65', error: REFUSED });
            await vi.advanceTimersByTimeAsync(0);
            expect(el._failure).toBeNull();
        });

        it('is not hurt by a box that cannot answer', async () => {
            apiGet.mockImplementation(async (path) => {
                if (path === '/license/online-status') return { update: OFFER };
                throw new Error('503');
            });
            await mount();
            expect(el.querySelector('.ag-upd-btn')).not.toBeNull();
            expect(el.querySelector('.ag-upd-failure')).toBeNull();
        });
    });
});
