/**
 * @module ApiDocs
 * @description Whether this core serves its interactive API reference, and how to open it.
 *
 * The reference (`/docs`, backed by `/openapi.json`) is a setting on the box, off by
 * default: those routes answer without an API key — Swagger fetches the schema from the
 * browser with no header of its own — so a core that left them on would serve the map of
 * its whole API to anything on the network. An owner may switch them on; the interface
 * has to follow, and offering a button that leads to a 404 is worse than offering none.
 *
 * The answer comes from `/` rather than a flag of its own: that route already lists the
 * endpoints the core serves, and `docs` is simply absent when the routes are not mounted.
 * Two callers, and they reach it differently. The configuration panel already fetches `/`
 * for the version it displays, so it derives the URL from the answer it holds — a second
 * request for a field it has in hand would be waste. The footer has no such call and asks
 * for one, shared through the memo below. Only a real answer is kept: a lookup that failed
 * because the core was still starting must not hide the button for the life of the page.
 */

// Named from their own modules rather than re-exported through common.js. That is
// tidiness, not isolation: api.js itself imports common.js, whose module body enforces the
// authentication lock and throws on an unauthenticated page. Importing this file therefore
// carries the same weight as importing the API client — which every caller does anyway.
import { API_BASE_URL } from './core/config.js';
import { apiGet } from './api.js';

/** In-flight lookup, or a settled one that actually reached the core. */
let pending = null;

/**
 * The absolute URL of the Swagger page, or null when this core does not serve it.
 *
 * Never rejects: a core that cannot be reached is reported as serving no reference,
 * which is the state the interface should render anyway.
 *
 * @returns {Promise<string|null>}
 */
export function apiDocsUrl() {
    // Without the retry layer: three attempts and three seconds of backoff against a box
    // that is already not answering, for a button. The caller re-asks when it makes sense.
    pending ??= apiGet('/', false)
        .then(docsUrlFrom)
        .catch(err => {
            // Not remembered: a core that was still starting, or a network blip, would
            // otherwise hide the reference for the life of the page.
            pending = null;
            throw err;
        })
        .catch(() => null);
    return pending;
}

/**
 * The URL of the reference given an answer from `/`, or null when it names no `docs`.
 *
 * Exported so a caller that already holds that answer — the configuration panel, which
 * fetches `/` for the version — can read it without a second request. The path is taken
 * as the core reports it and nothing is appended: FastAPI writes the schema's address
 * into the page it serves, so a `?url=` of our own is read by no one. The code this
 * module replaces carried one; it was inert there too, which the box confirms.
 *
 * @param {{endpoints?: {docs?: string}}|null|undefined} info - The answer from `/`.
 * @returns {string|null}
 */
export function docsUrlFrom(info) {
    const docs = info?.endpoints?.docs;
    if (!docs) return null;
    const base = API_BASE_URL.startsWith('http')
        ? API_BASE_URL
        : window.location.origin + API_BASE_URL;
    return `${base}${docs}`;
}

/**
 * Forget the memoised answer, so the next call asks again. For tests: nothing in the
 * application calls it, and a core whose setting is flipped while a page is open is
 * therefore not followed until that page next asks.
 */
export function resetApiDocsUrl() {
    pending = null;
}

/**
 * Open the reference — in the application's modal when there is one, in a tab otherwise.
 *
 * @param {string} url - As returned by apiDocsUrl().
 */
export function openApiDocs(url) {
    if (!url) return;
    const modal = document.getElementById('agDocsModal');
    if (modal) modal.open('API Reference (Swagger)', url);
    else window.open(url, '_blank');
}
