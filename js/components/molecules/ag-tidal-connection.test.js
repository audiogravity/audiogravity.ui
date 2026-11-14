/**
 * Unit tests for ag-tidal-connection.
 *
 * Covers the line under the account name: what Tidal will actually play, which
 * is not what AG asks for once the plan has ended. The subscribed/unknown rule
 * itself is tested once, in library-store.test.js.
 *
 * Covers the sign-in step too: the paste is the user's last action — the card
 * completes the login itself when the pasted value carries a code, by the same
 * rule as the core's `_extract_code` (its test values are reused below). Where the
 * browser reads the clipboard once allowed, coming back to the app is enough — for
 * Tidal's own return address only; and Reopen Tidal page starts the sign-in afresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
vi.mock('../../library-store.js', () => ({
    hasSubscription: (conn) => conn?.has_subscription !== false,
}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

import {
    AgTidalConnection, tidalSignInCode, tidalReturnCode, clipboardReadAllowed,
} from './ag-tidal-connection.js';
import { apiPost } from '../../api.js';
import { loadConnection } from '../utils-lit.js';

/** Tidal's return address, as the core's tests write it. */
const RETURN_URL = 'https://tidal.com/android/login/auth?code=eyJABC.longtoken.value&state=na';

/** What a refusal of the sign-in says (the core answered 400). */
const LOGIN_FAILED = 'Login failed — reopen the Tidal page and try again.';

/** What any other failure says: the box out of reach or failing. */
const SUBMIT_FAILED = 'Login failed — please retry.';

/** A password as a password manager would copy it: long, and without a space. */
const PASSWORD = 'Tr0ub4dor&3xKq9!zPw7Lm2';

/** The error api.js throws for an HTTP status (throwForStatus). */
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

/** A card waiting for the paste, without mounting. */
function waitingCard(state = {}) {
    const el = Object.create(AgTidalConnection.prototype);
    Object.assign(el, {
        _connection: null, _loading: false, _awaiting: true,
        _redirect: '', _submitting: false, _error: '',
        _clipboardAuto: false, _blockedUrl: '',
        _starting: false, _reading: false, _sentCode: null,
    }, state);
    el.dispatchEvent = vi.fn();
    return el;
}

/** A paste event carrying `text`, as the browser hands it to the field. */
function pasteEvent(text) {
    return { clipboardData: { getData: () => text }, preventDefault: vi.fn() };
}

/** Let the pending request settle. */
const settle = () => new Promise((resolve) => { setTimeout(resolve); });

/** Every string a template would print, nested templates included. */
function printed(tpl) {
    if (typeof tpl === 'string') return tpl;
    if (!tpl?.strings) return '';
    return tpl.strings.reduce(
        (out, s, i) => out + s + (i < tpl.values.length ? printed(tpl.values[i]) : ''), '');
}

/**
 * The browser the clipboard code finds: https or not, with the APIs given.
 * @param {{secure?: boolean, query?: Function|null, readText?: Function|null}} [api]
 */
function stubBrowser({ secure = true, query = null, readText = null } = {}) {
    vi.stubGlobal('isSecureContext', secure);
    vi.stubGlobal('navigator', {
        clipboard: readText ? { readText } : undefined,
        permissions: query ? { query } : undefined,
    });
}

/** Chromium's answer about the `clipboard-read` permission. */
const permission = (state) => vi.fn().mockResolvedValue({ state });

/**
 * MemoryCache as common.js publishes it in the app, over a Map.
 * @returns {Map<string, *>} What it holds.
 */
function stubMemoryCache() {
    const store = new Map();
    window.MemoryCache = {
        get: (key, fallback = null) => (store.has(key) ? store.get(key) : fallback),
        set: (key, value) => { store.set(key, value); },
    };
    return store;
}

/** Read the description line for a connection state, without mounting. */
function desc(connection) {
    const el = Object.create(AgTidalConnection.prototype);
    el._connection = connection;
    return el._connectedDesc;
}

describe('AgTidalConnection connected description', () => {
    it('shows the asked-for tier and country on a subscribed account', () => {
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR',
                      has_subscription: true })).toBe('Hi-Res · FR');
        expect(desc({ connected: true, quality: 'LOSSLESS', country_code: 'FR',
                      has_subscription: true })).toBe('Lossless · FR');
    });

    it('replaces the tier when the plan has ended', () => {
        // Printing "Hi-Res" here would state the opposite of what is heard.
        const line = desc({ connected: true, quality: 'HI_RES_LOSSLESS',
                            country_code: 'FR', has_subscription: false });
        expect(line).toBe('No subscription · 30-second previews · FR');
        expect(line).not.toContain('Hi-Res');
    });

    it('says it without a country when the core reports none', () => {
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', has_subscription: false }))
            .toBe('No subscription · 30-second previews');
    });

    it('reads an unknown answer as subscribed', () => {
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR',
                      has_subscription: null })).toBe('Hi-Res · FR');
        expect(desc({ connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR' }))
            .toBe('Hi-Res · FR');
    });
});

describe('tidalSignInCode — the rule of the core', () => {
    it("reads the code of Tidal's return address", () => {
        expect(tidalSignInCode(RETURN_URL)).toBe('eyJABC.longtoken.value');
    });

    it('accepts a bare code, as the core does', () => {
        const bare = 'eyJ0aGlzaXNhbG9uZ2Vub3VnaGJhcmVjb2Rl';
        expect(tidalSignInCode(bare)).toBe(bare);
    });

    it('does not mistake the sign-in page for the return page', () => {
        // code_challenge is not code: pasting the link AG opened must not submit.
        expect(tidalSignInCode('https://login.tidal.com/authorize?client_id=x&code_challenge=y'))
            .toBeNull();
    });

    it('finds nothing in an empty or short value', () => {
        expect(tidalSignInCode('')).toBeNull();
        expect(tidalSignInCode('short')).toBeNull();
        expect(tidalSignInCode(undefined)).toBeNull();
        // The core's threshold is "more than 20": exactly 20 is not a code.
        expect(tidalSignInCode('a'.repeat(20))).toBeNull();
        expect(tidalSignInCode('a'.repeat(21))).toBe('a'.repeat(21));
    });

    it('finds nothing in an address without a code, or with an empty one', () => {
        expect(tidalSignInCode('https://tidal.com/android/login/auth')).toBeNull();
        expect(tidalSignInCode('https://tidal.com/android/login/auth?code=')).toBeNull();
    });

    it('ignores surrounding blanks and a fragment, like the core', () => {
        expect(tidalSignInCode(`  ${RETURN_URL}#top \n`)).toBe('eyJABC.longtoken.value');
    });

    it('does not take a pasted sentence for a bare code', () => {
        // The one difference with the core, which would send it and be refused.
        expect(tidalSignInCode('this is not a code but it is long')).toBeNull();
    });
});

describe("tidalReturnCode — Tidal's own return address, and nothing else", () => {
    it("reads the code of Tidal's return address", () => {
        expect(tidalReturnCode(RETURN_URL)).toBe('eyJABC.longtoken.value');
        expect(tidalReturnCode(`  ${RETURN_URL}#top \n`)).toBe('eyJABC.longtoken.value');
    });

    it('takes no bare code: a password copied to sign in looks like one', () => {
        // The paste rule accepts both — fine for a paste, not for a read nobody asked for.
        expect(tidalSignInCode(PASSWORD)).toBe(PASSWORD);
        expect(tidalReturnCode(PASSWORD)).toBeNull();
        expect(tidalReturnCode('eyJ0aGlzaXNhbG9uZ2Vub3VnaGJhcmVjb2Rl')).toBeNull();
    });

    it("takes no other site's address, even one carrying a code", () => {
        expect(tidalReturnCode('https://accounts.example.com/callback?code=abcdefghijklmnopqrstuvwxyz'))
            .toBeNull();
        expect(tidalReturnCode('https://tidal.com.example.net/android/login/auth?code=x')).toBeNull();
        expect(tidalReturnCode('http://tidal.com/android/login/auth?code=x')).toBeNull();
        expect(tidalReturnCode('https://tidal.com/browse?code=x')).toBeNull();
    });

    it('finds nothing on the sign-in page, or on a return address without a code', () => {
        expect(tidalReturnCode('https://login.tidal.com/authorize?client_id=x&code_challenge=y'))
            .toBeNull();
        expect(tidalReturnCode('https://tidal.com/android/login/auth')).toBeNull();
        expect(tidalReturnCode('https://tidal.com/android/login/auth?code=')).toBeNull();
        expect(tidalReturnCode('')).toBeNull();
        expect(tidalReturnCode(undefined)).toBeNull();
    });
});

describe('clipboardReadAllowed — Chromium, over https, until refused', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('says yes before the user is asked, and once allowed', async () => {
        stubBrowser({ query: permission('prompt'), readText: vi.fn() });
        expect(await clipboardReadAllowed()).toBe(true);
        stubBrowser({ query: permission('granted'), readText: vi.fn() });
        expect(await clipboardReadAllowed()).toBe(true);
    });

    it('says no once the user has refused, so the prompt never comes back', async () => {
        stubBrowser({ query: permission('denied'), readText: vi.fn() });
        expect(await clipboardReadAllowed()).toBe(false);
    });

    it('says no where the permission does not exist — Firefox, Safari', async () => {
        stubBrowser({ query: vi.fn().mockRejectedValue(new TypeError('clipboard-read')), readText: vi.fn() });
        expect(await clipboardReadAllowed()).toBe(false);
    });

    it('says no over plain http, without asking anything', async () => {
        const query = permission('granted');
        stubBrowser({ secure: false, query, readText: vi.fn() });
        expect(await clipboardReadAllowed()).toBe(false);
        expect(query).not.toHaveBeenCalled();
    });

    it('says no without the clipboard or the permissions API', async () => {
        stubBrowser({ query: permission('granted') });
        expect(await clipboardReadAllowed()).toBe(false);
        stubBrowser({ readText: vi.fn() });
        expect(await clipboardReadAllowed()).toBe(false);
    });
});

describe('AgTidalConnection sign-in step', () => {
    beforeEach(() => { apiPost.mockReset(); });

    it('completes the login from the paste alone', async () => {
        apiPost.mockResolvedValueOnce({ connected: true, country_code: 'FR' });
        const el = waitingCard();
        const e = pasteEvent(`  ${RETURN_URL}  `);

        el._onPaste(e);
        await settle();

        expect(e.preventDefault).toHaveBeenCalled();
        expect(apiPost).toHaveBeenCalledWith('/tidal/connection/submit', { redirect_url: RETURN_URL });
        expect(el._connection).toEqual({ connected: true, country_code: 'FR' });
        expect(el._awaiting).toBe(false);
        expect(el._redirect).toBe('');
        expect(el.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(el.dispatchEvent.mock.calls[0][0].type).toBe('sources-changed');
    });

    it('replaces what the field held instead of gluing the paste to it', async () => {
        apiPost.mockResolvedValueOnce({ connected: true });
        const el = waitingCard({ _redirect: 'https://tidal.com/android/login/auth?code=old' });

        el._onPaste(pasteEvent(RETURN_URL));
        await settle();

        expect(apiPost).toHaveBeenCalledWith('/tidal/connection/submit', { redirect_url: RETURN_URL });
    });

    it('says why nothing happens when the paste has no code, and sends nothing', () => {
        const el = waitingCard();

        el._onPaste(pasteEvent('https://login.tidal.com/authorize?client_id=x&code_challenge=y'));

        expect(apiPost).not.toHaveBeenCalled();
        expect(el._error).toMatch(/^No sign-in code/);
        expect(el._awaiting).toBe(true);
    });

    it('lets the browser insert when the paste carries no text, then reads the field', async () => {
        apiPost.mockResolvedValueOnce({ connected: true });
        const el = waitingCard();
        const e = { clipboardData: null, preventDefault: vi.fn() };

        el._onPaste(e);
        expect(e.preventDefault).not.toHaveBeenCalled();
        expect(apiPost).not.toHaveBeenCalled();

        el._onInput({ target: { value: RETURN_URL }, inputType: 'insertFromPaste', data: null });
        await settle();
        expect(apiPost).toHaveBeenCalledWith('/tidal/connection/submit', { redirect_url: RETURN_URL });
    });

    it('never submits while typing, even once the address is whole', () => {
        const el = waitingCard();

        el._onInput({ target: { value: RETURN_URL }, inputType: 'insertText', data: 'e' });
        el._onInput({ target: { value: RETURN_URL }, inputType: 'deleteContentBackward', data: null });

        expect(apiPost).not.toHaveBeenCalled();
        expect(el._redirect).toBe(RETURN_URL);
        expect(el._error).toBe('');
    });

    it('takes a chunk inserted in one go for a paste — a drop, a keyboard suggestion', async () => {
        apiPost.mockResolvedValue({ connected: false });
        const el = waitingCard();

        el._onInput({ target: { value: RETURN_URL }, inputType: 'insertFromDrop', data: null });
        await settle();
        el._onInput({ target: { value: RETURN_URL }, inputType: 'insertText', data: RETURN_URL });
        await settle();

        expect(apiPost).toHaveBeenCalledTimes(2);
    });

    it('sends whatever the field holds on Enter, and nothing on other keys', async () => {
        apiPost.mockResolvedValueOnce({ connected: true });
        const el = waitingCard({ _redirect: 'eyJ0aGlzaXNhbG9uZ2Vub3VnaGJhcmVjb2Rl' });
        const other = { key: 'a', preventDefault: vi.fn() };
        const enter = { key: 'Enter', preventDefault: vi.fn() };

        el._onKeydown(other);
        expect(apiPost).not.toHaveBeenCalled();
        expect(other.preventDefault).not.toHaveBeenCalled();

        el._onKeydown(enter);
        await settle();
        expect(enter.preventDefault).toHaveBeenCalled();
        expect(apiPost).toHaveBeenCalledWith('/tidal/connection/submit',
            { redirect_url: 'eyJ0aGlzaXNhbG9uZ2Vub3VnaGJhcmVjb2Rl' });
    });

    it('lets the Enter that ends a composition only end it', () => {
        const el = waitingCard({ _redirect: RETURN_URL });
        const composing = { key: 'Enter', isComposing: true, preventDefault: vi.fn() };

        el._onKeydown(composing);

        expect(apiPost).not.toHaveBeenCalled();
        expect(composing.preventDefault).not.toHaveBeenCalled();
    });

    it('sends one request at a time', () => {
        apiPost.mockReturnValueOnce(new Promise(() => {}));
        const el = waitingCard({ _redirect: RETURN_URL });

        el._submit();
        el._submit();

        expect(apiPost).toHaveBeenCalledTimes(1);
    });

    it('sends nothing while a new sign-in is starting — the address belongs to the old one', () => {
        waitingCard({ _redirect: RETURN_URL, _starting: true })._submit();
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('keeps waiting and points to Reopen when the core refuses', async () => {
        apiPost.mockRejectedValueOnce(httpError(400));
        const el = waitingCard();

        el._onPaste(pasteEvent(RETURN_URL));
        await settle();

        expect(el._awaiting).toBe(true);
        expect(el._submitting).toBe(false);
        expect(el._error).toBe(LOGIN_FAILED);
        expect(el.dispatchEvent).not.toHaveBeenCalled();
    });

    it('says the same when the core answers without connecting', async () => {
        apiPost.mockResolvedValueOnce({ connected: false });
        const el = waitingCard();

        el._onPaste(pasteEvent(RETURN_URL));
        await settle();

        expect(el._error).toBe(LOGIN_FAILED);
    });

    it('asks to retry, not to reopen, when the box does not answer', async () => {
        // Reopening would throw away a sign-in still pending on the box.
        apiPost.mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockRejectedValueOnce(httpError(503));
        const el = waitingCard({ _redirect: RETURN_URL });

        await el._submit();
        expect(el._error).toBe(SUBMIT_FAILED);
        await el._submit();
        expect(el._error).toBe(SUBMIT_FAILED);
        expect(el._awaiting).toBe(true);
    });
});

describe('AgTidalConnection — back in the app, the copied address is picked up', () => {
    let readText;
    let query;
    let focus;

    beforeEach(() => {
        apiPost.mockReset();
        readText = vi.fn().mockResolvedValue('');
        query = permission('granted');
        stubBrowser({ query, readText });
        focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        focus.mockRestore();
        delete window.MemoryCache;
    });

    it('completes the login with nothing to paste', async () => {
        readText.mockResolvedValue(` ${RETURN_URL}\n`);
        apiPost.mockResolvedValueOnce({ connected: true });
        const el = waitingCard();

        await el._onReturn();

        expect(apiPost).toHaveBeenCalledWith('/tidal/connection/submit', { redirect_url: RETURN_URL });
        expect(el._awaiting).toBe(false);
        expect(el.dispatchEvent.mock.calls[0][0].type).toBe('sources-changed');
    });

    it('leaves anything else alone, without a word', async () => {
        readText.mockResolvedValue('the address of my bank');
        const el = waitingCard();

        await el._onReturn();

        expect(apiPost).not.toHaveBeenCalled();
        expect(el._redirect).toBe('');
        expect(el._error).toBe('');
    });

    it("never takes a password, or another site's address, from the clipboard", async () => {
        const el = waitingCard();

        readText.mockResolvedValue(PASSWORD);
        await el._onReturn();
        readText.mockResolvedValue('https://accounts.example.com/callback?code=abcdefghijklmnopqrstuvwxyz');
        await el._onReturn();

        expect(apiPost).not.toHaveBeenCalled();
        expect(el._redirect).toBe('');   // not shown in the field either
        expect(el._error).toBe('');
    });

    it('reads nothing unless the card waits for Tidal', async () => {
        await waitingCard({ _awaiting: false })._onReturn();
        expect(query).not.toHaveBeenCalled();
        expect(readText).not.toHaveBeenCalled();
    });

    it('reads nothing once the account is connected some other way', async () => {
        await waitingCard({ _connection: { connected: true } })._onReturn();
        expect(readText).not.toHaveBeenCalled();
    });

    it('stops waiting when a refresh finds the account connected', async () => {
        loadConnection.mockImplementationOnce(async (host) => { host._connection = { connected: true }; });
        const connected = waitingCard();
        await connected._loadConnection();
        expect(connected._awaiting).toBe(false);

        loadConnection.mockImplementationOnce(async (host) => { host._connection = { connected: false }; });
        const still = waitingCard();
        await still._loadConnection();
        expect(still._awaiting).toBe(true);
    });

    it('reads nothing until the page has the focus — Chromium refuses a read without it', async () => {
        focus.mockReturnValue(false);
        await waitingCard()._onReturn();
        expect(readText).not.toHaveBeenCalled();
    });

    it('reads nothing while a paste is being sent, or a new sign-in starts', async () => {
        readText.mockResolvedValue(RETURN_URL);
        await waitingCard({ _submitting: true })._onReturn();
        await waitingCard({ _starting: true })._onReturn();
        expect(readText).not.toHaveBeenCalled();
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('never sends a code twice on its own — a refused code stays refused', async () => {
        readText.mockResolvedValue(RETURN_URL);
        apiPost.mockRejectedValueOnce(httpError(400));
        const el = waitingCard();

        await el._onReturn();
        await el._onReturn();

        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(el._error).toBe(LOGIN_FAILED);
    });

    it('does not resend a code the user pasted, but takes a new one', async () => {
        apiPost.mockRejectedValueOnce(httpError(400));
        const el = waitingCard();
        el._onPaste(pasteEvent(RETURN_URL));
        await settle();

        readText.mockResolvedValue(RETURN_URL);
        await el._onReturn();
        expect(apiPost).toHaveBeenCalledTimes(1);

        const fresh = RETURN_URL.replace('eyJABC', 'eyJNEW');
        readText.mockResolvedValue(fresh);
        apiPost.mockResolvedValueOnce({ connected: true });
        await el._onReturn();
        expect(apiPost).toHaveBeenLastCalledWith('/tidal/connection/submit', { redirect_url: fresh });
        expect(el._awaiting).toBe(false);
    });

    it('does not resend after a reload a code refused before it, and keeps no code', async () => {
        const store = stubMemoryCache();
        readText.mockResolvedValue(RETURN_URL);
        apiPost.mockRejectedValueOnce(httpError(400));
        await waitingCard()._onReturn();

        const reloaded = waitingCard();   // a new page: nothing in memory
        await reloaded._onReturn();

        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(reloaded._error).toBe('');
        const kept = [...store.values()].join(' ');
        expect(kept).toMatch(/^fnv1a-[0-9a-f]+$/);
        expect(kept).not.toContain('eyJABC');
    });

    it('sends again, on the next return, a code that never reached the box', async () => {
        readText.mockResolvedValue(RETURN_URL);
        apiPost.mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({ connected: true });
        const el = waitingCard();

        await el._onReturn();
        expect(el._error).toBe(SUBMIT_FAILED);
        await el._onReturn();

        expect(apiPost).toHaveBeenCalledTimes(2);
        expect(el._awaiting).toBe(false);
    });

    it('turns the hint back to the paste when the user refuses the prompt', async () => {
        query.mockResolvedValueOnce({ state: 'prompt' }).mockResolvedValue({ state: 'denied' });
        readText.mockRejectedValue(new DOMException('Read permission denied.', 'NotAllowedError'));
        const el = waitingCard({ _clipboardAuto: true });

        await el._onReturn();

        expect(el._clipboardAuto).toBe(false);
        expect(el._error).toBe('');
        expect(el._reading).toBe(false);
        expect(apiPost).not.toHaveBeenCalled();
        expect(printed(el._renderDisconnected())).toContain('paste it here');
    });

    it('reads nothing where the browser does not offer it — the hint asks for a paste', async () => {
        query.mockRejectedValue(new TypeError('clipboard-read'));
        const el = waitingCard();

        await el._onReturn();

        expect(readText).not.toHaveBeenCalled();
        expect(el._clipboardAuto).toBe(false);
    });

    it('listens from connection to removal, on focus and on visibility', async () => {
        const el = new AgTidalConnection();
        el.dispatchEvent = vi.fn();
        el.connectedCallback();
        el._awaiting = true;

        window.dispatchEvent(new Event('focus'));
        await settle();
        document.dispatchEvent(new Event('visibilitychange'));
        await settle();
        expect(readText).toHaveBeenCalledTimes(2);

        el.disconnectedCallback();
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        await settle();
        expect(readText).toHaveBeenCalledTimes(2);
    });
});

describe('AgTidalConnection — Reopen Tidal page', () => {
    const NEW_PAGE = 'https://login.tidal.com/authorize?client_id=x&code_challenge=new';
    let open;

    beforeEach(() => {
        apiPost.mockReset();
        open = vi.spyOn(window, 'open').mockReturnValue({});
        stubBrowser({ secure: false });   // a browser that does not read the clipboard
    });
    afterEach(() => {
        open.mockRestore();
        vi.unstubAllGlobals();
    });

    it('is at hand while the card waits, and starts the sign-in afresh', async () => {
        apiPost.mockResolvedValueOnce({ authorize_url: NEW_PAGE });
        const el = waitingCard({ _redirect: 'https://tidal.com/android/login/auth?code=spent',
                                 _error: LOGIN_FAILED });
        expect(printed(el._renderDisconnected())).toContain('Reopen Tidal page');

        await el._connect();

        expect(apiPost).toHaveBeenCalledWith('/tidal/connection');
        expect(open).toHaveBeenCalledWith(NEW_PAGE, '_blank');
        expect(el._awaiting).toBe(true);
        expect(el._redirect).toBe('');
        expect(el._error).toBe('');
        expect(el._blockedUrl).toBe('');
    });

    it('waits while an address is being sent, and shows it', async () => {
        const sending = waitingCard({ _submitting: true });
        expect(printed(sending._renderDisconnected())).toMatch(/aria-disabled=true/);

        await sending._connect();
        expect(apiPost).not.toHaveBeenCalled();

        expect(printed(waitingCard()._renderDisconnected())).toMatch(/aria-disabled=false/);
    });

    it('offers the page as a link when the browser refuses to open it', async () => {
        open.mockReturnValue(null);
        apiPost.mockResolvedValueOnce({ authorize_url: NEW_PAGE });
        const el = waitingCard();

        await el._connect();

        const text = printed(el._renderDisconnected());
        expect(el._blockedUrl).toBe(NEW_PAGE);
        expect(text).toContain('did not open the Tidal page');
        expect(text).toContain(NEW_PAGE);
        expect(text).not.toContain('that just opened');
    });

    it('stops saying the page did not open once the link has opened it', () => {
        const el = waitingCard({ _blockedUrl: NEW_PAGE });

        el._onOpenedByLink();

        const text = printed(el._renderDisconnected());
        expect(text).not.toContain('did not open the Tidal page');
        expect(text).toContain('that just opened');
    });

    it('drops the link once a page did open', async () => {
        apiPost.mockResolvedValueOnce({ authorize_url: NEW_PAGE });
        const el = waitingCard({ _blockedUrl: 'https://login.tidal.com/authorize?old' });

        await el._connect();

        expect(el._blockedUrl).toBe('');
        expect(printed(el._renderDisconnected())).toContain('that just opened');
    });

    it('starts one sign-in at a time', () => {
        apiPost.mockReturnValueOnce(new Promise(() => {}));
        const el = waitingCard();

        el._connect();
        el._connect();

        expect(apiPost).toHaveBeenCalledTimes(1);
    });

    it('keeps the card waiting, and a new try possible, when the start fails', async () => {
        apiPost.mockRejectedValueOnce(new Error('503'));
        const el = waitingCard();

        await el._connect();

        expect(el._awaiting).toBe(true);
        expect(el._error).toBe('Could not start login.');
        expect(el._starting).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });

    it('tells the hint whether the browser will pick the address up', async () => {
        stubBrowser({ query: permission('prompt'), readText: vi.fn() });
        apiPost.mockResolvedValueOnce({ authorize_url: NEW_PAGE });
        const el = waitingCard({ _awaiting: false });

        await el._connect();

        expect(el._clipboardAuto).toBe(true);
        const text = printed(el._renderDisconnected());
        expect(text).toContain('come back here');
        expect(text).toMatch(/allow\s+clipboard access if your browser asks/);
        expect(text).toContain('Or paste it below');
    });
});

describe('AgTidalConnection waiting card', () => {
    it('has no Finish button: the connection completes on its own', () => {
        const text = printed(waitingCard()._renderDisconnected());

        expect(text).not.toContain('Finish login');
        expect(text).toMatch(/completes\s+on its own/);
        expect(text).toContain('paste it here');
        expect(text).not.toContain('come back here');
        expect(text).not.toContain('Connecting…');
    });

    it('says it is connecting while the request runs', () => {
        expect(printed(waitingCard({ _submitting: true })._renderDisconnected()))
            .toContain('Connecting…');
    });
});
