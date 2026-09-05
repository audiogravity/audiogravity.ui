/**
 * Unit tests for ag-highresaudio-output.js.
 *
 * Covers the render-state logic (connected vs. login form) and the _connect
 * credential validation / API dispatch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal stubs for Lit and dependencies.
// `svg` is part of the mock because the card now takes its name and icon from
// library-constants.js, which tags its origin glyphs with it. A mock narrower than the
// module graph fails at import time, before a single assertion runs.
vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
const { apiPost, apiDelete } = vi.hoisted(() => ({ apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost, apiDelete }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
const { rememberHraConnection, forgetHraAccount } = vi.hoisted(() => ({
    rememberHraConnection: vi.fn(), forgetHraAccount: vi.fn(),
}));
vi.mock('../../library-store.js', () => ({
    rememberHraConnection,
    forgetHraAccount,
    hasSubscription: (conn) => conn?.has_subscription !== false,
}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

import { AgHighresaudioOutput } from './ag-highresaudio-output.js';

/** Build a bare instance without mounting. */
function makeEl(connection = null) {
    const el = Object.create(AgHighresaudioOutput.prototype);
    el._connection = connection;
    el._loading = false;
    el._connecting = false;
    el._error = '';
    el._disconnect = vi.fn();
    el._connect = AgHighresaudioOutput.prototype._connect.bind(el);
    return el;
}

/** Flatten a Lit template tree to a string for inspection. */
function renderToString(tpl) {
    if (!tpl || typeof tpl !== 'object') return String(tpl ?? '');
    const parts = tpl.strings ?? [];
    const vals = tpl.values ?? [];
    let out = '';
    parts.forEach((s, i) => {
        out += s;
        if (i < vals.length) out += renderToString(vals[i]);
    });
    return out;
}

describe('AgHighresaudioOutput render', () => {
    beforeEach(() => { apiPost.mockReset(); apiDelete.mockReset(); });

    it('shows the login form when disconnected', () => {
        const el = makeEl({ connected: false });
        const html = renderToString(el.render());
        expect(html).toContain('hra-login-form');
        expect(html).toContain('HIGHRESAUDIO');
        expect(html).toContain('single active device');
    });

    it('shows connected card with name and username when connected', () => {
        const el = makeEl({ connected: true, username: 'a@b.co', subscription: 'SUBSCRIPTION' });
        const html = renderToString(el.render());
        expect(html).toContain('connected');
        expect(html).toContain('HIGHRESAUDIO');
        expect(html).toContain('a@b.co');
        expect(html).toContain('Disconnect');
        expect(html).not.toContain('purchases only');
    });

    it('says next to the account that it can play its purchases only', () => {
        // An account without a subscription is signed in all the same; the browse
        // will offer it the Vault alone, and this line is where that is explained.
        const el = makeEl({ connected: true, username: 'a@b.co',
                            subscription: 'NO SUBSCRIPTION', has_subscription: false });
        const html = renderToString(el.render());
        expect(html).toContain('a@b.co · purchases only, no subscription');
    });

    it('reads an absent flag as a subscription — a core that predates the field', () => {
        const el = makeEl({ connected: true, username: 'a@b.co' });
        expect(renderToString(el.render())).not.toContain('purchases only');
    });
});

describe('AgHighresaudioOutput keeps the store honest about the account', () => {
    beforeEach(() => {
        apiPost.mockReset(); apiDelete.mockReset();
        rememberHraConnection.mockReset(); forgetHraAccount.mockReset();
    });

    it('a sign-in seeds the store with the POST body — the GET the browse would pay is already answered', async () => {
        const el = makeEl(null);
        el.querySelector = () => ({ username: { value: 'a@b.co' }, password: { value: 'pw' } });
        el.dispatchEvent = vi.fn();
        const conn = { connected: true, has_subscription: false };
        apiPost.mockResolvedValue(conn);
        await el._connect();
        expect(rememberHraConnection).toHaveBeenCalledTimes(1);
        expect(rememberHraConnection).toHaveBeenCalledWith(conn);
    });

    it('not after a sign-in that failed — nothing changed', async () => {
        const el = makeEl(null);
        el.querySelector = () => ({ username: { value: 'a@b.co' }, password: { value: 'pw' } });
        el.dispatchEvent = vi.fn();
        apiPost.mockRejectedValue(new Error('401'));
        await el._connect();
        expect(rememberHraConnection).not.toHaveBeenCalled();
        expect(forgetHraAccount).not.toHaveBeenCalled();
    });

    it('a sign-out forgets the whole account, not just the connection', async () => {
        const el = makeEl({ connected: true, username: 'a@b.co' });
        el._disconnect = AgHighresaudioOutput.prototype._disconnect.bind(el);
        el._loadConnection = async () => {};
        el.dispatchEvent = vi.fn();
        apiDelete.mockResolvedValue({ ok: true });
        await el._disconnect();
        expect(forgetHraAccount).toHaveBeenCalledTimes(1);
    });
});

describe('AgHighresaudioOutput._connect', () => {
    beforeEach(() => { apiPost.mockReset(); });

    it('sets an error when fields are empty (no API call)', async () => {
        const el = makeEl({ connected: false });
        el.querySelector = () => ({ username: { value: '  ' }, password: { value: '' } });
        await el._connect({ preventDefault() {} });
        expect(el._error).toMatch(/email and password/i);
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('posts credentials and fires event on success', async () => {
        const el = makeEl({ connected: false });
        el.querySelector = () => ({ username: { value: 'a@b.co' }, password: { value: 'pw' } });
        apiPost.mockResolvedValue({ connected: true, username: 'a@b.co' });
        const events = [];
        el.dispatchEvent = (e) => events.push(e.type);
        await el._connect({ preventDefault() {} });
        expect(apiPost).toHaveBeenCalledWith('/highresaudio/connection', { username: 'a@b.co', password: 'pw' });
        expect(el._connection.connected).toBe(true);
        // One event for every source-list change, whatever the provider —
        // the per-provider events had no listener at all.
        expect(events).toContain('sources-changed');
    });

    it('surfaces the error message on failed login', async () => {
        const el = makeEl({ connected: false });
        el.querySelector = () => ({ username: { value: 'a@b.co' }, password: { value: 'bad' } });
        apiPost.mockRejectedValue(new Error('HRA login failed: INVALID_LOGIN'));
        await el._connect({ preventDefault() {} });
        expect(el._error).toContain('INVALID_LOGIN');
        expect(el._connecting).toBe(false);
    });
});
