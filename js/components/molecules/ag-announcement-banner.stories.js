import { html } from 'lit';
import { AgAnnouncementBanner } from './ag-announcement-banner.js';

export default {
    title: 'Molecules/AnnouncementBanner',
    component: 'ag-announcement-banner',
};

const _wrap = (inner) => html`
    <div style="padding: 20px; max-width: 600px; background: var(--bg-primary);">
        ${inner}
    </div>
`;

/** Renders the banner with pre-seeded announcements (bypasses the API call). */
const Template = (announcements) => {
    const el = new AgAnnouncementBanner();
    el._announcements = announcements;
    el._dismissed = new Set();
    return _wrap(el);
};

export const VersionAnnouncement = () => Template([
    { id: '1', type: 'version', title: 'v0.9.5 available', body: 'Audio reliability hardening, HQPlayer fixes & security patches.', url: 'https://audiogravity.app' },
]);

export const PromoAnnouncement = () => Template([
    { id: '2', type: 'promo', title: 'Black Friday — 30% off lifetime licences', body: 'Until 2 December.', url: 'https://audiogravity.app' },
]);

export const AlertAnnouncement = () => Template([
    { id: '3', type: 'alert', title: 'Scheduled maintenance 2026-07-01 02:00 UTC', body: 'The licence server will be unavailable for ~5 minutes.', url: null },
]);

export const InfoAnnouncement = () => Template([
    { id: '4', type: 'info', title: 'New documentation available', body: null, url: 'https://audiogravity.app/docs' },
]);

export const MultipleAnnouncements = () => Template([
    { id: '5', type: 'version', title: 'v0.9.5 available', body: 'Audio reliability hardening.', url: 'https://audiogravity.app' },
    { id: '6', type: 'promo', title: 'Black Friday — 30% off', body: null, url: null },
    { id: '7', type: 'alert', title: 'Maintenance window tonight', body: null, url: null },
]);

export const NoAnnouncements = () => Template([]);
