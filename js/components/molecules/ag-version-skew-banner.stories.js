import { html } from 'lit';
import { AgVersionSkewBanner } from './ag-version-skew-banner.js';

export default {
    title: 'Molecules/VersionSkewBanner',
    component: 'ag-version-skew-banner',
};

const _wrap = (inner) => html`
    <div style="padding: 20px; max-width: 600px; background: var(--bg-primary);">
        ${inner}
    </div>
`;

/** Renders the banner with a pre-seeded core version (bypasses the API call). */
const Template = (coreVersion) => {
    const el = new AgVersionSkewBanner();
    el._coreVersion = coreVersion;
    return _wrap(el);
};

// UI_VERSION is 0.9.x — a 0.10.x core is a mismatch.
export const Mismatch = () => Template('0.10.0');

// Same major.minor as the UI → renders nothing.
export const Matched = () => Template('0.9.11');
