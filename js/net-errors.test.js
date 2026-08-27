import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asNetworkError, isNetworkError, isGatewayError, isRetryableFailure, connectionMessage, fetchOrThrow, throwForStatus, readJson, validationField, signInFailureMessage } from './net-errors.js';

describe('isNetworkError', () => {
    // The regression that started all this: the first version read the browser's error text, and
    // each engine words a transport failure differently — so the list missed WebKit's, and
    // `includes('failed')` turned "Load failed" into "Invalid username or password". These are the
    // three real sentences; the point of the test is that not one of them is read for its wording.
    it.each([
        ['Chromium', 'Failed to fetch'],
        ['Gecko', 'NetworkError when attempting to fetch resource.'],
        ['WebKit', 'Load failed'],
    ])('recognises %s\'s transport failure once the fetch site has tagged it', (_engine, message) => {
        expect(isNetworkError(asNetworkError(new TypeError(message)))).toBe(true);
    });

    it('recognises a transport failure whose wording nobody has seen yet', () => {
        // An engine we have never tested, or a future release that rewords its message, must
        // still be recognised. Nothing here reads the sentence.
        expect(isNetworkError(asNetworkError(new TypeError('wording invented in 2029')))).toBe(true);
    });

    // The second regression, and the reason the fix is a tag rather than a type check. Treating
    // every TypeError as "unreachable" looks equivalent and is measurably worse: FetchController
    // wraps its own onSuccess callback in the same try as the request, so a `data.items.map` on a
    // payload without `items` — after a perfectly successful 200 — came out as "Unable to connect
    // to server". A TypeError says something about the code, nothing about the network.
    it('does not claim an untagged TypeError raised after a successful response', () => {
        expect(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    });

    it('does not claim an untagged TypeError even when it is worded like a transport failure', () => {
        expect(isNetworkError(new TypeError('Load failed'))).toBe(false);
    });

    it('does not claim an AbortError', () => {
        // WebKit rejects a WebAuthn ceremony superseded by another with AbortError — on a box
        // that answered perfectly well. Reading the name as "nothing answered" told the owner
        // to check the power on the passkey panel. Only the tag counts.
        const abort = new Error('The operation was aborted.');
        abort.name = 'AbortError';
        expect(isNetworkError(abort)).toBe(false);
    });

    it.each([401, 403, 404, 500, 502])('does not claim a %i as a network failure', (status) => {
        // A status means something answered — whatever it answered. This is the half of the
        // distinction that keeps a genuinely wrong password reported as a wrong password.
        const refused = new Error('Invalid credentials');
        refused.status = status;
        expect(isNetworkError(refused)).toBe(false);
    });

    it('lets a status override the tag, never the reverse', () => {
        // Shape is judged on the status first: it is the only certain signal, and a tagged error
        // that nonetheless carries one is a bug in the tagging, not a licence to lie.
        const odd = asNetworkError(new TypeError('Load failed'));
        odd.status = 401;
        expect(isNetworkError(odd)).toBe(false);
    });

    it('is not fooled by an ordinary error that merely mentions failure', () => {
        expect(isNetworkError(new Error('Queue operation failed'))).toBe(false);
    });

    it.each([[null], [undefined], ['Load failed'], [42]])('survives %s being thrown', (thrown) => {
        expect(isNetworkError(thrown)).toBe(false);
    });
});

describe('asNetworkError', () => {
    it('returns the same error, tagged', () => {
        const original = new TypeError('Load failed');
        const tagged = asNetworkError(original);
        expect(tagged).toBe(original);
        expect(tagged.isNetwork).toBe(true);
    });

    it('wraps a non-Error rejection rather than dropping it', () => {
        const tagged = asNetworkError('something odd');
        expect(tagged).toBeInstanceOf(Error);
        expect(tagged.message).toContain('something odd');
        expect(isNetworkError(tagged)).toBe(true);
    });
});

describe('isGatewayError', () => {
    // The commonest outage in production, and the one the first version fell straight through:
    // the web server keeps serving the interface while the core behind it is stopped. The request
    // *is* answered — with a 502 whose HTML body makes json() throw, leaving a generic message and
    // a status. Not a transport failure by any technical reading, and the same thing for the
    // reader: the box is there, the software is not.
    it.each([502, 504])('recognises a %i, which only a proxy ever says', (status) => {
        const err = new Error('HTTP error');
        err.status = status;
        err.detail = 'whatever a proxy might put here';
        expect(isGatewayError(err)).toBe(true);
    });

    it('recognises a 503 that carries no message of its own', () => {
        // A proxy answers 503 with HTML, which leaves no parsed detail behind.
        const err = new Error('HTTP 503');
        err.status = 503;
        expect(isGatewayError(err)).toBe(true);
    });

    it('never claims a 500, whatever its body', () => {
        // An earlier version did, on the strength of one measurement — Vite answers 500 with an
        // empty body when the core is stopped. It was wrong twice. An unhandled core exception
        // reaches Starlette's ServerErrorMiddleware, which answers PlainTextResponse("Internal
        // Server Error", 500) with no JSON at all — so a running box that had just crashed was
        // reported as switched off, with the badge saying CONNECTED beside the message. And the
        // rule bought nothing: the front a real install deploys, server.py, answers 502 when it
        // cannot reach the core — measured. Production was already covered.
        const crashed = new Error('Internal Server Error');
        crashed.status = 500;
        expect(isGatewayError(crashed)).toBe(false);

        const withDetail = new Error('boom');
        withDetail.status = 500;
        withDetail.detail = 'boom';
        expect(isGatewayError(withDetail)).toBe(false);
    });

    it.each([400, 401, 403, 404, 422, 429, 500])('leaves a %i alone', (status) => {
        const err = new Error('HTTP error');
        err.status = status;
        expect(isGatewayError(err)).toBe(false);
    });

    it('claims nothing when no status came back', () => {
        expect(isGatewayError(asNetworkError(new TypeError('Load failed')))).toBe(false);
        expect(isGatewayError(null)).toBe(false);
    });
});

describe('connectionMessage', () => {
    it('names the address that was tried', () => {
        // Naming it is the difference between writing to support and walking over to the machine.
        expect(connectionMessage('192.168.178.84')).toContain('192.168.178.84');
    });

    it('still reads as a sentence when the host is unknown', () => {
        const msg = connectionMessage();
        expect(msg).not.toContain('undefined');
        expect(msg).toContain('Cannot reach Audiogravity');
    });

    it('tells the reader what to do, not what failed', () => {
        expect(connectionMessage('box.local')).toMatch(/powered on/i);
    });
});

describe('throwForStatus — one error shape for every caller', () => {
    const res = (status, body) => ({ ok: false, status, json: async () => { if (body instanceof Error) throw body; return body; } });

    it('turns the service worker\'s synthetic offline 503 back into a transport failure', async () => {
        // sw.js answers a GET that could not leave the device with `503 {"error":"offline"}`
        // instead of letting the browser reject — an iOS quirk. Read as a status it is a lie:
        // nothing answered, and the installed app on a phone must say so like the tab does.
        const err = await throwForStatus(res(503, { error: 'offline', status: 'offline' })).catch(e => e);
        expect(isNetworkError(err)).toBe(true);
        expect(isGatewayError(err)).toBe(false);
    });

    it('keeps a core 503 as what the core said', async () => {
        const err = await throwForStatus(res(503, { detail: 'WebAuthn not available' })).catch(e => e);
        expect(isNetworkError(err)).toBe(false);
        expect(isGatewayError(err)).toBe(false);
        expect(err.detail).toBe('WebAuthn not available');
    });

    it('leaves detail null when the body is not JSON — never statusText', async () => {
        const err = await throwForStatus({ ...res(502, new SyntaxError('html')), statusText: 'Bad Gateway' }).catch(e => e);
        expect(err.detail).toBeNull();
        expect(err.message).toBe('HTTP 502');
        expect(isGatewayError(err)).toBe(true);
    });

    it('reads slowapi\'s wording under `error` as something the server said', async () => {
        // `detail` must carry it too: isGatewayError reads a 503 by whether a message exists,
        // and a 503 worded under `error` was being thrown away as a dead box.
        const err = await throwForStatus(res(429, { error: 'Rate limit exceeded: 5 per 1 minute' })).catch(e => e);
        expect(err.message).toBe('Rate limit exceeded: 5 per 1 minute');
        expect(err.detail).toBe('Rate limit exceeded: 5 per 1 minute');
        const said503 = await throwForStatus(res(503, { error: 'maintenance window' })).catch(e => e);
        expect(isGatewayError(said503)).toBe(false);
    });

    it('marks the service worker\'s offline answer as final — not worth a retry', async () => {
        // Retried three times per call, from every poller on the page, the installed app on a
        // phone hammered a switched-off box the service worker had already given up on.
        const err = await throwForStatus(res(503, { error: 'offline', status: 'offline' })).catch(e => e);
        expect(isNetworkError(err)).toBe(true);
        expect(isRetryableFailure(err)).toBe(false);
        expect(isRetryableFailure(asNetworkError(new TypeError('Failed to fetch')))).toBe(true);
        expect(isRetryableFailure(Object.assign(new Error('x'), { status: 500 }))).toBe(false);
    });

    it('uses the very literal the service worker writes', () => {
        // sw.js cannot import from js/, so this parse is the only link between the two.
        const sw = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sw.js'), 'utf8');
        const m = sw.match(/JSON\.stringify\(\{\s*error:\s*'([a-z]+)'[^}]*\}\),\s*\{\s*status:\s*(\d+)/);
        expect(m, 'the offline answer in sw.js has moved or changed shape').not.toBeNull();
        expect(m[1]).toBe('offline');
        expect(Number(m[2])).toBe(503);
    });

    it('joins a 422 field list into one line and keeps it raw underneath', async () => {
        const err = await throwForStatus(res(422, { detail: [{ loc: ['body', 'username'], msg: 'too short' }, { loc: ['body', 'password'], msg: 'required' }] })).catch(e => e);
        expect(err.detail).toBe('username: too short; password: required');
        expect(err.message).toBe('username: too short; password: required');
        expect(err.validationErrors).toHaveLength(2);
    });
});

describe('readJson', () => {
    it('tags a body read the connection dropped, which a retry can fix', async () => {
        const dropped = { json: async () => { throw new TypeError('The network connection was lost.'); } };
        const err = await readJson(dropped).catch(e => e);
        expect(isNetworkError(err)).toBe(true);
    });

    it('leaves a body that is not JSON alone — no retry will change it', async () => {
        const bad = { json: async () => { throw new SyntaxError('Unexpected token <'); } };
        const err = await readJson(bad).catch(e => e);
        expect(isNetworkError(err)).toBe(false);
        expect(err).toBeInstanceOf(SyntaxError);
    });
});

describe('validationField', () => {
    it('drops the leading body/query and joins the rest', () => {
        expect(validationField({ loc: ['body', 'properties', 'nice'] })).toBe('properties.nice');
        expect(validationField({})).toBe('unknown');
    });
});

describe('fetchOrThrow', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns an ok response untouched', async () => {
        const ok = { ok: true, status: 200 };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok));
        expect(await fetchOrThrow('/x')).toBe(ok);
    });

    it('tags a rejection at the fetch site', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
        const err = await fetchOrThrow('/x').catch(e => e);
        expect(isNetworkError(err)).toBe(true);
    });
});

describe('signInFailureMessage — checked against what the servers really send', () => {
    const opts = { unauthorized: 'Invalid username or password', host: '10.0.4.254' };
    const http = (status, extra = {}) => Object.assign(new Error(`HTTP ${status}`), { status, detail: null }, extra);

    it.each([
        ['server.py with the core stopped — 502, HTML body', http(502)],
        ['nothing answered', asNetworkError(new TypeError('Load failed'))],
        ['a proxy 503 with no message', http(503)],
    ])('%s → names the box and asks for a re-probe', (_n, err) => {
        const r = signInFailureMessage(err, opts);
        expect(r.unreachable).toBe(true);
        expect(r.message).toContain('10.0.4.254');
    });

    it('a running core that crashed → an internal error, not a switched-off box', () => {
        const r = signInFailureMessage(http(500), opts);
        expect(r.unreachable).toBe(false);
        expect(r.message).toMatch(/internal error/);
        expect(r.message).not.toMatch(/powered on/);
    });

    it('six wrong passwords in a minute → the wait, not `HTTP 429`', () => {
        const r = signInFailureMessage(http(429, { message: 'Rate limit exceeded' }), opts);
        expect(r.message).toMatch(/Wait a minute/);
    });

    it('a refused field → a sentence, never the array', () => {
        const r = signInFailureMessage(http(422, { detail: 'username: too short' }), opts);
        expect(r.message).toBe('Check the username you typed, then try again.');
    });

    it('a wrong password keeps the form\'s own line over the core\'s "Invalid credentials"', () => {
        const r = signInFailureMessage(http(401, { detail: 'Invalid credentials' }), opts);
        expect(r.message).toBe('Invalid username or password');
    });

    it('a revoked passkey shows the core\'s sentence when the path asks for it', () => {
        // "Credential not found" tells the reader the passkey was removed on the box; the
        // generic "verification failed" would send them retrying against nothing.
        const r = signInFailureMessage(http(401, { detail: 'Credential not found' }),
            { ...opts, unauthorized: 'Passkey verification failed. Try again.', detailOnUnauthorized: true });
        expect(r.message).toBe('Credential not found');
    });

    it('survives being handed nothing at all', () => {
        expect(signInFailureMessage(undefined, opts).message).toMatch(/Reload the page/);
    });

    it('never shows a bare status line for a status it has no sentence for', () => {
        expect(signInFailureMessage(http(404), opts).message).toBe('The box answered with HTTP 404.');
    });

    it('explains a WebAuthn SecurityError instead of quoting the engine', () => {
        const err = Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' });
        expect(signInFailureMessage(err, opts).message).toMatch(/HTTPS/);
        expect(signInFailureMessage(err, opts).unreachable).toBe(false);
    });

    it('does not read a superseded WebAuthn ceremony as an unreachable box', () => {
        const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
        expect(signInFailureMessage(err, opts).unreachable).toBe(false);
    });
});
