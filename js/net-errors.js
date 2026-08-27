/**
 * @module NetErrors
 * @description Telling "nothing answered" apart from "something answered, and said no".
 *
 * The distinction matters because the two need opposite reactions from the reader: one sends
 * them to look at the machine, the other to look at what they typed. Getting it backwards is
 * not a cosmetic slip — a box that was switched off told its owner the password was wrong, on
 * an iPhone and an iPad, while the page's own `API · OFFLINE` badge said the truth two
 * centimetres above the message.
 *
 * That first version read the browser's error *text*, and the sentence differs per engine:
 * `Failed to fetch` in Chromium, `NetworkError when attempting to fetch resource.` in Gecko,
 * `Load failed` in WebKit. The list missed WebKit's, and `includes('failed')` matched it into
 * *Invalid username or password*.
 *
 * The obvious repair — treat any `TypeError` as unreachable — trades one guess for another, and
 * it was measured to be worse: `FetchController` wraps its own `onSuccess` callback in the same
 * `try` as the request, so a `data.items.map` on a payload without `items`, after a perfectly
 * successful 200, came out as "Unable to connect to server". A `TypeError` says something about
 * the code, nothing about the network.
 *
 * **Only the code that performed the fetch knows whether the failure was transport.** So it
 * says so, at the point where it knows: {@link asNetworkError} tags the rejection, and every
 * reader downstream asks {@link isNetworkError} instead of guessing. Nothing infers, nothing
 * reads wording, and a `TypeError` raised three call frames later stays what it is.
 */

/**
 * Tag a rejection as "the request never reached anything".
 *
 * Call it in the `catch` that wraps a `fetch` — and nowhere else. Wrapping anything wider
 * re-creates the very over-capture this module exists to stop.
 *
 * @param {unknown} error - Whatever `fetch` rejected with.
 * @returns {Error} The same error, tagged, ready to re-throw.
 */
export function asNetworkError(error) {
    const tagged = error instanceof Error ? error : new Error(String(error));
    tagged.isNetwork = true;
    return tagged;
}

/**
 * Did this failure happen before anything answered?
 *
 * @param {unknown} error - Whatever was caught.
 * @returns {boolean} True only when the fetch boundary said so, or when our own timeout fired.
 */
export function isNetworkError(error) {
    if (!error || typeof error !== 'object') return false;
    // Something answered — whatever it answered. This is the one certain signal, and it comes
    // first so a tagged-but-answered error could never be read as unreachable.
    if (typeof error.status === 'number') return false;
    if (error.isNetwork === true) return true;
    // Our own deadline elapsing is, to the person waiting, the same event as nothing being
    // there. Compared by name rather than with `instanceof`, which fails across realms.
    return error.name === 'AbortError';
}

/** Statuses no part of the core ever returns, so they can only come from something in front. */
const GATEWAY_ONLY_STATUSES = new Set([502, 504]);

/**
 * Did a gateway answer on the core's behalf, because the core did not?
 *
 * This is the shape of the commonest outage in production: the web server keeps serving the
 * interface while the core behind it is stopped, so the request *is* answered — with a 502 whose
 * HTML body makes `response.json()` throw, leaving a generic message and a status. Not a
 * transport failure by any technical reading, and exactly the same thing for the reader: the box
 * is there, the software is not.
 *
 * **500 is deliberately not here, and the reason is the more useful half of this comment.** An
 * earlier version of this module claimed every detail-less 5xx as a dead box, on the strength of
 * one measurement: this project's Vite dev server answers 500 with an empty body when the core is
 * stopped. That generalisation was wrong twice over. The core does *not* always word its errors
 * under `detail` — only `HTTPException` does; an unhandled exception reaches Starlette's
 * `ServerErrorMiddleware`, which answers `PlainTextResponse("Internal Server Error", 500)` with no
 * JSON at all (read in starlette, not assumed). So a core that is running and has just crashed in
 * a handler was announced as "check that the box is powered on", while the badge beside the
 * message said CONNECTED — the exact contradiction this module was written to end, inverted.
 *
 * And the generalisation bought nothing where it matters: the front a real install deploys,
 * `audiogravity-ui/server.py`, answers **502** when it cannot reach the core — measured against an
 * isolated copy of it. Production was already covered. The 500 rule only ever served a dev server,
 * at the price of lying about a live box. A 500 now shows what the server said, which for a
 * crashed core is a bug worth reporting rather than a machine worth walking to.
 *
 * 503 keeps its detail test, in the other direction: the core uses it to say things a reader can
 * act on — `WebAuthn not available`, on the sign-in path — while a proxy's 503 carries HTML and
 * leaves none. `catalogueErrorMessage` in components/utils-lit.js already reads a 503 that way,
 * verbatim; two helpers reading one status in opposite directions is how a codebase starts lying
 * to its user.
 *
 * @param {unknown} error - Whatever was caught.
 * @returns {boolean} True for 502 and 504, and for a 503 that carries no message of its own.
 */
export function isGatewayError(error) {
    if (!error || typeof error !== 'object') return false;
    if (GATEWAY_ONLY_STATUSES.has(error.status)) return true;
    return error.status === 503 && !error.detail;
}

/**
 * The sentence shown when the box could not be reached, whichever of the two ways.
 *
 * Names the address that was tried. The login page knows it — it prints it in its own header —
 * and naming it is what turns "it does not work" into something the reader can act on: the
 * difference between writing to support and walking over to look at the machine.
 *
 * @param {string} [host] - Host the page was served from, e.g. `window.location.hostname`.
 * @returns {string} A message for a person, not for a log.
 */
export function connectionMessage(host) {
    const where = host ? ` at ${host}` : '';
    return `Cannot reach Audiogravity${where}. Check that the box is powered on and on your network.`;
}

// ── The fetch boundary ──────────────────────────────────────────────────────────────────────
//
// Everything above only works if the tag is set at the fetch site, and the first version had
// that `try { fetch } catch → asNetworkError` block written three times verbatim, next to four
// different ways of building an Error from a Response — three of them disagreeing on what
// `detail` means. The consequences were measured, not imagined: the password form and the
// passkey panel answered the same outage with different sentences; `apiCall` always set a detail,
// so a rule written on "no detail" could never fire for the main client; a 422 reached the screen
// as `[object Object]`. One boundary, used everywhere, is what makes the predicates honest.

/**
 * `fetch`, with a transport failure tagged as it is thrown.
 *
 * Nothing else changes: the Response comes back whatever its status, so a caller that needs to
 * look at the status before deciding anything (the keyless probe in api.js) still can.
 *
 * @param {string} url - Absolute or same-origin URL.
 * @param {RequestInit} [options] - Passed to `fetch` untouched.
 * @returns {Promise<Response>} The response, ok or not.
 * @throws {Error} Tagged with `isNetwork` when nothing answered.
 */
export async function fetchOrNetworkError(url, options) {
    try {
        return await fetch(url, options);
    } catch (transport) {
        throw asNetworkError(transport);
    }
}

/**
 * Turn a non-ok Response into the one Error shape every reader in this codebase expects.
 *
 * - `status`: the HTTP status, always.
 * - `detail`: what the server *said*, as a string, or `null` when it said nothing — never a
 *   fabricated `statusText`, never an array. A 422's array of field errors is joined into one
 *   readable line, and kept raw under `validationErrors` for forms that want the fields.
 * - `message`: `detail`, else the body's `error` (slowapi words a rate limit there), else
 *   `HTTP <status>`.
 *
 * One response is special-cased, and it is ours. The service worker answers a GET that could
 * not leave the device with a synthetic `503 {"error":"offline"}` rather than letting the
 * browser reject — an iOS quirk. Read as an HTTP status it is a lie: nothing answered. It is
 * turned back into the tagged transport failure it stands for, so the installed app on a phone
 * reports a switched-off box the same way the browser tab does.
 *
 * @param {Response} response - A response with `ok === false`.
 * @returns {Promise<never>} Always throws.
 */
export async function throwForStatus(response) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 503 && body?.error === 'offline') {
        throw asNetworkError(new Error('offline'));
    }
    let detail = null;
    let validationErrors;
    if (typeof body?.detail === 'string') {
        detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
        validationErrors = body.detail;
        detail = body.detail
            .map(e => `${e?.loc ? e.loc.slice(1).join('.') : 'unknown'}: ${e?.msg ?? ''}`)
            .join('; ');
    }
    const fromError = typeof body?.error === 'string' ? body.error : null;
    const error = new Error(detail || fromError || `HTTP ${response.status}`);
    error.status = response.status;
    error.detail = detail;
    if (validationErrors) error.validationErrors = validationErrors;
    throw error;
}

/**
 * `fetch` that either returns an ok Response or throws in the shape above.
 *
 * @param {string} url - Absolute or same-origin URL.
 * @param {RequestInit} [options] - Passed to `fetch` untouched.
 * @returns {Promise<Response>} A response with `ok === true`.
 */
export async function fetchOrThrow(url, options) {
    const response = await fetchOrNetworkError(url, options);
    if (!response.ok) await throwForStatus(response);
    return response;
}

// ── Sign-in ─────────────────────────────────────────────────────────────────────────────────

/**
 * What to tell someone whose sign-in just failed, and whether the box was reachable at all.
 *
 * Pure on purpose. It used to live in login.js and fire the connectivity re-probe itself, which
 * put a side effect inside a function documented as returning a string — and kept it out of
 * reach of any test that did not load the whole login page. The caller now reads `unreachable`
 * and re-probes, and this table is tested against the responses the servers really send.
 *
 * @param {unknown} error - What the sign-in call threw.
 * @param {object} opts
 * @param {string} opts.unauthorized - What to say when the box refused (differs per path).
 * @param {string} [opts.host] - Host the page was served from, named in the unreachable case.
 * @param {boolean} [opts.detailOnUnauthorized=false] - Prefer the server's own 401 sentence when
 *   it has one. Off for the password form, whose fixed line reads better than "Invalid
 *   credentials"; on for passkeys, where "Credential not found" tells the reader the passkey was
 *   revoked on the box, which the generic line hides.
 * @returns {{ message: string, unreachable: boolean }}
 */
export function signInFailureMessage(error, { unauthorized, host, detailOnUnauthorized = false }) {
    const e = error && typeof error === 'object' ? error : {};
    // Two different failures, one meaning for the reader: nothing usable answered. The second is
    // the commonest outage in production — the web server keeps serving the page while the core
    // behind it is stopped, so the request is answered, with a 502 nobody can act on.
    if (isNetworkError(e) || isGatewayError(e)) {
        return { message: connectionMessage(host), unreachable: true };
    }
    const detail = typeof e.detail === 'string' ? e.detail : null;
    let message;
    switch (e.status) {
        // The core allows five attempts a minute. Six wrong passwords is exactly what someone does
        // when they think they are mistyping, and `HTTP 429` named the rule without stating it.
        case 429: message = 'Too many sign-in attempts. Wait a minute, then try again.'; break;
        case 401: message = (detailOnUnauthorized && detail) || unauthorized; break;
        case 403: message = 'Access denied. Check your API key.'; break;
        // A field refused before it was looked at: a username under three characters on the
        // passkey route, over fifty on the password one. The detail is written for a developer.
        case 422: message = 'Check the username you typed, then try again.'; break;
        // The box is running and something in it threw. An unhandled error reaches Starlette,
        // which answers plain text with no message — but "there and broken" is a different
        // sentence from "off", and needs a different action.
        case 500: message = detail || 'The box answered with an internal error. If it persists, send a support report.'; break;
        default: message = detail || e.message || unauthorized;
    }
    return { message, unreachable: false };
}
