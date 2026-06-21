import { html } from 'lit';
import './ag-connector-badge.js';

export default {
    title: 'Atoms/ConnectorBadge',
    component: 'ag-connector-badge',
    argTypes: {
        connector: {
            control: 'select',
            options: ['', 'usb', 'toslink', 'coax', 'hdmi', 'analog', 'aes', 'i2s'],
        },
    },
};

const Template = (args) => html`
    <ag-connector-badge .connector=${args.connector ?? ''}></ag-connector-badge>
`;

export const Usb = Template.bind({});
Usb.args = { connector: 'usb' };

export const Toslink = Template.bind({});
Toslink.args = { connector: 'toslink' };

export const Empty = Template.bind({});
Empty.args = { connector: '' };
