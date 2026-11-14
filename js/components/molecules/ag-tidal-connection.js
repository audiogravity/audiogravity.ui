/**
 * @module AgTidalConnection
 * @description Tidal connection card molecule for the sources view.
 *
 * Mirrors `ag-qobuz-connection` but Tidal uses the PKCE flow: there is no server
 * callback to poll — the user logs in, lands on Tidal's fixed redirect page
 * (`tidal.com/android/login/auth?code=…`) and pastes that URL back here (a PWA
 * cannot intercept the cross-origin redirect). Reuses the `lib-qb-*` card CSS.
 *
 * The paste is the last thing the user does: as soon as the field holds a sign-in
 * code (see {@link tidalSignInCode}) the card completes the login itself, so there
 * is no button to press. Enter sends whatever the field holds, as a fallback.
 *
 * Where the browser lets a page read the clipboard once the user has allowed it
 * (see {@link clipboardReadAllowed}), even the paste goes: coming back to the app is
 * enough, the card reads the copied address itself — Tidal's own return address and
 * nothing else (see {@link tidalReturnCode}). Elsewhere the field stays the way in.
 *
 * While it waits, **Reopen Tidal page** starts the sign-in afresh — for a Tidal tab
 * closed or never opened, or a refused sign-in — so nothing needs a page reload.
 *
 * Self-contained: talks to the `/tidal/*` endpoints. The parent only renders
 * `<ag-tidal-connection>`.
 *
 * @element ag-tidal-connection
 *
 * @fires sources-changed - Bubbles when the Tidal connection is created or removed.
 * @dependency css/components/library-sources.css (lib-qb-*, lib-tidal-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import { hasSubscription } from '../../library-store.js';
import '../atoms/ag-status-indicator.js';

/**
 * The sign-in code a pasted value carries, or null.
 *
 * Same rule as the core's `TidalOAuthService._extract_code`, so the card completes
 * the login on its own exactly when the core would accept the value: the `code`
 * parameter of an address, or a bare code of more than 20 characters. One
 * deliberate difference: a bare code may not contain whitespace — a pasted sentence
 * is not a code, and sending it would only earn a refusal. Enter still sends
 * anything.
 *
 * @param {string} value - What the field holds.
 * @returns {string|null} The code, or null when there is none.
 */
export function tidalSignInCode(value) {
    const v = (value || '').trim();
    if (!v) return null;
    if (v.includes('://')) {
        // Like urlsplit: the fragment goes first, the query is what follows the first '?'.
        const address = v.split('#')[0];
        const q = address.indexOf('?');
        if (q < 0) return null;
        return new URLSearchParams(address.slice(q + 1)).get('code') || null;
    }
    return v.length > 20 && !/\s/.test(v) ? v : null;
}

/**
 * The code of Tidal's own return address, or null — the only value the card picks
 * up from the clipboard by itself.
 *
 * Stricter than {@link tidalSignInCode} on purpose. That rule serves a paste: a
 * gesture of the user, who means to hand a code over. The clipboard is read without
 * a gesture and may hold anything, a password included — so a bare code, or another
 * site's address that happens to carry a `code`, waits for the user to paste it.
 * The address is the core's `_REDIRECT`.
 *
 * @param {string} value - What the clipboard holds.
 * @returns {string|null} The code, or null.
 */
export function tidalReturnCode(value) {
    let url;
    try {
        url = new URL((value || '').trim());
    } catch {
        return null;   // not an address at all
    }
    if (url.origin !== 'https://tidal.com' || url.pathname !== '/android/login/auth') return null;
    return url.searchParams.get('code') || null;
}

/** Where the app keeps the fingerprint of the last code the core answered about. */
const SENT_CODE_KEY = 'tidalSentCode';

/**
 * A fingerprint of a sign-in code (FNV-1a, 32 bits): enough to recognise a code
 * already sent after a reload, without keeping the code itself. Prefixed, so that
 * MemoryCache, which reads back what parses as JSON as JSON, never turns it into a
 * number ("1e5").
 *
 * @param {string} code
 * @returns {string}
 */
function codeFingerprint(code) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < code.length; i++) {
        hash = Math.imul(hash ^ code.charCodeAt(i), 0x01000193) >>> 0;
    }
    return `fnv1a-${hash.toString(16)}`;
}

/**
 * Whether the card may read the clipboard by itself when the user comes back.
 *
 * Chromium browsers only: once the user accepts their `clipboard-read` prompt, a
 * focused page reads without a gesture. Firefox and Safari ask for a tap and a
 * "Paste" choice at every read, and do not know that permission (MDN, Clipboard API,
 * "Security considerations") — so asking about it is how they are told apart,
 * without reading the user agent. Every browser requires a secure context (https).
 *
 * @returns {Promise<boolean>} True when a read may succeed: allowed, or not asked
 *   yet. False once the user has refused — the prompt is never shown again.
 */
export async function clipboardReadAllowed() {
    if (!globalThis.isSecureContext || !navigator.clipboard?.readText || !navigator.permissions?.query) {
        return false;
    }
    try {
        const { state } = await navigator.permissions.query({ name: 'clipboard-read' });
        return state !== 'denied';
    } catch {
        return false;   // Firefox, Safari: no such permission
    }
}

/**
 * What a refused sign-in says — the core answered 400. Starting afresh is what fixes
 * it: an authorization code is single-use and short-lived (RFC 6749 §4.1.2), and a
 * restarted core has lost the pending sign-in.
 */
const LOGIN_FAILED = 'Login failed — reopen the Tidal page and try again.';

/**
 * What any other failure of the sign-in says: the box out of reach or failing. The
 * sign-in is still pending there, so the same address may work once it answers —
 * reopening Tidal would throw it away.
 */
const SUBMIT_FAILED = 'Login failed — please retry.';

export class AgTidalConnection extends LitElement {

    static properties = {
        _connection:    { state: true },
        _loading:       { state: true },
        _awaiting:      { state: true },   // Connect clicked, waiting for the pasted URL
        _redirect:      { state: true },   // pasted redirect URL
        _submitting:    { state: true },
        _error:         { state: true },
        _clipboardAuto: { state: true },   // the browser may read the copied address itself
        _blockedUrl:    { state: true },   // Tidal's page, when the browser refused to open it
        _starting:      { state: true },   // a sign-in is starting: sending waits, Reopen too
    };

    constructor() {
        super();
        this._connection    = null;
        this._loading       = true;
        this._awaiting      = false;
        this._redirect      = '';
        this._submitting    = false;
        this._error         = '';
        this._clipboardAuto = false;
        this._blockedUrl    = '';
        /** One sign-in start at a time — a double tap would leave a dead Tidal tab behind. */
        this._starting = false;
        /** One clipboard read at a time — `focus` and `visibilitychange` come together. */
        this._reading = false;
        /** The last code the core answered about: it is never sent again on its own. */
        this._sentCode = null;
        this._onReturn = this._onReturn.bind(this);
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        // Coming back from Tidal's tab: `focus` on a computer, `visibilitychange` when a
        // phone switches back to the app. Both may fire for one return; the handler
        // reads once, and only with the focus.
        window.addEventListener('focus', this._onReturn);
        document.addEventListener('visibilitychange', this._onReturn);
        this._loadConnection();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('focus', this._onReturn);
        document.removeEventListener('visibilitychange', this._onReturn);
    }

    // ── Data ───────────────────────────────────────────────────────────────

    async _loadConnection() {
        await loadConnection(this, () => apiGet('/tidal/connection'), 'tidal');
        // Connected meanwhile — from another device, say: nothing is left to wait for.
        if (this._connection?.connected) this._awaiting = false;
    }

    /** @private Waiting for Tidal's return address — and not connected some other way meanwhile. */
    get _waitingForTidal() {
        return this._awaiting && !this._connection?.connected;
    }

    /**
     * @private Whether the core has already answered about this code — in this page,
     * or before a reload, by the fingerprint MemoryCache keeps when the app runs.
     * @param {string} code
     * @returns {boolean}
     */
    _wasSent(code) {
        return code === this._sentCode
            || window.MemoryCache?.get?.(SENT_CODE_KEY) === codeFingerprint(code);
    }

    /**
     * @private Remember a code the core has answered about: accepted or refused, it
     * is spent.
     * @param {string|null} code
     */
    _rememberSent(code) {
        if (!code) return;
        this._sentCode = code;
        window.MemoryCache?.set?.(SENT_CODE_KEY, codeFingerprint(code));
    }

    /**
     * Start the PKCE flow: get the authorize URL, open it, await the pasted redirect.
     *
     * Also what **Reopen Tidal page** does: the core replaces a pending sign-in with
     * the new one, so starting afresh works after a closed tab, a refusal or a core
     * restart. One start at a time, and none while an address is being sent: the
     * core would replace the very sign-in that address completes.
     *
     * The page opens after the request, so a popup blocker may refuse it —
     * `window.open` then returns null — and the card offers it as a link instead,
     * which a tap opens.
     */
    async _connect() {
        if (this._starting || this._submitting) return;
        this._starting = true;
        this._error = '';
        try {
            const data = await apiPost('/tidal/connection');
            if (data?.authorize_url) {
                const tab = window.open(data.authorize_url, '_blank');
                this._blockedUrl = tab ? '' : data.authorize_url;
                this._redirect = '';   // an earlier paste belongs to the replaced sign-in
                this._awaiting = true;
                this._clipboardAuto = await clipboardReadAllowed();
            }
        } catch (e) {
            console.warn('[tidal] Start login failed:', e.message);
            this._error = 'Could not start login.';
        } finally {
            this._starting = false;
        }
    }

    /**
     * @private Back in the app while waiting: pick up the copied return address, so
     * there is nothing to paste.
     *
     * Reads only while the card waits for Tidal — what the user copies is none of the
     * app's business otherwise — and keeps nothing but Tidal's own return address
     * (see {@link tidalReturnCode}): anything else is dropped, without a word. A code
     * the core has answered about is not sent again: the user comes back more than
     * once, a refused code stays refused, and an old address may still sit in the
     * clipboard after a reload. A refused read leaves the field as the way in.
     */
    async _onReturn() {
        if (!this._waitingForTidal || this._submitting || this._starting || this._reading
            || !document.hasFocus()) return;
        this._reading = true;
        try {
            this._clipboardAuto = await clipboardReadAllowed();
            if (!this._clipboardAuto) return;
            const text = await navigator.clipboard.readText();
            const code = tidalReturnCode(text);
            if (!code || this._wasSent(code) || !this._waitingForTidal || this._submitting
                || this._starting) return;
            this._redirect = text.trim();
            await this._submit();
        } catch {
            // The prompt was refused, or the page lost the focus: ask again, so a
            // refusal turns the hint back to the paste.
            this._clipboardAuto = await clipboardReadAllowed();
        } finally {
            this._reading = false;
        }
    }

    /**
     * @private A paste replaces the field's content, then completes the login at once
     * when it carries a sign-in code.
     *
     * Replacing rather than inserting keeps a second paste — after a refusal — from
     * being glued to the first. Without clipboard data the browser inserts as usual
     * and {@link AgTidalConnection#_onInput} takes over.
     * @param {ClipboardEvent} e
     */
    _onPaste(e) {
        const text = e.clipboardData?.getData('text/plain');
        if (!text) return;
        e.preventDefault();
        this._redirect = text.trim();
        this._finishIfCode();
    }

    /**
     * @private Keystrokes only update the value. A chunk inserted in one go — a paste
     * the browser handled itself, a drop, a keyboard's clipboard suggestion — counts
     * as a paste. Typing never submits: a half-typed address would be refused.
     * @param {InputEvent} e
     */
    _onInput(e) {
        this._redirect = e.target.value;
        const chunk = e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop'
            || (e.data?.length ?? 0) > 20;
        if (chunk) this._finishIfCode();
    }

    /**
     * @private Enter sends whatever the field holds — the way in for anything the
     * paste detection does not recognise. The Enter that ends a composition (a
     * keyboard composing words, Japanese or Chinese, some Android keyboards) only
     * ends it.
     * @param {KeyboardEvent} e
     */
    _onKeydown(e) {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        this._submit();
    }

    /** @private Complete the login when the field carries a code; otherwise say why nothing happens. */
    _finishIfCode() {
        if (tidalSignInCode(this._redirect)) {
            this._submit();
        } else {
            this._error = 'No sign-in code in this address — copy the address of the page you land on after signing in.';
        }
    }

    /**
     * Complete the flow from the pasted redirect URL. One request at a time, and none
     * while a new sign-in is starting: the address belongs to the one being replaced.
     *
     * A code the core has answered about is remembered (see
     * {@link AgTidalConnection#_rememberSent}); one that never reached it is not, so
     * coming back to the app may send it again.
     */
    async _submit() {
        const url = this._redirect.trim();
        if (!url || this._submitting || this._starting) return;
        this._submitting = true;
        this._error = '';
        const code = tidalSignInCode(url);
        try {
            const conn = await apiPost('/tidal/connection/submit', { redirect_url: url });
            this._rememberSent(code);
            if (conn?.connected) {
                this._connection = conn;
                this._awaiting = false;
                this._redirect = '';
                this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
            } else {
                this._error = LOGIN_FAILED;
            }
        } catch (e) {
            console.warn('[tidal] Submit failed:', e.message);
            if (e?.status === 400) {
                this._rememberSent(code);
                this._error = LOGIN_FAILED;
            } else {
                this._error = SUBMIT_FAILED;
            }
        }
        this._submitting = false;
    }

    /** @private The link opened Tidal's page: the card stops saying the browser did not. */
    _onOpenedByLink() {
        this._blockedUrl = '';
    }

    async _disconnect() {
        try {
            await apiDelete('/tidal/connection');
        } catch (e) {
            console.warn('[tidal] Disconnect failed:', e.message);
        }
        this._connection = null;
        this._awaiting = false;
        this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
        await this._loadConnection();
    }

    /** Refresh connection state (called by parent via querySelector). */
    async _refresh() {
        await this._loadConnection();
    }

    // ── Render ─────────────────────────────────────────────────────────────

    render() {
        if (this._loading) {
            return html`<div class="lib-qb-card"><div class="lib-qb-card-hd">Loading…</div></div>`;
        }
        return this._connection?.connected ? this._renderConnected() : this._renderDisconnected();
    }

    /**
     * @private The line under the name, connected: what Tidal will actually play.
     *
     * `quality` is what AG **asks** for, and Tidal keeps accepting the request
     * after a plan ends — it just serves 30-second excerpts instead of tracks.
     * Printing the asked-for tier then states the opposite of what is heard, so
     * a lapsed account replaces the line rather than decorating it. The
     * subscribed/unknown rule itself lives in {@link hasSubscription}; only the
     * wording is Tidal's, because Tidal has no vault to fall back on.
     * @returns {string}
     */
    get _connectedDesc() {
        const c = this._connection;
        const country = c.country_code ? ` · ${c.country_code}` : '';
        if (!hasSubscription(c)) return `No subscription · 30-second previews${country}`;
        const tier = c.quality === 'HI_RES_LOSSLESS' ? 'Hi-Res' : 'Lossless';
        return `${tier}${country}`;
    }

    /** @private */
    _renderConnected() {
        const desc = this._connectedDesc;
        return html`
            <div class="lib-qb-card connected">
                <div class="lib-qb-card-hd">
                    <div class="lib-qb-ic"><span class="lib-src-logo-tidal" role="img" aria-label="Tidal"></span></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Tidal</div>
                        <div class="lib-qb-desc">${desc}</div>
                    </div>
                    <ag-status-indicator state="up" label="Connected"></ag-status-indicator>
                </div>
                <div class="lib-qb-actions">
                    <button class="action-btn compact secondary" @click=${this._disconnect}>
                        Disconnect
                    </button>
                </div>
            </div>
        `;
    }

    /** @private */
    _renderDisconnected() {
        return html`
            <div class="lib-qb-card">
                <div class="lib-qb-card-hd">
                    <div class="lib-qb-ic"><span class="lib-src-logo-tidal" role="img" aria-label="Tidal"></span></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Tidal</div>
                        <div class="lib-qb-desc">Hi-Res streaming</div>
                    </div>
                </div>
                ${this._awaiting ? this._renderWaiting() : html`
                    <div class="lib-qb-actions">
                        <button class="action-btn compact" @click=${this._connect}>Connect</button>
                    </div>
                    ${this._error
                        ? html`<div class="lib-tidal-paste"><span class="lib-tidal-err">${this._error}</span></div>`
                        : nothing}
                `}
            </div>
        `;
    }

    /**
     * @private The step after Connect: Tidal's page is open elsewhere and the card
     * waits for the address Tidal leaves the user on. The hint says what is left to
     * do — come back, or paste — and the way to start afresh stays at hand.
     */
    _renderWaiting() {
        const opened = !this._blockedUrl;
        return html`
            <div class="lib-tidal-paste">
                ${opened ? nothing : html`
                    <span class="lib-tidal-hint">
                        Your browser did not open the Tidal page —
                        <a href=${this._blockedUrl} target="_blank" rel="noopener"
                            @click=${this._onOpenedByLink}>open it here</a>.
                    </span>
                `}
                <span class="lib-tidal-hint">
                    Sign in on the Tidal page${opened ? ' that just opened' : ''}. You then land on
                    a Tidal page that may look like an error — that's expected: copy its address
                    (it contains <code>code=</code>) and ${this._clipboardAuto
                        ? html`come back here: the connection completes on its own — allow
                            clipboard access if your browser asks. Or paste it below.`
                        : html`paste it here. The connection completes on its own.`}
                </span>
                <input
                    class="form-control form-control--raised lib-inline-input"
                    type="text"
                    enterkeyhint="go"
                    placeholder="https://tidal.com/android/login/auth?code=…"
                    .value=${this._redirect}
                    @paste=${this._onPaste}
                    @input=${this._onInput}
                    @keydown=${this._onKeydown}
                />
                ${this._submitting
                    ? html`<span class="lib-tidal-hint" role="status">Connecting…</span>`
                    : nothing}
                ${this._error ? html`<span class="lib-tidal-err">${this._error}</span>` : nothing}
            </div>
            <div class="lib-qb-actions">
                <button class="action-btn compact secondary"
                    aria-disabled=${this._submitting || this._starting ? 'true' : 'false'}
                    @click=${this._connect}>
                    Reopen Tidal page
                </button>
            </div>
        `;
    }
}

customElements.define('ag-tidal-connection', AgTidalConnection);
