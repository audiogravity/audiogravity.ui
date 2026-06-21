import { html } from 'lit';
import './ag-status-indicator.js';

export default {
    title: 'Atoms/StatusIndicator',
    component: 'ag-status-indicator',
    argTypes: {
        state: {
            control: 'select',
            options: ['up', 'down', 'active', 'inactive']
        },
        type: {
            control: 'select',
            options: ['service', 'profile']
        },
        label: { control: 'text' }
    },
};

const Template = (args) => html`
  <div style="display: flex; align-items: center; gap: 10px; padding: 24px; background: var(--bg-primary);">
    <ag-status-indicator 
        state="${args.state}"
        type="${args.type}"
        label="${args.label}">
    </ag-status-indicator>
  </div>
`;

export const ServiceUp = Template.bind({});
ServiceUp.args = {
    state: 'up',
    type: 'service',
    label: 'UP'
};

export const ServiceDown = Template.bind({});
ServiceDown.args = {
    state: 'down',
    type: 'service',
    label: 'DOWN'
};

export const ProfileActive = Template.bind({});
ProfileActive.args = {
    state: 'active',
    type: 'profile',
    label: 'ACTIVE'
};
