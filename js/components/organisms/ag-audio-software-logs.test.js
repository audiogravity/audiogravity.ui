/**
 * Unit tests for the package-operation log catch-up in ag-audio-software-page.js.
 *
 * Covers:
 * - a line that arrived live advances the cursor, so catch-up never duplicates it
 * - lines belonging to another package never bleed into the open modal
 * - a reconnect claims exactly the missing lines (`after_seq`)
 * - a state change claims the closing burst apt emits all at once
 * - a failed catch-up leaves the modal usable
 *
 * The regression: log lines existed only as live SSE events, so anything the
 * browser missed was lost for good and the modal stayed frozen on "Installing…"
 * while the operation had already finished.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiGet = vi.fn();

vi.mock('../../common.js', () => ({
    apiGet: (...args) => apiGet(...args),
    apiPost: vi.fn(),
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    handleError: vi.fn(),
    AppState: {},
    MemoryCache: { get: vi.fn(() => []), set: vi.fn() },
    AgTimerManager: {},
    EventEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    addToHistory: vi.fn(),
}));
vi.mock('../../auth.js', () => ({ isGuest: () => false, isAdmin: () => true }));
vi.mock('../../core/FetchController.js', () => ({ FetchController: class { fetch() {} } }));
vi.mock('../../core/app-context.js', () => ({ appContext: Symbol('app') }));
vi.mock('@lit/context', () => ({
    ContextConsumer: class { constructor() { this.value = undefined; } },
}));
vi.mock('../atoms/ag-filter-bar.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-package-card.js', () => ({}));

const { AgAudioSoftwarePage } = await import('./ag-audio-software-page.js');

/** Build a modal stand-in that records what was appended to it. */
function makeModal({ isOpen = true } = {}) {
    return {
        isOpen,
        appended: [],
        cleared: 0,
        appendLogs(entries) { this.appended.push(...entries); },
        clearLogs() { this.cleared += 1; this.appended.length = 0; },
    };
}

/** Minimal page instance with only the log plumbing set up. */
function makePage(modal) {
    const page = Object.create(AgAudioSoftwarePage.prototype);
    page._logCursor = { packageId: 'airplay', lastSeq: 0 };
    vi.spyOn(document, 'getElementById').mockReturnValue(modal);
    return page;
}

beforeEach(() => {
    apiGet.mockReset();
    vi.restoreAllMocks();
});

describe('live log events', () => {
    it('advances the cursor so a later catch-up cannot duplicate the line', () => {
        const modal = makeModal();
        const page = makePage(modal);

        page._handlePackageLogUpdate({
            detail: { package_id: 'airplay', entry: { seq: 4, message: 'Unpacking...' } },
        });

        expect(modal.appended).toHaveLength(1);
        expect(page._logCursor.lastSeq).toBe(4);
    });

    it('ignores lines from a package the modal is not showing', () => {
        const modal = makeModal();
        const page = makePage(modal);

        page._handlePackageLogUpdate({
            detail: { package_id: 'mpd', entry: { seq: 9, message: 'other package' } },
        });

        expect(modal.appended).toHaveLength(0);
        expect(page._logCursor.lastSeq).toBe(0);
    });
});

describe('opening the modal', () => {
    it('does not fetch the log before the operation has started', () => {
        const modal = makeModal();
        const page = makePage(modal);
        page._logCursor = { packageId: null, lastSeq: 0 };

        page._openLogsModal({ id: 'airplay', label: 'Shairport Sync' }, 'install');

        // The modal opens *before* the action is POSTed, so the server buffer still
        // holds the previous operation on this package — fetching here would render
        // that old log as if it belonged to the operation just started.
        expect(apiGet).not.toHaveBeenCalled();
        expect(page._logCursor).toEqual({ packageId: 'airplay', lastSeq: 0 });
    });
});

describe('catch-up after missed events', () => {
    it('asks only for what is missing and appends it in order', async () => {
        const modal = makeModal();
        const page = makePage(modal);
        page._logCursor.lastSeq = 3;
        apiGet.mockResolvedValue({
            entries: [
                { seq: 4, message: 'Setting up shairport-sync' },
                { seq: 5, message: 'Processing triggers' },
            ],
            last_seq: 5,
        });

        await page._syncLogsFromServer();

        expect(apiGet).toHaveBeenCalledWith('/packages/airplay/logs?after_seq=3');
        expect(modal.appended.map(e => e.seq)).toEqual([4, 5]);
        expect(page._logCursor.lastSeq).toBe(5);
    });

    it('recovers the closing burst when the stream comes back', async () => {
        const modal = makeModal();
        const page = makePage(modal);
        apiGet.mockResolvedValue({
            entries: Array.from({ length: 16 }, (_, i) => ({ seq: i + 1, message: `line ${i}` })),
            last_seq: 16,
        });

        page._handleConnectionStatus({ connected: true });
        await vi.waitFor(() => expect(modal.appended).toHaveLength(16));

        expect(page._logCursor.lastSeq).toBe(16);
    });

    it('does nothing while the stream is still down', () => {
        const page = makePage(makeModal());
        page._handleConnectionStatus({ connected: false });
        expect(apiGet).not.toHaveBeenCalled();
    });

    it('skips the request when no operation is being watched', async () => {
        const page = makePage(makeModal());
        page._logCursor = { packageId: null, lastSeq: 0 };

        await page._syncLogsFromServer();

        expect(apiGet).not.toHaveBeenCalled();
    });

    it('skips the request when the modal is closed', async () => {
        const page = makePage(makeModal({ isOpen: false }));

        await page._syncLogsFromServer();

        expect(apiGet).not.toHaveBeenCalled();
    });

    it('leaves the modal usable when the catch-up request fails', async () => {
        const modal = makeModal();
        const page = makePage(modal);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        apiGet.mockRejectedValue(new Error('network down'));

        await expect(page._syncLogsFromServer()).resolves.toBeUndefined();
        expect(page._logCursor.lastSeq).toBe(0);
    });

    it('does not duplicate lines when two catch-ups overlap', async () => {
        const modal = makeModal();
        const page = makePage(modal);
        apiGet.mockResolvedValue({
            entries: [{ seq: 1, message: 'a' }, { seq: 2, message: 'b' }],
            last_seq: 2,
        });

        // A reconnect and a state change firing together: both leave with after_seq=0.
        await Promise.all([page._syncLogsFromServer(), page._syncLogsFromServer()]);

        expect(modal.appended.map(e => e.seq)).toEqual([1, 2]);
        expect(page._logCursor.lastSeq).toBe(2);
    });

    it('never moves the cursor backwards when a live line overtook the fetch', async () => {
        const modal = makeModal();
        const page = makePage(modal);
        apiGet.mockImplementation(async () => {
            // A live event lands while the request is in flight.
            page._handlePackageLogUpdate({
                detail: { package_id: 'airplay', entry: { seq: 3, message: 'live' } },
            });
            return { entries: [{ seq: 1, message: 'a' }, { seq: 2, message: 'b' }], last_seq: 3 };
        });

        await page._syncLogsFromServer();

        // The stale response is dropped and the cursor stays where the live line put it.
        expect(page._logCursor.lastSeq).toBe(3);
        expect(modal.appended.map(e => e.seq)).toEqual([3]);
    });

    it('leaves the cursor alone when the server has nothing new', async () => {
        const modal = makeModal();
        const page = makePage(modal);
        page._logCursor.lastSeq = 7;
        apiGet.mockResolvedValue({ entries: [], last_seq: 7 });

        await page._syncLogsFromServer();

        expect(modal.appended).toHaveLength(0);
        expect(page._logCursor.lastSeq).toBe(7);
    });
});
