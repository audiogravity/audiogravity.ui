import { html } from 'lit';
import './ag-confirm-dialog.js';

export default {
    title: 'Organisms/ConfirmDialog',
    component: 'ag-confirm-dialog',
    argTypes: {
        show: { control: 'boolean' },
        title: { control: 'text' },
        message: { control: 'text' },
        confirmLabel: { control: 'text' },
        cancelLabel: { control: 'text' },
        type: {
            control: 'select',
            options: ['warning', 'error', 'info']
        }
    },
};

const Template = (args) => html`
  <div style="height: 300px; padding: 20px;">
    <ag-confirm-dialog 
        ?show="${args.show}"
        .title="${args.title}"
        .message="${args.message}"
        .confirmLabel="${args.confirmLabel}"
        .cancelLabel="${args.cancelLabel}"
        .type="${args.type}"
        @dialog-confirm="${() => console.log('Confirmed!')}"
        @dialog-cancel="${() => console.log('Cancelled!')}">
    </ag-confirm-dialog>
    <p style="color: var(--text-secondary)">Toggle 'show' to see the dialog.</p>
  </div>
`;

export const DangerousAction = Template.bind({});
DangerousAction.args = {
    show: true,
    title: 'Factory Reset',
    message: 'Are you sure you want to erase all settings? This action cannot be undone.',
    confirmLabel: 'Reset Everything',
    type: 'error'
};

export const NormalAction = Template.bind({});
NormalAction.args = {
    show: true,
    title: 'Restart Service',
    message: 'This will temporarily interrupt audio playback.',
    confirmLabel: 'Restart Now',
    type: 'warning'
};
