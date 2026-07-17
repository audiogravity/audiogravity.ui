import { html } from 'lit';
import './ag-audio-stack-provisioning.js';
import { DEMO_OUTPUTS, DEMO_SOURCES } from './audio-stack-demo-data.js';

export default {
    title: 'Organisms/AudioStackProvisioning',
    component: 'ag-audio-stack-provisioning',
};

// The component self-fetches /audio-stack/status on connect; in Storybook there is
// no backend, so the bare story renders its loading/empty states. These stories
// document the panel chrome; full flows are covered by the Vitest unit tests.
const Template = () => html`
  <div style="padding: var(--spacing-lg); max-width: 640px; background: var(--bg-primary);">
    <ag-audio-stack-provisioning></ag-audio-stack-provisioning>
  </div>
`;

export const Default = Template.bind({});

/** Detected DAC + library sources, ready to initialize (no backend: fetch stubbed). */
export const Detected = {
    render: () => {
        const el = document.createElement('ag-audio-stack-provisioning');
        el._loadStatus = async () => {};
        el._loading = false;
        el._outputs = DEMO_OUTPUTS;
        el._librarySources = DEMO_SOURCES;
        el._selectedOutputId = 'hw:2,0';
        const wrap = document.createElement('div');
        wrap.style.cssText =
            'padding: var(--spacing-lg); max-width: 640px; background: var(--bg-primary);';
        wrap.appendChild(el);
        return wrap;
    },
};
