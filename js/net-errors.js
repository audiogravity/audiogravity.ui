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
