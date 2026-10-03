/**
 * Unit tests for ag-terminal — what the terminal says when the core closes it.
 *
 * The core closes an open terminal with 4001 once the session that opened it has
 * ended. After an admin changed their own password — their session goes on with a
 * new token — the terminal said "Authentication required." (review, 2026-09-28).
 *
 * Covers:
 * 1. 4001 on an open terminal says its session ended, and to reconnect
 * 2. 4001 at the door still asks for a session; 4003 still refuses a non-admin
 * 3. an ordinary close says nothing
 * 4. xterm.js and its fit addon come from the npm packages, loaded once
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({ LitElement: class {}, html: () => '', nothing: '' }));
vi.mock('../../ag-icons.js', () => ({ iconTerminal: '' }));
vi.mock('../../auth.js', () => ({ getAuthToken: () => null }));
vi.mock('../../common.js', () => ({ monoFontFamily: () => 'monospace' }));

globalThis.customElements ??= { define: () => {} };

const { closeMessage, AgTerminal } = await import('./ag-terminal.js');

describe('what the terminal says when the core closes it', () => {
    it('an open terminal whose session ended', () => {
        expect(closeMessage(4001, true)).toMatch(/session that opened this terminal has ended.*Reconnect/);
    });

    it.each([
        [4001, false, 'Authentication required.'],
        [4003, false, 'Access denied — admin only.'],
        [4003, true, 'Access denied — admin only.'],
        [1000, true, ''],
    ])('code %s, open %s', (code, wasOpen, message) => {
        expect(closeMessage(code, wasOpen)).toBe(message);
    });
});

describe('where the terminal library comes from', () => {
    // It was injected from jsDelivr with no integrity hash, in front of a shell on the
    // box, and a device without internet had no terminal at all. It is imported now, on
    // the first connection: the classes must be the packages' own.
    it('loads xterm.js and the fit addon from the npm packages', async () => {
        const { Terminal, FitAddon } = await new AgTerminal()._loadXterm();
        expect(Terminal).toBe((await import('@xterm/xterm')).Terminal);
        expect(FitAddon).toBe((await import('@xterm/addon-fit')).FitAddon);
    });

    it('gives every terminal the same classes', async () => {
        const first = await new AgTerminal()._loadXterm();
        const second = await new AgTerminal()._loadXterm();
        expect(second.Terminal).toBe(first.Terminal);
        expect(second.FitAddon).toBe(first.FitAddon);
    });
});

describe('a library that could not be loaded', () => {
    it('sends the user to a reload, and opens no connection', async () => {
        // RETRY asks nothing of the box: the browser keeps a failed import for the life
        // of the page (Chromium 145, measured 2026-10-03).
        const sockets = vi.fn();
        vi.stubGlobal('WebSocket', sockets);
        try {
            const el = new AgTerminal();
            el._loadXterm = vi.fn(async () => { throw new TypeError('Failed to fetch dynamically imported module'); });
            await el._connect();
            expect(el._status).toBe('error');
            expect(el._errorMsg).toMatch(/Reload the page/);
            expect(el._errorMsg).not.toMatch(/Retry/);
            expect(sockets).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('a terminal left while its library loads', () => {
    // disconnectedCallback runs _destroy() with no socket yet; the load then resolves.
    // Opening the socket at that point started a shell on the box that nothing ended.
    function terminal({ connected }) {
        const el = new AgTerminal();
        Object.defineProperty(el, 'isConnected', { value: connected });
        el._loadXterm = vi.fn(async () => ({}));
        return el;
    }

    it('opens no connection once the panel is gone', async () => {
        const sockets = vi.fn();
        vi.stubGlobal('WebSocket', sockets);
        try {
            const el = terminal({ connected: false });
            await el._connect();
            expect(sockets).not.toHaveBeenCalled();
            expect(el._status).toBe('idle');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('still connects while the panel is there', async () => {
        const sockets = vi.fn(function () { this.close = vi.fn(); });
        vi.stubGlobal('WebSocket', sockets);
        try {
            const el = terminal({ connected: true });
            await el._connect();
            expect(sockets).toHaveBeenCalledOnce();
            expect(sockets.mock.calls[0][0]).toMatch(/\/sysinfo\/terminal\/ws$/);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('the events of a socket the terminal has moved on from', () => {
    // The close event arrives after the fact: after DISCONNECT it turned the idle panel
    // into "Disconnected", and after a quick reconnection it closed the new session's
    // status and wrote "[connection closed]" into its terminal.
    function connectedTerminal() {
        const sockets = [];
        vi.stubGlobal('WebSocket', vi.fn(function () { this.close = vi.fn(); sockets.push(this); }));
        const el = new AgTerminal();
        Object.defineProperty(el, 'isConnected', { value: true });
        el._loadXterm = vi.fn(async () => ({}));
        el._mountTerminal = vi.fn();
        return { el, sockets };
    }

    it('leaves the panel idle once disconnected', async () => {
        const { el, sockets } = connectedTerminal();
        try {
            await el._connect();
            sockets[0].onopen();
            el._handleDisconnect();

            sockets[0].onclose({ code: 1000 });
            sockets[0].onerror();

            expect(el._status).toBe('idle');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('leaves a new session alone', async () => {
        const { el, sockets } = connectedTerminal();
        try {
            await el._connect();
            el._handleDisconnect();
            await el._connect();
            sockets[1].onopen();
            el._term = { writeln: vi.fn() };

            sockets[0].onclose({ code: 1000 });

            expect(el._status).toBe('connected');
            expect(el._term.writeln).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('still reports the close of the current socket', async () => {
        const { el, sockets } = connectedTerminal();
        try {
            await el._connect();
            sockets[0].onopen();

            sockets[0].onclose({ code: 4001 });

            expect(el._status).toBe('closed');
            expect(el._errorMsg).toMatch(/session that opened this terminal has ended/);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('reconnecting after a closed session', () => {
    it('releases the terminal still on screen before opening a new one', async () => {
        // RECONNECT comes from a closed session whose terminal is still there: a second
        // one used to open below it, the first one's observer still fitting it.
        vi.stubGlobal('WebSocket', vi.fn(function () { this.close = vi.fn(); }));
        try {
            const el = new AgTerminal();
            Object.defineProperty(el, 'isConnected', { value: true });
            el._loadXterm = vi.fn(async () => ({}));
            const old = { dispose: vi.fn() };
            const observer = { disconnect: vi.fn() };
            Object.assign(el, { _status: 'closed', _term: old, _resizeObserver: observer });

            await el._connect();

            expect(old.dispose).toHaveBeenCalledOnce();
            expect(observer.disconnect).toHaveBeenCalledOnce();
            expect(el._term).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
