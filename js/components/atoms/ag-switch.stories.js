import { html } from 'lit';
import './ag-switch.js';

export default {
    title: 'Atoms/Switch',
    component: 'ag-switch',
    argTypes: {
        checked: { control: 'boolean' },
        disabled: { control: 'boolean' },
        compact: { control: 'boolean' },
        variant: { 
            control: 'select', 
            options: ['', 'notification']
        }
    },
};

const Template = (args) => html`
  <div style="padding: 24px; background: var(--bg-primary);">
    <ag-switch 
        .checked="${args.checked}"
        .compact="${args.compact}"
        .variant="${args.variant}"
        ?disabled="${args.disabled}"
        @ag-change="${(e) => console.log('Switch toggled:', e.detail.checked)}">
    </ag-switch>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    checked: false,
    disabled: false,
    compact: false,
    variant: ''
};

export const Checked = Template.bind({});
Checked.args = {
    checked: true
};

export const Notification = Template.bind({});
Notification.args = {
    checked: true,
    variant: 'notification'
};

export const Disabled = Template.bind({});
Disabled.args = {
    disabled: true
};

export const Compact = Template.bind({});
Compact.args = {
    compact: true
};
