import { html } from 'lit';
import './ag-license-status.js';

export default {
    title: 'Molecules/LicenseStatus',
    component: 'ag-license-status',
};

// Stories use a mock: override apiGet via window for Storybook
const withMockStatus = (statusPayload) => {
    window.__licenseStatusMock = statusPayload;
    return html`<ag-license-status></ag-license-status>`;
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
