import { html } from 'lit';
import './ag-toast-notification.js';

export default {
    title: 'Molecules/Toast',
    component: 'ag-toast-notification',
    argTypes: {
        type: {
            control: 'select',
            options: ['success', 'error', 'warning', 'info']
        },
        message: { control: 'text' },
        show: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="padding: 20px; height: 100px; position: relative;">
    <ag-toast-notification 
        .type="${args.type}"
        .message="${args.message}"
        ?show="${args.show}">
    </ag-toast-notification>
    ${!args.show ? html`<p style="color: var(--text-secondary)">Set 'show' to true in controls to see the toast.</p>` : ''}
  </div>
`;

export const Success = Template.bind({});
Success.args = {
    type: 'success',
    message: 'Configuration saved successfully!',
    show: true
};

export const Error = Template.bind({});
Error.args = {
    type: 'error',
    message: 'Failed to restart service.',
    show: true
};
