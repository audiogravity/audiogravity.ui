/**
 * @module core/credentials
 * @description What this client knows about its ability to talk to the core.
 *
 * Deliberately dependency-free apart from config: coverUrl (rendered by dozens of
 * components) and api.js both need this answer, and routing it through api.js dragged
 * common.js — whose import redirects to the login page — into every module that sizes a
 * cover. State lives here; signalling (toast, connection indicator) stays in api.js,
 * which owns the request cycle.
 */
import { API_KEY } from './config.js';

/**
 * What a keyless client has learned about this core: null (nothing yet), 'open'
 * (SECURITY_ENABLED=false — the server answered a protected request without a key), or
 * 'locked' (the server said 403). Per tab, so a reload does not re-probe.
 * @type {string|null}
 */
let _keylessVerdict = null;
try { _keylessVerdict = sessionStorage.getItem('ag-keyless-verdict'); } catch { /* private mode */ }

/**
 * Whether requests and URL-based transports (EventSource, <img>) may talk to the core.
 *
 * True with a key, and true keyless once the server has proven it does not require one.
 * Everything else — including a leftover JWT with no key — is false: the middleware
 * checks ONLY the API key (verified against core/auth.py), so a JWT alone buys a
 * guaranteed 403, which is precisely the storm this layer prevents.
 *
 * @returns {boolean}
 */
export function hasCoreCredentials() {
    return Boolean(API_KEY) || _keylessVerdict === 'open';
}

/** @returns {boolean} the core has confirmed it refuses keyless requests */
export function isKeylessLocked() {
    return _keylessVerdict === 'locked';
}

/**
 * Record what the probe learned. Persisted per tab.
 * @param {'open'|'locked'} verdict
 */
export function recordKeylessVerdict(verdict) {
    _keylessVerdict = verdict;
    try { sessionStorage.setItem('ag-keyless-verdict', verdict); } catch { /* private mode */ }
}
