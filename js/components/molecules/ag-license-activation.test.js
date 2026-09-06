/**
 * Unit tests for ag-license-activation.js — the promise the module's own JSDoc makes:
 * "if the license server is temporarily unreachable, the key is persisted in
 * localStorage so the user does not have to re-enter it on retry".
 *
 * Nothing pinned that promise, and it broke: the licence server answers 502 with a
 * sentence of its own, `isGatewayError` rightly stopped calling such an answer a
 * gateway failure, and the key stopped being kept — nineteen characters to retype
 * after a reload, silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost, apiDelete: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showToast: vi.fn() }));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

import { asNetworkError } from '../../net-errors.js';
import { AgLicenseActivation } from './ag-license-activation.js';

const STORAGE_KEY = 'ag_pending_license_key';
const KEY = 'AG-1234-5678-9ABC-DEF0';

/** A bare instance with just what the two handlers touch. */
function makeEl() {
    const el = Object.create(AgLicenseActivation.prototype);
    el._key = KEY;
    el._hostname = '';
    el._checkError = null;
    el._activateError = null;
    el._activating = false;
    el._checking = false;
    el._step = 2;
    el._spinnerMsg = '';
    el.updateComplete = Promise.resolve();
    el.dispatchEvent = vi.fn();
    return el;
}

/** The error shape `throwForStatus` builds: message from the detail, status beside it. */
function httpError(status, detail = null) {
    return Object.assign(new Error(detail || `HTTP ${status}`), { status, detail });
}

beforeEach(() => {
    apiPost.mockReset();
    localStorage.clear();
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
});

describe('the pending key survives a transient licence-server failure', () => {

    it.each([
        [503, 'License server unreachable.'],
        [502, 'License server error.'],
        [502, 'License server returned no license content.'],
        [502, 'License server returned malformed license content.'],
    ])('keeps the key on %i — %s', async (status, detail) => {
        // 502 and 503 are one failure family on this route. Splitting them left the
        // 503 keeping the key and the 502 dropping it, with no reason behind it.
        apiPost.mockRejectedValue(httpError(status, detail));

        await AgLicenseActivation.prototype._handleActivate.call(makeEl());

        expect(localStorage.getItem(STORAGE_KEY)).toBe(KEY);
    });

    it('does NOT keep the key when the licence is already used elsewhere', async () => {
        // A 409 is final: retrying with the same key answers 409 again.
        apiPost.mockRejectedValue(httpError(409, 'Already activated'));

        const el = makeEl();
        await AgLicenseActivation.prototype._handleActivate.call(el);

        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        expect(el._activateError).toContain('already activated');
    });

    it('clears the key once the activation succeeds', async () => {
        localStorage.setItem(STORAGE_KEY, KEY);
        apiPost.mockResolvedValue({ status: 'active' });

        await AgLicenseActivation.prototype._handleActivate.call(makeEl());

        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
});

describe('step 1 says what the licence server said', () => {

    it('relays the reason rather than claiming it could not be reached', async () => {
        // The route answers 502 with its own sentence. A bare catch reported the
        // server unreachable while it had answered and named the cause.
        apiPost.mockRejectedValue(httpError(502, 'License server error.'));

        const el = makeEl();
        await AgLicenseActivation.prototype._handleCheck.call(el);

        expect(el._checkError).toBe('License server error.');
    });

    it('still says "could not reach" when nothing answered', async () => {
        // Built by the real tagger, not by hand: the shape is net-errors.js's to
        // define, and a fabricated one would pass while the component never saw it.
        apiPost.mockRejectedValue(asNetworkError(new TypeError('Load failed')));

        const el = makeEl();
        await AgLicenseActivation.prototype._handleCheck.call(el);

        expect(el._checkError).toContain('Could not reach the license server');
    });
});
