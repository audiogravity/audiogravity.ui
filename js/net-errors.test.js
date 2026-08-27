import { describe, it, expect } from 'vitest';
import { asNetworkError, isNetworkError, isGatewayError, connectionMessage } from './net-errors.js';

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

    it('treats our own timeout as nothing having answered', () => {
        // checkConnectivity aborts after 3 s. To the person waiting, an abort and an unreachable
        // host are the same event.
        const abort = new Error('The operation was aborted.');
        abort.name = 'AbortError';
        expect(isNetworkError(abort)).toBe(true);
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
