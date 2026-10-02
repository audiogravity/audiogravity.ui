import { html } from 'lit';
import { AgUpdateBanner, updateFailureText } from './ag-update-banner.js';

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
    // Stub the connect-time fetch: Storybook's fetch mock answers with an empty
    // payload, which would otherwise clear the pre-seeded update on mount.
    el._load = async () => {};
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

/** After an update the box turned down: the reason it gave stays under the banner. */
export const FailedWithReason = () => {
    const el = new AgUpdateBanner();
    el._load = async () => {};
    el._update = {
        available: true, latest: '0.9.65', mandatory: false,
        notes_url: 'https://audiogravity.app/releases',
    };
    el._failure = updateFailureText('rolled_back',
        'This system (Debian GNU/Linux 12 (bookworm)) has glibc 2.36; this core needs 2.38 or later. '
        + 'Audiogravity requires Debian 13 (Trixie) or later — DietPi and Raspberry Pi OS included, '
        + 'in their Trixie-based release. The installed version is left as it is.');
    return _wrap(el);
};

/** Renders the in-progress state (bypasses the API call and the trigger flow). */
const Progress = (phase) => {
    const el = new AgUpdateBanner();
    el._load = async () => {};
    el._updating = true;
    el._phase = phase;
    return _wrap(el);
};

export const Installing = () => Progress('installing');
export const Verifying = () => Progress('verifying');
