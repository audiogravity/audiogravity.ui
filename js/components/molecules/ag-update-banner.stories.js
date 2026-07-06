import { html } from 'lit';
import { AgUpdateBanner } from './ag-update-banner.js';

export default {
    title: 'Molecules/UpdateBanner',
    component: 'ag-update-banner',
};

const _wrap = (inner) => html`
    <div style="padding: 20px; max-width: 600px; background: var(--bg-primary);">
        ${inner}
    </div>
`;

/** Renders the banner with a pre-seeded update payload (bypasses the API call). */
const Template = (update) => {
    const el = new AgUpdateBanner();
    el._update = update;
    return _wrap(el);
};

export const UpdateAvailable = () => Template({
    available: true, latest: '0.9.11', mandatory: false,
    notes_url: 'https://audiogravity.app/releases',
});

export const MandatoryUpdate = () => Template({
    available: true, latest: '0.9.12', mandatory: true,
    notes_url: 'https://audiogravity.app/releases',
});

export const NoReleaseNotes = () => Template({
    available: true, latest: '0.9.11', mandatory: false, notes_url: null,
});

export const NoUpdate = () => Template({ available: false });

/** Renders the in-progress state (bypasses the API call and the trigger flow). */
const Progress = (phase) => {
    const el = new AgUpdateBanner();
    el._updating = true;
    el._phase = phase;
    return _wrap(el);
};

export const Installing = () => Progress('installing');
export const Verifying = () => Progress('verifying');
