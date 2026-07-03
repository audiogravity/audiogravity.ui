/**
 * Unit tests for ag-highresaudio-output.js.
 *
 * Covers the render-state logic (connected vs. login form) and the _connect
 * credential validation / API dispatch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal stubs for Lit and dependencies.
vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
const { apiPost, apiDelete } = vi.hoisted(() => ({ apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost, apiDelete }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
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
        expect(html).toContain('Highresaudio');
        expect(html).toContain('single active device');
    });

    it('shows connected card with name and username when connected', () => {
        const el = makeEl({ connected: true, username: 'a@b.co', subscription: 'SUBSCRIPTION' });
        const html = renderToString(el.render());
        expect(html).toContain('connected');
        expect(html).toContain('Highresaudio');
        expect(html).toContain('a@b.co');
        expect(html).toContain('Disconnect');
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
        expect(events).toContain('highresaudio-connected');
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
