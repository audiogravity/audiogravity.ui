/**
 * Unit tests for ag-roon-status.js — what the box tells the owner about Roon.
 *
 * The last step of connecting to Roon happens inside Roon, where the box cannot
 * see the owner act. Before this component the card said "No zones available"
 * and stopped there; the one person who got through it read the box's journal
 * over SSH. So the rules worth pinning are: every state the box can report is
 * named, the waiting one says exactly where to click and under which name, and
 * a state this build does not recognise says nothing rather than guessing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    // The real base class provides these; the component chains up to them.
    LitElement: class { connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));

const getRoonStatus = vi.fn();
vi.mock('../../library-store.js', () => ({ getRoonStatus: (...a) => getRoonStatus(...a) }));

import { AgRoonStatus } from './ag-roon-status.js';

/** Flatten the nested template objects the lit mock produces into plain text. */
function text(node) {
    if (node === null || node === undefined || node === false) return '';
    if (Array.isArray(node)) return node.map(text).join('');
    if (typeof node === 'object' && node.strings) {
        // Interleave strings and values, in order: appending the values again
        // afterwards would duplicate them and split "2 zones" apart.
        return node.strings
            .map((s, i) => s + (i < node.values.length ? text(node.values[i]) : ''))
            .join('');
    }
    return String(node);
}

function makeEl(status, { loading = false, connected = true } = {}) {
    const el = Object.create(AgRoonStatus.prototype);
    el._status = status;
    el._loading = loading;
    el._rechecksLeft = AgRoonStatus.MAX_RECHECKS;
    el.isConnected = connected;   // as the DOM reports it for a mounted element
    el.dispatchEvent = vi.fn();
    return el;
}

beforeEach(() => getRoonStatus.mockReset());

describe('what each state says', () => {
    it('names the missing endpoint and where to install it', () => {
        const out = text(makeEl({ state: 'no_endpoint', zones: 0, extension_name: 'Audiogravity' }).render());
        expect(out).toContain('Roon Bridge is not running');
        expect(out).toContain('Audio Software');
    });

    it('tells the owner to check their Core when nothing answers', () => {
        const out = text(makeEl({ state: 'core_not_found', zones: 0, extension_name: 'Audiogravity' }).render());
        expect(out).toContain('No Roon Core is answering');
        expect(out).toContain('running on your network');
    });

    it('says where to click, and under which name, while waiting', () => {
        const out = text(makeEl({ state: 'waiting_authorization', zones: 0, extension_name: 'Audiogravity' }).render());
        expect(out).toContain('Settings → Extensions');
        expect(out).toContain('Audiogravity');
    });

    it('carries the name the box reports, not one written into the interface', () => {
        const out = text(makeEl({ state: 'waiting_authorization', zones: 0, extension_name: 'Aty' }).render());
        expect(out).toContain('Aty');
    });

    it('counts the zones once connected, in the singular when there is one', () => {
        expect(text(makeEl({ state: 'connected', zones: 2, extension_name: 'X' }).render())).toContain('2 zones');
        expect(text(makeEl({ state: 'connected', zones: 1, extension_name: 'X' }).render())).toContain('1 zone');
    });
});

describe('what it refuses to say', () => {
    it('never leaves the panel blank on a state it does know', () => {
        // 'unknown' is not only "nothing attempted yet" — the box also lands there
        // after a failure it could not name. Rendering nothing was strictly worse
        // than the "No zones available" this component replaced.
        const out = text(makeEl({ state: 'unknown', zones: 0, extension_name: 'X' }).render());
        expect(out).toContain('Roon is not connected');
        expect(out).toContain('Check again');
    });

    it('says nothing about a state it does not recognise', () => {
        expect(makeEl({ state: 'something_newer', zones: 0, extension_name: 'X' }).render()).toBe(null);
    });

    it('says nothing when the box could not be reached at all', () => {
        expect(makeEl(null).render()).toBe(null);
    });

    it('shows a checking line only while the first answer is pending', () => {
        expect(text(makeEl(null, { loading: true }).render())).toContain('Checking Roon');
    });
});

describe('refresh', () => {
    it('keeps the last known state when a request fails', async () => {
        // The router turns any backend hiccup into a 500; one of those used to
        // blank the panel until the card was collapsed and reopened.
        getRoonStatus.mockRejectedValueOnce(new Error('network down'));
        const el = makeEl({ state: 'connected', zones: 1, extension_name: 'X' });
        await el.refresh();
        expect(el._status.state).toBe('connected');
        expect(el._loading).toBe(false);
    });

    it('tells the card when a session comes up, so it can load the zones', async () => {
        // The card asked for zones before Roon had authorized anything, and holds
        // that empty answer for a minute.
        getRoonStatus.mockResolvedValueOnce({ state: 'connected', zones: 2, extension_name: 'X' });
        const el = makeEl(null);
        await el.refresh();
        expect(el.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(el.dispatchEvent.mock.calls[0][0].type).toBe('roon-connected');
    });

    it('bypasses the cache when the owner says they have just enabled it', async () => {
        getRoonStatus.mockResolvedValueOnce({ state: 'connected', zones: 1, extension_name: 'X' });
        const el = makeEl(null);
        await el.refresh({ force: true });
        expect(getRoonStatus).toHaveBeenCalledWith({ force: true });
        expect(el._status.state).toBe('connected');
    });
});

describe('while the box is still trying', () => {
    it('shows the checking state the box reports', () => {
        const out = text(makeEl({ state: 'checking', zones: 0, extension_name: 'X' }).render());
        expect(out).toContain('Checking Roon');
    });

    it('looks again by itself, once, rather than staying on "Checking" for good', async () => {
        vi.useFakeTimers();
        getRoonStatus
            .mockResolvedValueOnce({ state: 'checking', zones: 0, extension_name: 'X' })
            .mockResolvedValueOnce({ state: 'connected', zones: 1, extension_name: 'X' });

        const el = makeEl(null);
        await el.refresh();
        expect(el._status.state).toBe('checking');

        await vi.advanceTimersByTimeAsync(AgRoonStatus.RECHECK_MS);
        expect(el._status.state).toBe('connected');
        expect(getRoonStatus).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('gives up looking on its own rather than polling the box for ever', async () => {
        // 'checking' lasts as long as the box has no client built, which a failed
        // build makes permanent — an unbounded 3 s poll would follow.
        vi.useFakeTimers();
        getRoonStatus.mockResolvedValue({ state: 'checking', zones: 0, extension_name: 'X' });

        const el = makeEl(null);
        await el.refresh();
        for (let i = 0; i < AgRoonStatus.MAX_RECHECKS + 3; i++) {
            await vi.advanceTimersByTimeAsync(AgRoonStatus.RECHECK_MS);
        }

        expect(getRoonStatus).toHaveBeenCalledTimes(AgRoonStatus.MAX_RECHECKS + 1);
        vi.useRealTimers();
    });

    it('starts looking again when the owner asks', async () => {
        vi.useFakeTimers();
        getRoonStatus.mockResolvedValue({ state: 'checking', zones: 0, extension_name: 'X' });

        const el = makeEl(null);
        el._rechecksLeft = 0;
        await el.refresh({ force: true, manual: true });
        await vi.advanceTimersByTimeAsync(AgRoonStatus.RECHECK_MS);

        expect(getRoonStatus).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('arms nothing once the card has been collapsed mid-request', async () => {
        vi.useFakeTimers();
        getRoonStatus.mockResolvedValue({ state: 'checking', zones: 0, extension_name: 'X' });

        const el = makeEl(null, { connected: false });
        await el.refresh();
        await vi.advanceTimersByTimeAsync(AgRoonStatus.RECHECK_MS * 3);

        expect(getRoonStatus).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('stops looking when the card goes away', async () => {
        vi.useFakeTimers();
        getRoonStatus.mockResolvedValue({ state: 'checking', zones: 0, extension_name: 'X' });

        const el = makeEl(null);
        await el.refresh();
        expect(getRoonStatus).toHaveBeenCalledTimes(1);

        el.disconnectedCallback();  // the card is removed from the page

        await vi.advanceTimersByTimeAsync(AgRoonStatus.RECHECK_MS * 3);
        expect(getRoonStatus).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
