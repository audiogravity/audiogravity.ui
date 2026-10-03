/**
 * Tests for sw-update — telling a new service worker to take over once it is installed.
 *
 * Covers:
 * 1. a worker found while the page is open, told once installed
 * 2. a worker already waiting when the page registers, told at once
 * 3. a worker still installing when the page registers, told once installed — once only,
 *    its updatefound gone or still to come
 * 4. a first install (no active worker): nothing told, nothing said — but a hard reload
 *    (an active worker, no controller) still tells the new one
 * 5. a worker whose install failed: not told
 * 6. successive workers: each told
 * 7. a told worker still waiting after TAKEOVER_WAIT_MS: one reload, once in five minutes,
 *    and within that time no "Updating…" announcing nothing
 * 8. the periodic check tells a worker still waiting again
 * 9. the page hands its registration over, and calls the check (common.js)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyUpdates, SKIP_WAITING, TAKEOVER_WAIT_MS, RELOAD_WINDOW_MS } from './sw-update.js';

/**
 * A registration and its workers, moving as a browser moves them: the registration's
 * installing, waiting and active change first, then the worker's statechange fires.
 */
class FakeRegistration extends EventTarget {
    constructor({ active = new FakeWorker('activated'), waiting = null, installing = null } = {}) {
        super();
        this.active = active;
        this.waiting = waiting;
        this.installing = installing;
        for (const worker of [active, waiting, installing]) if (worker) worker.registration = this;
    }

    /** A new worker found by the browser's check. */
    find(worker) {
        worker.registration = this;
        this.installing = worker;
        this.dispatchEvent(new Event('updatefound'));
    }

    settle(worker, state) {
        const leave = (slot) => { if (this[slot] === worker) this[slot] = null; };
        if (state === 'installed') { leave('installing'); this.waiting = worker; }
        if (state === 'activating') { leave('waiting'); this.active = worker; }
        if (state === 'redundant') { leave('installing'); leave('waiting'); }
    }
}

class FakeWorker extends EventTarget {
    constructor(state = 'installing') {
        super();
        this.state = state;
        this.registration = null;
        this.postMessage = vi.fn();
    }

    become(state) {
        this.registration?.settle(this, state);
        this.state = state;
        this.dispatchEvent(new Event('statechange'));
    }
}

function memoryStorage(values = {}) {
    const map = new Map(Object.entries(values));
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

// The timer every told worker starts must never reach the real page: the reload is a stub
// in every case, and time is the test's own.
let reload;
beforeEach(() => { vi.useFakeTimers(); reload = vi.fn(); });
afterEach(() => { vi.useRealTimers(); });

/** applyUpdates' options, the seams filled in. */
const seams = (extra = {}) => ({ reload, storage: memoryStorage(), now: () => 1e9, ...extra });

describe('applyUpdates', () => {
    it('tells a worker found while the page is open to take over, once it is installed', () => {
        const registration = new FakeRegistration();
        const onUpdate = vi.fn();
        applyUpdates(registration, seams({ onUpdate }));

        const worker = new FakeWorker();
        registration.find(worker);
        expect(worker.postMessage, 'told before it was installed').not.toHaveBeenCalled();

        worker.become('installed');
        expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
        expect(onUpdate).toHaveBeenCalledOnce();
    });

    it('tells a worker already waiting when the page registers', () => {
        // Installed before the page listened: found by the navigation that opened it, or
        // during a session closed before the message went out. It waited until every
        // window of the app was closed.
        const waiting = new FakeWorker('installed');
        const onUpdate = vi.fn();

        applyUpdates(new FakeRegistration({ waiting }), seams({ onUpdate }));

        expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
        expect(onUpdate).toHaveBeenCalledOnce();
    });

    it('tells a worker still installing when the page registers, once installed', () => {
        // Its updatefound went out before the page listened: none will come.
        const installing = new FakeWorker();
        applyUpdates(new FakeRegistration({ installing }), seams());

        installing.become('installed');

        expect(installing.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
    });

    it('tells it once only, should its updatefound come after all', () => {
        const installing = new FakeWorker();
        const registration = new FakeRegistration({ installing });
        applyUpdates(registration, seams());

        registration.find(installing);
        installing.become('installed');

        expect(installing.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
    });

    it('tells nothing, and says nothing, on a first install', () => {
        // No active worker: the new one activates by itself and takes the page over
        // (clients.claim), and there is no version being replaced.
        const registration = new FakeRegistration({ active: null });
        const onUpdate = vi.fn();
        applyUpdates(registration, seams({ onUpdate }));

        const worker = new FakeWorker();
        registration.find(worker);
        worker.become('installed');
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);

        expect(worker.postMessage).not.toHaveBeenCalled();
        expect(onUpdate).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it('still tells the new worker after a hard reload, which leaves the page without a controller', () => {
        // The page's controller is not the test: an older version is active, and waits
        // to be replaced. (The module reads the registration only — never the controller.)
        const waiting = new FakeWorker('installed');
        applyUpdates(new FakeRegistration({ waiting }), seams());

        expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
    });

    it('leaves a worker whose install failed', () => {
        const registration = new FakeRegistration();
        const onUpdate = vi.fn();
        applyUpdates(registration, seams({ onUpdate }));

        const worker = new FakeWorker();
        registration.find(worker);
        worker.become('redundant');
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);

        expect(worker.postMessage).not.toHaveBeenCalled();
        expect(onUpdate).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it('tells each new worker, one after another', () => {
        const registration = new FakeRegistration();
        applyUpdates(registration, seams());

        const first = new FakeWorker();
        registration.find(first);
        first.become('installed');
        first.become('activating');
        const second = new FakeWorker();
        registration.find(second);
        second.become('installed');

        expect(first.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
        expect(second.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
    });
});

describe('a told worker that does not take over', () => {
    // Right after the app opens, Chromium sometimes leaves the told worker waiting with
    // nothing left for the old one to do; a reload lets it in (measured, see the module).

    it('reloads the page once the wait is over — a worker found while the page is open', () => {
        const registration = new FakeRegistration();
        applyUpdates(registration, seams());
        const worker = new FakeWorker();
        registration.find(worker);
        worker.become('installed');

        vi.advanceTimersByTime(TAKEOVER_WAIT_MS - 1);
        expect(reload, 'reloaded before the wait was over').not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(reload).toHaveBeenCalledOnce();
    });

    it('reloads the page once the wait is over — a worker already waiting', () => {
        applyUpdates(new FakeRegistration({ waiting: new FakeWorker('installed') }), seams());
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(reload).toHaveBeenCalledOnce();
    });

    it('leaves the page alone when the worker took over', () => {
        const registration = new FakeRegistration();
        applyUpdates(registration, seams());
        const worker = new FakeWorker();
        registration.find(worker);
        worker.become('installed');
        worker.become('activating');          // the page reloads on controllerchange

        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(reload).not.toHaveBeenCalled();
    });

    it('records the reload, so that the next one waits', () => {
        const storage = memoryStorage();
        applyUpdates(new FakeRegistration({ waiting: new FakeWorker('installed') }), seams({ storage }));
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(storage.getItem('sw-update-reload-at')).toBe(String(1e9));
    });

    it('within five minutes of its last reload, tells the worker but announces and reloads nothing', () => {
        // Another window may hold the old worker: each reload would find it waiting again.
        const storage = memoryStorage({ 'sw-update-reload-at': String(1e9 - RELOAD_WINDOW_MS + 1) });
        const waiting = new FakeWorker('installed');
        const onUpdate = vi.fn();
        applyUpdates(new FakeRegistration({ waiting }), seams({ storage, onUpdate }));
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);

        expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith(SKIP_WAITING);
        expect(onUpdate, '"Updating…" with nothing to follow').not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it('reloads again once those five minutes are over', () => {
        const storage = memoryStorage({ 'sw-update-reload-at': String(1e9 - RELOAD_WINDOW_MS) });
        applyUpdates(new FakeRegistration({ waiting: new FakeWorker('installed') }), seams({ storage }));
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(reload).toHaveBeenCalledOnce();
    });

    it('does not reload without session storage to guard against a loop', () => {
        const storage = { getItem: () => { throw new Error('denied'); }, setItem: vi.fn() };
        const onUpdate = vi.fn();
        applyUpdates(new FakeRegistration({ waiting: new FakeWorker('installed') }), seams({ storage, onUpdate }));
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(reload).not.toHaveBeenCalled();
        expect(onUpdate).not.toHaveBeenCalled();
    });
});

describe('the periodic check', () => {
    // The update a waiting worker carries is the one the check looks for: it finds nothing
    // new, no updatefound comes — the worker would never be told again.

    it('tells a worker still waiting again, and reloads if the five minutes are over', () => {
        let clock = 1e9;
        const storage = memoryStorage();
        const waiting = new FakeWorker('installed');
        const onUpdate = vi.fn();
        const tellWaiting = applyUpdates(new FakeRegistration({ waiting }), seams({ storage, onUpdate, now: () => clock }));
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(reload).toHaveBeenCalledOnce();     // the first reload did not let it in

        clock += RELOAD_WINDOW_MS;
        tellWaiting();
        expect(waiting.postMessage).toHaveBeenCalledTimes(2);
        expect(onUpdate).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(reload).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no worker waits', () => {
        const onUpdate = vi.fn();
        const tellWaiting = applyUpdates(new FakeRegistration(), seams({ onUpdate }));
        tellWaiting();
        vi.advanceTimersByTime(TAKEOVER_WAIT_MS);
        expect(onUpdate).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });
});

describe('the page', () => {
    it('hands its registration over once registered, and tells a waiting worker at each check', () => {
        // common.js registers the worker inside a 'load' listener no unit test runs: the
        // calls themselves are what can go missing unnoticed.
        const common = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'common.js'), 'utf8');
        expect(common).toMatch(/import \{ applyUpdates \} from '\.\/core\/sw-update\.js';/);
        expect(common).toMatch(/register\('\/sw\.js'\)[\s\S]{0,600}const tellWaiting = applyUpdates\(registration,/);
        expect(common).toMatch(/registration\.update\(\);\s*tellWaiting\(\);/);
    });
});

describe('SKIP_WAITING', () => {
    it('is the message sw.js answers with skipWaiting()', () => {
        // The two files cannot share a constant: sw.js is built apart, and imports nothing.
        const sw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sw.js'), 'utf8');
        expect(sw).toMatch(new RegExp(`event\\.data\\.type === '${SKIP_WAITING.type}'[\\s\\S]{0,80}self\\.skipWaiting\\(\\)`));
    });
});
