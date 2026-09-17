/**
 * What a panel shows when the box cannot be reached.
 *
 * The interface raises an "OFFLINE MODE — VIEWING CACHED DATA" banner across the whole
 * screen, and for a long time only the surfaces fed by the metrics stream honoured it:
 * every panel that fetches its own data answered "Unable to connect to server" directly
 * underneath. These cases pin the seam that closed the gap — a panel declares a
 * `snapshotKey`, the controller saves what it got and hands it back on the next failure.
 *
 * The store is injected, so the cases below own it outright: no localStorage, no PWA
 * manager, and `setSnapshotStore(null)` puts the pre-existing behaviour back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// api.js reaches common.js, which enforces the session at import time and throws outside
// a browser. Every case below drives the controller through `fetchFn`, so apiGet is never
// called — the stubs exist only to keep that side effect out of the module graph.
vi.mock('../api.js', () => ({ apiGet: vi.fn() }));
vi.mock('../ui-helpers.js', () => ({
    getUserFriendlyError: (err) => `friendly: ${err.message}`,
}));

// net-errors.js is imported for real: `isNetworkError` is the discriminator under test,
// and a stub of it would test the stub.

import { FetchController, setSnapshotStore } from './FetchController.js';

/** Enough of a ReactiveElement for the controller's lifecycle. */
function fakeHost() {
    return {
        addController: vi.fn(),
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve(true),
    };
}

/** An in-memory snapshot store, plus spies on both halves. */
function memoryStore(seed = {}) {
    const cells = new Map(Object.entries(seed));
    const store = {
        read: vi.fn((key) => (cells.has(key) ? cells.get(key) : null)),
        write: vi.fn((key, data) => cells.set(key, data)),
    };
    setSnapshotStore(store);
    return { store, cells };
}

const PAYLOAD = { config: { mpd: { label: 'MPD' } }, detailedProfiles: [{ id: 'a' }] };

/** What api.js throws when nothing answered — see net-errors.js `asNetworkError`. */
function offlineError() {
    const err = new TypeError('Failed to fetch');
    err.isNetwork = true;
    return err;
}

/** What it throws when the box answered, and said no. */
function statusError(status) {
    const err = new Error(`HTTP ${status}`);
    err.status = status;
    return err;
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { setSnapshotStore(null); vi.restoreAllMocks(); });

describe('a panel that declares a snapshot key', () => {
    it('saves what it fetched, under that key', async () => {
        const { cells } = memoryStore();
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles',
            fetchFn: async () => PAYLOAD,
        });

        await c.fetch();

        expect(cells.get('profiles')).toEqual(PAYLOAD);
    });

    it('serves the saved state instead of an error when the fetch fails', async () => {
        memoryStore({ profiles: PAYLOAD });
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles',
            fetchFn: async () => { throw offlineError(); },
        });

        await c.fetch();

        expect(c.data, 'le panneau reste vide hors ligne').toEqual(PAYLOAD);
        expect(c.error, 'une erreur est affichée sous le bandeau « cached data »').toBeNull();
        expect(c.stale, 'rien ne distingue une donnée gardée d\'une donnée fraîche').toBe(true);
    });

    it('hands the saved state to onSuccess, in the shape the panel reads', async () => {
        // The point of saving the controller's own payload: the panel's onSuccess is the
        // one function that knows how to unpack it, and it runs unchanged on a restore.
        // The events the pages emit carry a DIFFERENT shape (a bare list), which is what
        // the previous snapshot mechanism collected — and could never have replayed.
        memoryStore({ profiles: PAYLOAD });
        const onSuccess = vi.fn();
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles', onSuccess,
            fetchFn: async () => { throw offlineError(); },
        });

        await c.fetch();

        expect(onSuccess).toHaveBeenCalledWith(PAYLOAD);
        expect(onSuccess.mock.calls[0][0].detailedProfiles).toHaveLength(1);
    });

    it('still reports the failure when nothing was ever saved', async () => {
        // First run on a new device, offline: there is no cached data to view, and
        // claiming otherwise would be worse than the error.
        memoryStore();
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles',
            fetchFn: async () => { throw offlineError(); },
        });

        await c.fetch();

        expect(c.data).toBeNull();
        expect(c.stale).toBe(false);
        expect(c.error).toBeTruthy();
    });

    it('drops the stale mark as soon as a fetch succeeds again', async () => {
        memoryStore({ profiles: PAYLOAD });
        let fail = true;
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles',
            fetchFn: async () => {
                if (fail) throw offlineError();
                return { ...PAYLOAD, detailedProfiles: [{ id: 'a' }, { id: 'b' }] };
            },
        });

        await c.fetch();
        expect(c.stale).toBe(true);

        fail = false;
        await c.fetch();
        expect(c.stale, 'le panneau reste marqué périmé après reconnexion').toBe(false);
        expect(c.data.detailedProfiles).toHaveLength(2);
    });

    it('still calls onError, so a panel can react to the outage itself', async () => {
        memoryStore({ profiles: PAYLOAD });
        const onError = vi.fn();
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles', onError,
            fetchFn: async () => { throw offlineError(); },
        });

        await c.fetch();

        expect(onError).toHaveBeenCalled();
    });

    it('tells onError that a snapshot was served, since `message` is then null', async () => {
        // A caller rendering the second argument would otherwise print "null" beside
        // content that looks live. The third argument is what makes the contract safe.
        memoryStore({ profiles: PAYLOAD });
        const onError = vi.fn();
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles', onError,
            fetchFn: async () => { throw offlineError(); },
        });

        await c.fetch();

        expect(onError).toHaveBeenCalledWith(expect.anything(), null, { servedSnapshot: true });
    });
});

describe('a failure that carries a status is reported, never papered over', () => {
    // The snapshot is the answer to "nothing answered". It is the WRONG answer to "the
    // box answered and said no": a 401 after a key rotation, or a 500 from a crashed
    // core, would render hours-old state as if live — with no error, and no offline
    // banner either, because the browser is online and would rightly say so.
    it.each([[401], [403], [500]])('reports HTTP %i rather than serving the snapshot', async (status) => {
        memoryStore({ profiles: PAYLOAD });
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles',
            fetchFn: async () => { throw statusError(status); },
        });

        await c.fetch();

        expect(c.stale, `un ${status} a été présenté comme des données en cache`).toBe(false);
        expect(c.error).toBeTruthy();
        expect(c.data).toBeNull();
    });

    it('serves the snapshot for the service worker\'s own offline answer', async () => {
        // That answer is a 503 carrying `{error: "offline"}`, and net-errors.js
        // `throwForStatus` turns it into a tagged network error with NO status — which
        // is what keeps the case above from closing the offline path with it.
        memoryStore({ profiles: PAYLOAD });
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles',
            fetchFn: async () => {
                const err = new Error('offline');
                err.isNetwork = true;
                err.retryable = false;
                throw err;
            },
        });

        await c.fetch();

        expect(c.stale).toBe(true);
        expect(c.data).toEqual(PAYLOAD);
    });
});

describe('what may be saved is guarded separately from what may be served', () => {
    // ag-services-page reads its services one by one and answers for any it could not
    // reach rather than failing, so a connection lost partway through still RESOLVES.
    it('refuses to save a payload the panel marks as degraded', async () => {
        const { cells } = memoryStore({ services: { servicesList: [{ id: 'mpd' }] } });
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'services',
            snapshotWhen: (d) => !d.degraded,
            fetchFn: async () => ({ servicesList: [{ id: 'mpd', state: 'unknown' }], degraded: true }),
        });

        await c.fetch();

        expect(cells.get('services'),
            'un relevé dégradé a écrasé le bon instantané').toEqual({ servicesList: [{ id: 'mpd' }] });
    });

    it('saves it once the panel says the reading is whole', async () => {
        const { cells } = memoryStore();
        const whole = { servicesList: [{ id: 'mpd', state: 'active' }], degraded: false };
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'services',
            snapshotWhen: (d) => !d.degraded,
            fetchFn: async () => whole,
        });

        await c.fetch();

        expect(cells.get('services')).toEqual(whole);
    });

    it('is declared by the one panel whose fetch degrades instead of failing', async () => {
        // The controller-level guard is inert unless a panel asks for it, and only this
        // panel needs it: its loop answers for a service it could not read. Asserted on
        // the source because the pairing is the whole point — a `snapshotKey` alone there
        // would quietly save unknowns over a good snapshot.
        const fs = (await import('node:fs')).default;
        const path = (await import('node:path')).default;
        const { fileURLToPath } = await import('node:url');
        // import.meta.dirname, not new URL(..., import.meta.url): under the jsdom
        // environment the latter resolves against the document base and comes back as
        // http:, which fileURLToPath refuses.
        const here = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
        const src = fs.readFileSync(
            path.join(here, '..', 'components', 'organisms', 'ag-services-page.js'), 'utf8');

        expect(src, 'ag-services-page ne déclare plus snapshotWhen').toMatch(/snapshotWhen:/);
        expect(src, 'plus rien ne marque un relevé incomplet').toMatch(/degraded = true/);
    });

    it('refuses to save an empty listing that a null body made look valid', async () => {
        // ag-audio-software-page fetches `apiGet('/packages/') || []`, so a 204 or a null
        // body becomes a perfectly valid empty array. Saved, it restores as a box with no
        // audio software installed — which is a statement, and a false one.
        const { cells } = memoryStore({ packages: [{ name: 'mpd' }] });
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'packages',
            snapshotWhen: (d) => Array.isArray(d) && d.length > 0,
            fetchFn: async () => [],
        });

        await c.fetch();

        expect(cells.get('packages')).toEqual([{ name: 'mpd' }]);
    });

    it('still displays the degraded reading — the guard is on saving only', async () => {
        memoryStore();
        const degraded = { servicesList: [{ id: 'mpd', state: 'unknown' }], degraded: true };
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'services',
            snapshotWhen: (d) => !d.degraded,
            fetchFn: async () => degraded,
        });

        await c.fetch();

        expect(c.data).toEqual(degraded);
        expect(c.error).toBeNull();
    });
});

describe('a panel that declares nothing behaves exactly as before', () => {
    it('saves nothing', async () => {
        const { store } = memoryStore();
        const c = new FetchController(fakeHost(), {
            autoFetch: false, fetchFn: async () => PAYLOAD,
        });

        await c.fetch();

        expect(store.write).not.toHaveBeenCalled();
    });

    it('reports the failure, snapshot or not', async () => {
        // A snapshot stored under some other key must not leak into an unrelated panel.
        memoryStore({ profiles: PAYLOAD });
        const c = new FetchController(fakeHost(), {
            autoFetch: false,
            fetchFn: async () => { throw offlineError(); },
        });

        await c.fetch();

        expect(c.data).toBeNull();
        expect(c.error).toBeTruthy();
        expect(c.stale).toBe(false);
    });
});

describe('who may serve a stale reading, and who may never', () => {
    // The offline banner announces cached data for the WHOLE screen, so every panel that
    // can honour it should. But "can" is not "may": the split below is a safety rule, not
    // a convenience, and it is asserted here because nothing else records it — a later
    // reader sees only a one-line option that looks uniformly useful.
    const ORGANISMS = 'js/components/organisms';

    /** Read an organism's source. */
    async function source(name) {
        const fs = (await import('node:fs')).default;
        const path = (await import('node:path')).default;
        const { fileURLToPath } = await import('node:url');
        const here = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
        return fs.readFileSync(path.join(here, '..', ...ORGANISMS.split('/').slice(1), name), 'utf8');
    }

    // Read-only views of the state of the box. Stale, they say "here is what the box looked
    // like last time", which is what the banner promises.
    it.each([
        'ag-profiles-page.js',
        'ag-services-page.js',
        'ag-system-dashboard.js',
        'ag-audio-software-page.js',
        'ag-admin-page.js',
        'ag-performance-page.js',
    ])('%s keeps its reading for the next offline start', async (file) => {
        expect(await source(file), `${file} ne déclare plus snapshotKey`).toMatch(/snapshotKey:/);
    });

    // Surfaces you can WRITE from. Serving a reading hours old on a screen with a Save
    // button offers to overwrite the live file with a stale copy — the error message is
    // the correct answer there, and it must stay the answer.
    it.each([
        'ag-config-page.js',
        'ag-systemd-page.js',
    ])('%s must NEVER serve a stale reading — you can save from it', async (file) => {
        expect(await source(file),
            `${file} sert un état périmé sur un écran qui peut écrire`).not.toMatch(/snapshotKey:/);
    });

    // Two of the four cannot be trusted to fail: one answers for a service it could not
    // reach, the other turns a null body into a valid empty list. Both therefore RESOLVE
    // on a half-outage, and a key alone would save that over a good reading.
    it.each([
        'ag-services-page.js',
        'ag-audio-software-page.js',
        'ag-admin-page.js',
        'ag-performance-page.js',
    ])('%s guards what it saves, because its fetch resolves on a failure', async (file) => {
        const src = await source(file);
        expect(src, `${file} déclare snapshotKey sans snapshotWhen`).toMatch(/snapshotWhen:/);
    });

    it('the log viewer never does either', async () => {
        // Frozen logs presented as live mislead on precisely the subject one opens them for.
        // They are also large, so keeping a copy per load would be paid at every load.
        expect(await source('ag-log-viewer.js')).not.toMatch(/snapshotKey:/);
    });
});

describe('with no store registered at all', () => {
    it('leaves a declared key inert rather than throwing', async () => {
        // The store is registered by PWAManager.init(). Storybook, the test suite and any
        // page that boots without it must not break on a panel that declares a key.
        setSnapshotStore(null);
        const c = new FetchController(fakeHost(), {
            autoFetch: false, snapshotKey: 'profiles',
            fetchFn: async () => { throw offlineError(); },
        });

        await expect(c.fetch()).resolves.toBeUndefined();
        expect(c.error).toBeTruthy();
        expect(c.stale).toBe(false);
    });
});
