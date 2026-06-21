import { html } from 'lit';
import './ag-license-badge.js';

export default {
    title: 'Atoms/LicenseBadge',
    component: 'ag-license-badge',
    argTypes: {
        status: {
            control: 'select',
            options: ['trial', 'lifetime', 'expired', 'tampered', 'no_license'],
        },
        daysRemaining: { control: 'number' },
        pill: { control: 'boolean' },
    },
};

const Template = (args) => html`
  <ag-license-badge
    status="${args.status}"
    days-remaining="${args.daysRemaining ?? ''}"
    ?pill="${args.pill}">
  </ag-license-badge>
`;

export const Trial = Template.bind({});
Trial.args = { status: 'trial', daysRemaining: 22, pill: true };

export const Lifetime = Template.bind({});
Lifetime.args = { status: 'lifetime', daysRemaining: null, pill: true };

export const Expired = Template.bind({});
Expired.args = { status: 'expired', daysRemaining: 0, pill: false };

export const Tampered = Template.bind({});
Tampered.args = { status: 'tampered', pill: false };
