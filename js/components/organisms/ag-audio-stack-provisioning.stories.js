import { html } from 'lit';
import './ag-audio-stack-provisioning.js';

export default {
    title: 'Organisms/AudioStackProvisioning',
    component: 'ag-audio-stack-provisioning',
};

// The component self-fetches /audio-stack/status on connect; in Storybook there is
// no backend, so it renders its loading/empty states. These stories document the
// panel chrome; full flows are covered by the Vitest unit tests.
const Template = () => html`
  <div style="padding: var(--spacing-lg); max-width: 640px; background: var(--bg-primary);">
    <ag-audio-stack-provisioning></ag-audio-stack-provisioning>
  </div>
`;

export const Default = Template.bind({});
