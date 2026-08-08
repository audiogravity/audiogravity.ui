/**
 * @module AgTerminal
 * @description Molecule component providing an interactive PTY terminal via WebSocket.
 * Renders an xterm.js terminal connected to a bash shell on the server.
 * Restricted to admin users — the backend enforces this independently via JWT.
 *
 * @element ag-terminal
 *
 * @dependency xterm.js — loaded dynamically from CDN
 * @dependency /sysinfo/terminal/ws — WebSocket PTY endpoint (admin-only)
 */

import { LitElement, html, nothing } from 'lit';
import { iconTerminal } from '../../ag-icons.js';
import { getAuthToken } from '../../auth.js';
import { monoFontFamily } from '../../common.js';

const XTERM_CDN    = 'https://cdn.jsdelivr.net/npm/xterm@4.19.0';
const XTERM_FIT_CDN = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.5.0/lib/xterm-addon-fit.js';

/** Cell size for the terminal. Shared so the face is preloaded at the size it is drawn. */
const TERMINAL_FONT_SIZE = 13;

/** Frames held while the terminal is being built. Generous for a banner, finite. */
const PENDING_FRAME_CAP = 500;

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

    /** Load xterm.js + FitAddon from CDN (cached after first call). */
    async _loadXterm() {
        if (window._xtermLoaded) return;

        await Promise.all([
            _injectStyle(`${XTERM_CDN}/css/xterm.css`),
            _injectScript(`${XTERM_CDN}/lib/xterm.js`),
        ]);
        await _injectScript(XTERM_FIT_CDN);
        window._xtermLoaded = true;
    }

    async _connect() {
        this._status = 'connecting';
        this._errorMsg = '';

        try {
            await this._loadXterm();
        } catch (e) {
            this._status = 'error';
            this._errorMsg = 'Failed to load terminal library.';
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
        this._pending = [];
        ws.onmessage = (e) => {
            // Bounded: what matters here is the banner and the first prompt, which
            // come first, so the cap drops the newest rather than the oldest. A
            // shell that talks for a whole font fetch must not grow this without
            // limit — the box is an audio machine before it is a web server.
            if (this._pending.length < PENDING_FRAME_CAP) this._pending.push(e.data);
        };

        ws.onopen = () => {
            this._status = 'connected';
            this._mountTerminal(ws);
        };

        ws.onclose = (e) => {
            this._status = e.code === 4003 ? 'error' : 'closed';
            if (e.code === 4003) this._errorMsg = 'Access denied — admin only.';
            if (e.code === 4001) this._errorMsg = 'Authentication required.';
            if (this._term) { this._term.writeln('\r\n\x1b[31m[connection closed]\x1b[0m'); }
        };

        ws.onerror = () => {
            this._status = 'error';
            this._errorMsg = 'WebSocket connection failed.';
        };
    }

    _mountTerminal(ws) {
        this.updateComplete.then(async () => {
            /** Give up on this socket and stop collecting for it. */
            const abandon = () => {
                ws.onmessage = null;
                this._pending = [];
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

            const term = new window.Terminal({
                cursorBlink: true,
                // xterm.js draws to a canvas and cannot read a CSS custom
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

            const fitAddon = new window.FitAddon.FitAddon();
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
            for (const raw of this._pending) write(raw);
            this._pending = [];

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

/** Inject a CSS link tag if not already present. */
function _injectStyle(href) {
    if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });
}

/** Inject a script tag if not already present. */
function _injectScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}
