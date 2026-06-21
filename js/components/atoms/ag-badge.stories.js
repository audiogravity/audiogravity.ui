import { html } from 'lit';
import './ag-badge.js';

export default {
    title: 'Atoms/Badge',
    component: 'ag-badge',
    argTypes: {
        type: {
            control: 'select',
            options: ['info', 'success', 'warning', 'error', 'neutral', 'critical']
        },
        label: { control: 'text' },
        pill: { control: 'boolean' },
        filled: { control: 'boolean' },
        pulse: { control: 'boolean' },
        clickable: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <ag-badge 
    type="${args.type || 'info'}"
    label="${args.label}"
    ?pill="${args.pill}"
    ?filled="${args.filled}"
    ?pulse="${args.pulse}"
    ?clickable="${args.clickable}">
  </ag-badge>
`;

export const Info = Template.bind({});
Info.args = {
    type: 'info',
    label: 'Beta',
    pill: false,
    filled: false,
    pulse: false,
    clickable: false
};

export const SuccessPulsing = Template.bind({});
SuccessPulsing.args = {
    type: 'success',
    label: 'LIVE',
    pill: true,
    filled: true,
    pulse: true,
    clickable: false
};

export const Warning = Template.bind({});
Warning.args = {
    type: 'warning',
    label: 'UPDATE',
    pill: false,
    filled: false,
    pulse: false,
    clickable: true
};
