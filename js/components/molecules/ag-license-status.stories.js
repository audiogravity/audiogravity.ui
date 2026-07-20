import './ag-license-status.js';

export default {
    title: 'Molecules/LicenseStatus',
    component: 'ag-license-status',
};

/**
 * Render the card on a fixed state, with no backend.
 *
 * The component fetches three endpoints on connect (`/license/status`,
 * `/license/public-config`, `/license/online-status`). Neutralising them on the
 * INSTANCE before it is mounted is what makes the story deterministic: seeding
 * the state alone is not enough, because connectedCallback would immediately
 * overwrite it with failed requests.
 *
 * This story used to set `window.__licenseStatusMock`, a hook the component no
 * longer reads — so it silently rendered "No license", "Server: undefined" and
 * an empty Device ID while still looking like a working story.
 *
 * @param {object} statusPayload - The /license/status payload to display.
 * @param {object} [online] - Optional /license/online-status payload.
 * @returns {HTMLElement}
 */
const withMockStatus = (statusPayload, online = { status: 'valid' }) => {
    const el = document.createElement('ag-license-status');
    el._fetchStatus       = async () => {};
    el._fetchPublicConfig = async () => {};
    el._fetchOnlineStatus = async () => {};
    el._loading      = false;   // the constructor starts at true
    el._status       = statusPayload;
    el._onlineStatus = online;
    el._price        = '149 €';
    el._upgradePrice = '99 €';
    el._paypalUrl    = 'https://www.paypal.com/paypalme/audiogravity';
    el._portalUrl    = 'https://audiogravity.app/portal';
    el._contactEmail = 'contact@audiogravity.app';
    return el;
};

export const TrialActive = () => withMockStatus({
    status: 'trial',
    days_remaining: 22,
    device_id: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    message: 'Trial license: 22 day(s) remaining.',
    issued: null,
});

export const Lifetime = () => withMockStatus({
    status: 'lifetime',
    days_remaining: null,
    device_id: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    message: 'Lifetime license active.',
    issued: '2026-04-25T10:00:00+00:00',
});

export const Expired = () => withMockStatus({
    status: 'expired',
    days_remaining: 0,
    device_id: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    message: 'Trial expired. Please purchase a lifetime license.',
    issued: null,
});

export const Tampered = () => withMockStatus({
    status: 'tampered',
    days_remaining: null,
    device_id: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    message: 'Trial tampering detected. Please contact support.',
    issued: null,
});
