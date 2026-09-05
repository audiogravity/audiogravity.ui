/**
 * @module NetErrors
 * @description The one place that decides what a failed request means.
 *
 * Two facts shape everything here. A transport failure can only be recognised where the
 * request was made — every engine words it differently, and a `TypeError` raised later in
 * a caller's own code says nothing about the network — so the fetch site tags it and every
 * reader asks. And a status alone does not say whether the *application* answered: a proxy
 * fronting a stopped core says 502 with an HTML body, a crashed core says 500 in plain text,
 * and only the presence of a message the server actually wrote tells them apart.
 */

// ── Predicates ─────────────────────────────────────────────────────────────────────────────

/**
 * Tag a rejection as "nothing answered". Call it in the `catch` around a `fetch`, nowhere wider.
 *
 * @param {unknown} error - Whatever was rejected.
 * @param {{ retryable?: boolean }} [opts] - `retryable: false` when the device already knows
 *   the network is gone and a second attempt would only cost the box.
 * @returns {Error} The same error, tagged.
 */
export function asNetworkError(error, { retryable = true } = {}) {
    const tagged = error instanceof Error ? error : new Error(String(error));
    tagged.isNetwork = true;
    if (!retryable) tagged.retryable = false;
    return tagged;
}

/**
 * Did the request fail before anything answered?
 *
 * A status wins over the tag: something answered. Nothing is inferred from the error's name —
 * `AbortError` in particular is what a WebAuthn ceremony rejects with when another supersedes
 * it, on a box that answered perfectly well.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isNetworkError(error) {
    if (!error || typeof error !== 'object') return false;
    if (typeof error.status === 'number') return false;
    return error.isNetwork === true;
}

/**
 * Is a second attempt worth anything? Only for a transport failure the device has not
 * already settled — the service worker's offline answer is final for as long as it lasts.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isRetryableFailure(error) {
    return isNetworkError(error) && error.retryable !== false;
}

/** Statuses only something in front of the core returns — with one exception, below. */
const GATEWAY_ONLY_STATUSES = new Set([502]);

/**
 * Did something answer *for* the core because the core did not?
 *
 * 502 always. 503 and 504 only when they carry no message — the same discriminator for both,
 * because the core uses both to say things a reader can act on and `catalogueErrorMessage` in
 * components/utils-lit.js shows their detail verbatim.
 *
 * 504 used to be listed as a status the core never returns. That was already untrue — the
 * HIGHRESAUDIO advanced search has always answered 504 when the catalogue took too long — and
 * from 0.9.52 every streaming shelf does.
 *
 * ⚠️ **No screen was showing the wrong sentence because of it**, and it is worth writing down
 * so nobody "fixes" this twice: the shelves reach the reader through `loadWithState`, which
 * shows `error.message`, and `throwForStatus` builds that message from the core's own detail.
 * The correction here is about not classifying a status by a rule that has stopped being true —
 * this function feeds licence, passkey and activation screens, and one of those gaining a
 * core-worded 504 would have been told to check its network. A gateway's own 504 carries no
 * body, so the absence of a detail still tells the two apart.
 *
 * 500 never: a running core that crashed answers 500 with no message, and that is a box to
 * report, not a box to switch on. The front a real install deploys answers 502 when the core
 * is stopped, so nothing is lost by leaving 500 alone.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isGatewayError(error) {
    if (!error || typeof error !== 'object') return false;
    if (GATEWAY_ONLY_STATUSES.has(error.status)) return true;
    return (error.status === 503 || error.status === 504) && !error.detail;
}

/**
 * The sentence for a box that could not be reached, naming the address that was tried.
 *
 * @param {string} [host] - `window.location.hostname` on the page that tried.
 * @returns {string}
 */
export function connectionMessage(host) {
    const where = host ? ` at ${host}` : '';
    return `Cannot reach Audiogravity${where}. Check that the box is powered on and on your network.`;
}

// ── The fetch boundary ─────────────────────────────────────────────────────────────────────

/** The body the service worker substitutes when a request could not leave the device. */
const OFFLINE_MARKER = 'offline';

/**
 * Dotted field name from one FastAPI validation error, minus the leading `body`/`query`.
 *
 * @param {{ loc?: Array<string|number> }} err
 * @returns {string}
 */
export function validationField(err) {
    return err?.loc ? err.loc.slice(1).join('.') : 'unknown';
}

/**
 * `fetch` with a transport failure tagged. The Response comes back whatever its status.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function fetchOrNetworkError(url, options) {
    try {
        return await fetch(url, options);
    } catch (transport) {
        throw asNetworkError(transport);
    }
}

/**
 * Read a JSON body, telling a connection that dropped mid-body from a body that is not JSON.
 *
 * A core restarting under a long GET closes the socket after the headers: the browser rejects
 * the body read with a `TypeError`, which is a transport failure and worth one retry. A
 * `SyntaxError` is a server that answered with something else, and no retry will change it.
 *
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function readJson(response) {
    try {
        return await response.json();
    } catch (err) {
        if (err instanceof TypeError) throw asNetworkError(err);
        throw err;
    }
}

/**
 * Turn a non-ok Response into the one Error every reader expects.
 *
 * - `status`: always.
 * - `detail`: what the server said, as a string, or `null` — never a fabricated `statusText`,
 *   never an array. A 422's field list is joined into one line and kept raw under
 *   `validationErrors`. slowapi words a rate limit under `error`; that counts as said.
 * - `message`: `detail`, else `HTTP <status>`.
 *
 * The service worker's `503 {"error":"offline"}` is not a status, it is the device saying the
 * request never left: it becomes a tagged, non-retryable transport failure, so the installed
 * app reports a switched-off box the way a browser tab does — once, not three times.
 *
 * @param {Response} response - With `ok === false`.
 * @returns {Promise<never>}
 */
export async function throwForStatus(response) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 503 && body?.error === OFFLINE_MARKER) {
        throw asNetworkError(new Error(OFFLINE_MARKER), { retryable: false });
    }
    let detail = null;
    let validationErrors;
    if (typeof body?.detail === 'string') {
        detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
        validationErrors = body.detail;
        detail = body.detail.map(e => `${validationField(e)}: ${e?.msg ?? ''}`).join('; ');
    } else if (typeof body?.error === 'string') {
        detail = body.error;
    }
    const error = new Error(detail || `HTTP ${response.status}`);
    error.status = response.status;
    error.detail = detail;
    if (validationErrors) error.validationErrors = validationErrors;
    throw error;
}

/**
 * `fetch` that returns an ok Response or throws in the shape above.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function fetchOrThrow(url, options) {
    const response = await fetchOrNetworkError(url, options);
    if (!response.ok) await throwForStatus(response);
    return response;
}

/**
 * `fetchOrThrow` followed by `readJson`.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, options) {
    return readJson(await fetchOrThrow(url, options));
}

// ── Sign-in ────────────────────────────────────────────────────────────────────────────────

/**
 * What to tell someone whose sign-in failed, and whether the box was reachable at all.
 *
 * Pure: the caller re-probes the connection when `unreachable` is true. Tested against the
 * responses the servers really send.
 *
 * @param {unknown} error - What the sign-in call threw.
 * @param {object} opts
 * @param {string} opts.unauthorized - What to say when the box refused (differs per path).
 * @param {string} [opts.host] - Named in the unreachable case.
 * @param {boolean} [opts.detailOnUnauthorized=false] - Prefer the server's own 401 sentence.
 *   Off for the password form; on for passkeys, where "Credential not found" says the passkey
 *   was revoked on the box, which the generic line hides.
 * @returns {{ message: string, unreachable: boolean }}
 */
export function signInFailureMessage(error, { unauthorized, host, detailOnUnauthorized = false }) {
    const e = error && typeof error === 'object' ? error : {};
    if (isNetworkError(e) || isGatewayError(e)) {
        return { message: connectionMessage(host), unreachable: true };
    }
    const detail = typeof e.detail === 'string' ? e.detail : null;
    let message;
    switch (e.status) {
        case 429: message = 'Too many sign-in attempts. Wait a minute, then try again.'; break;
        case 401: message = (detailOnUnauthorized && detail) || unauthorized; break;
        case 403: message = 'Access denied. Check your API key.'; break;
        case 422: message = 'Check the username you typed, then try again.'; break;
        case 500: message = detail || 'The box answered with an internal error. If it persists, send a support report.'; break;
        default:
            if (typeof e.status === 'number') {
                message = detail || `The box answered with HTTP ${e.status}.`;
            } else if (e.name === 'SecurityError') {
                // WebAuthn refuses a relying-party ID that does not match the address — the
                // usual case is a box opened by raw IP over plain HTTP.
                message = 'Passkeys are not available at this address. Open Audiogravity over HTTPS by its name, or sign in with your password.';
            } else {
                message = 'Sign-in failed before the box answered. Reload the page and try again.';
            }
    }
    return { message, unreachable: false };
}
