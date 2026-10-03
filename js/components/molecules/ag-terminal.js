/**
 * @module AgTerminal
 * @description Molecule component providing an interactive PTY terminal via WebSocket.
 * Renders an xterm.js terminal connected to a bash shell on the server.
 * Restricted to admin users — the backend enforces this independently via JWT.
 *
 * @element ag-terminal
 *
 * @dependency @xterm/xterm, @xterm/addon-fit — npm dependencies, loaded on first connection
 * @dependency /sysinfo/terminal/ws — WebSocket PTY endpoint (admin-only)
 */

import { LitElement, html, nothing } from 'lit';
import { iconTerminal } from '../../ag-icons.js';
import { getAuthToken } from '../../auth.js';
import { monoFontFamily } from '../../common.js';

/** xterm.js's two classes, {Terminal, FitAddon}, once _loadXterm() has loaded them. */
let xtermClasses = null;

/** Cell size for the terminal. Shared so the face is preloaded at the size it is drawn. */
const TERMINAL_FONT_SIZE = 13;

/** Frames held while the terminal is being built. Generous for a banner, finite. */
const PENDING_FRAME_CAP = 500;

/**
 * What to say when the core closes the terminal.
 *
 * 4001 means two things: no session to open it with, or — on a terminal already open —
 * the session that opened it has ended, which the core checks every 15 s. After an
 * admin changed their own password, it was the second, and "Authentication required."
 * sent them looking for a sign-in they did not need: their session goes on, and a
 * reconnection opens a new shell with it.
 *
 * @param {number} code - The WebSocket close code.
 * @param {boolean} wasOpen - Whether the terminal had opened.
 * @returns {string} The message, or '' for a close that needs none.
 */
export function closeMessage(code, wasOpen) {
    if (code === 4003) return 'Access denied — admin only.';
    if (code !== 4001) return '';
    return wasOpen
        ? 'The session that opened this terminal has ended. Reconnect to open a new one.'
        : 'Authentication required.';
}

export class AgTerminal extends LitElement {
    static properties = {
        _status: { type: String, state: true }, // 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
        _errorMsg: { type: String, state: true },
    };

    constructor() {
        super();
        this._status = 'idle';
        this._errorMsg = '';
        this._ws = null;
        this._term = null;
        this._fitAddon = null;
        this._resizeObserver = null;
    }

    createRenderRoot() {
        return this;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._destroy();
    }

    _destroy() {
        if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
        if (this._ws) { this._ws.close(); this._ws = null; }
        if (this._term) { this._term.dispose(); this._term = null; }
    }

    /**
     * Load xterm.js, its stylesheet and the fit addon (once; later calls return at once).
     *
     * Imported on demand, from the box: this component is part of the main bundle, and a
     * static import would put about 90 KB compressed on every start for a panel few open.
     * They used to be injected from jsDelivr, without an integrity hash, in front of a
     * shell on the box — and a device with no internet had no terminal at all.
     *
     * @returns {Promise<{Terminal: Function, FitAddon: Function}>} The two classes.
     */
    async _loadXterm() {
        if (!xtermClasses) {
            const [xterm, fit] = await Promise.all([
                import('@xterm/xterm'),
                import('@xterm/addon-fit'),
                import('@xterm/xterm/css/xterm.css'),
            ]);
            xtermClasses = { Terminal: xterm.Terminal, FitAddon: fit.FitAddon };
        }
        return xtermClasses;
    }

    async _connect() {
        // RECONNECT and RETRY come here from a closed session whose terminal is still on
        // screen: without this, a second one opened below it, and the first one's
        // ResizeObserver kept fitting a terminal nobody held.
        this._destroy();
        this._status = 'connecting';
        this._errorMsg = '';

        let xterm;
        try {
            xterm = await this._loadXterm();
        } catch (e) {
            this._status = 'error';
            // Not RETRY: the browser keeps a failed import for the life of the page, and asks
            // nothing more of the box (Chromium 145, measured 2026-10-03). Only a reload does.
            this._errorMsg = 'The terminal could not be loaded. Reload the page to try again.';
            return;
        }

        // The panel may have been left while the library loaded: _destroy() then ran with
        // no socket to close, and one opened now would start a shell on the box that
        // nothing ends until the page itself goes.
        if (!this.isConnected) {
            this._status = 'idle';
            return;
        }

        // Build WebSocket URL — resolve against current origin so Vite proxy works
        const token = getAuthToken();
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsBase = `${wsProto}//${window.location.host}`;
        const wsUrl = `${wsBase}/sysinfo/terminal/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        this._ws = ws;

        // The PTY writes its banner and first prompt the moment it opens, and a
        // WebSocket frame that arrives with no handler attached is dropped, not
        // queued. Building the terminal is asynchronous — it waits for the render
        // to settle and for the monospace face to load, which on a first visit is
        // a network round trip — so frames are collected from the instant the
        // socket exists and replayed once xterm can accept them. Without this the
        // banner is lost and the viewport stays blank until the user types.
        //
        // The buffer belongs to this connection and lives in this closure, not on
        // the component. Held as a field, a disconnect during that window cleared
        // whatever the *next* socket had already collected — losing the banner of
        // the reconnection, which is the one thing this exists to keep.
        const pending = [];
        ws.onmessage = (e) => {
            // Bounded: what matters here is the banner and the first prompt, which
            // come first, so the cap drops the newest rather than the oldest. A
            // shell that talks for a whole font fetch must not grow this without
            // limit — the box is an audio machine before it is a web server.
            if (pending.length < PENDING_FRAME_CAP) pending.push(e.data);
        };

        // The events of a socket this component has moved on from — closed by _destroy()
        // on DISCONNECT, or replaced by a reconnection — must not touch the current state:
        // the close event arrives after the fact, and turned an idle panel into
        // "Disconnected", or wrote "[connection closed]" into the new session.
        ws.onopen = () => {
            if (this._ws !== ws) return;
            this._status = 'connected';
            this._mountTerminal(ws, pending, xterm);
        };

        ws.onclose = (e) => {
            if (this._ws !== ws) return;
            const wasOpen = this._status === 'connected';
            this._status = e.code === 4003 ? 'error' : 'closed';
            this._errorMsg = closeMessage(e.code, wasOpen) || this._errorMsg;
            if (this._term) { this._term.writeln('\r\n\x1b[31m[connection closed]\x1b[0m'); }
        };

        ws.onerror = () => {
            if (this._ws !== ws) return;
            this._status = 'error';
            this._errorMsg = 'WebSocket connection failed.';
        };
    }

    /**
     * Build the terminal once the panel has rendered, and hand the socket over to it.
     *
     * @param {WebSocket} ws - The socket this terminal is for.
     * @param {Array<ArrayBuffer|string>} pending - Frames received before it existed.
     * @param {{Terminal: Function, FitAddon: Function}} xterm - From _loadXterm().
     */
    _mountTerminal(ws, pending, { Terminal, FitAddon }) {
        this.updateComplete.then(async () => {
            /** Give up on this socket and release what it collected. */
            const abandon = () => {
                ws.onmessage = null;
                pending.length = 0;
            };

            const container = this.querySelector('.ag-terminal-viewport');
            if (!container) { abandon(); return; }

            const fontFamily = monoFontFamily();

            // xterm measures one character cell when open() is called, and never
            // measures again unless the container resizes. The monospace family
            // is a webfont declared font-display: swap, so if it has not arrived
            // by then xterm sizes its whole grid against the fallback and stays
            // misaligned for the life of the session — a problem the locally
            // installed Courier New could not have. Waiting for the face costs
            // nothing once it is cached, and a failure here must not stop the
            // terminal from opening.
            try {
                await document.fonts.load(`${TERMINAL_FONT_SIZE}px ${fontFamily}`);
            } catch {
                /* unparsable or unavailable face — xterm falls back on its own */
            }

            // Everything above is asynchronous, and the font wait is a network
            // round trip on a cold cache. The panel can be left, or reconnected,
            // inside that window: _destroy() would have run with _term still
            // null, and the continuation would then build a terminal and a
            // ResizeObserver nobody holds a reference to — invisible, undisposed,
            // and stacking one more on every reconnection. _ws is the marker:
            // _destroy() clears it, a new connection replaces it.
            if (this._ws !== ws) { abandon(); return; }

            const term = new Terminal({
                cursorBlink: true,
                // xterm.js takes its options as values and cannot read a CSS custom
                // property, so the value is resolved here rather than declared.
                fontFamily,
                fontSize: TERMINAL_FONT_SIZE,
                theme: {
                    background: '#0d1117',
                    foreground: '#e6edf3',
                    cursor: '#f78166',
                    selectionBackground: '#264f78',
                    black: '#484f58', red: '#ff7b72', green: '#3fb950',
                    yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
                    cyan: '#39c5cf', white: '#b1bac4',
                    brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
                    brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
                    brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
                },
                scrollback: 2000,
                allowProposedApi: true,
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(container);
            fitAddon.fit();

            this._term = term;
            this._fitAddon = fitAddon;

            /**
             * Write one PTY frame, whatever form it arrived in.
             * @param {ArrayBuffer|string} raw
             */
            const write = (raw) => term.write(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw);

            // Everything the shell said while the terminal was being built, in
            // order, before the socket is handed over.
            for (const raw of pending) write(raw);
            pending.length = 0;

            // PTY output → xterm
            ws.onmessage = (e) => write(e.data);

            // xterm input → PTY
            term.onData((data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(new TextEncoder().encode(data));
                }
            });

            // Resize
            term.onResize(({ cols, rows }) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
                }
            });

            this._resizeObserver = new ResizeObserver(() => {
                try { fitAddon.fit(); } catch (_) {}
            });
            this._resizeObserver.observe(container);
        });
    }

    _handleDisconnect() {
        this._destroy();
        this._status = 'idle';
    }

    render() {
        return html`
            <div class="ag-terminal-shell">
                <div class="ag-terminal-toolbar">
                    <span class="ag-terminal-title">
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTerminal}</svg> TERMINAL
                    </span>
                    ${this._status === 'idle' ? html`
                        <button class="tile-action-btn" @click=${this._connect}>CONNECT</button>
                    ` : nothing}
                    ${this._status === 'connecting' ? html`
                        <span class="ag-terminal-status connecting">Connecting…</span>
                    ` : nothing}
                    ${this._status === 'connected' ? html`
                        <span class="ag-terminal-status connected">● Connected</span>
                        <button class="tile-action-btn" @click=${this._handleDisconnect}>DISCONNECT</button>
                    ` : nothing}
                    ${this._status === 'closed' ? html`
                        <span class="ag-terminal-status closed">Disconnected</span>
                        <button class="tile-action-btn" @click=${this._connect}>RECONNECT</button>
                    ` : nothing}
                    ${this._status === 'error' ? html`
                        <span class="ag-terminal-status error">${this._errorMsg || 'Error'}</span>
                        <button class="tile-action-btn" @click=${this._connect}>RETRY</button>
                    ` : nothing}
                </div>
                <div class="ag-terminal-viewport ${this._status !== 'connected' ? 'ag-terminal-viewport--hidden' : ''}"></div>
                ${this._status === 'idle' ? html`
                    <div class="ag-terminal-placeholder">
                        <svg class="ag-terminal-placeholder-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTerminal}</svg>
                        <p>Interactive shell — click CONNECT to start a session.</p>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-terminal', AgTerminal);
