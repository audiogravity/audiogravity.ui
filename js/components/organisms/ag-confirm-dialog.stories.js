import { html } from 'lit';
import './ag-confirm-dialog.js';

/**
 * The confirm dialog: Cancel outlined, OK filled — orange when the action deletes or
 * removes something (`destructive`), in which case Cancel is the button focused on
 * opening. An information dialog shows OK alone.
 */
export default {
    title: 'Organisms/ConfirmDialog',
    component: 'ag-confirm-dialog',
    argTypes: {
        show: { control: 'boolean' },
        title: { control: 'text' },
        message: { control: 'text' },
        okLabel: { control: 'text' },
        cancelLabel: { control: 'text' },
        destructive: { control: 'boolean' },
        infoMode: { control: 'boolean' },
    },
};

const Template = (args) => html`
  <div style="height: 300px; padding: 20px;">
    <ag-confirm-dialog
        ?show="${args.show}"
        .title="${args.title}"
        .message="${args.message}"
        .okLabel="${args.okLabel ?? 'OK'}"
        .cancelLabel="${args.cancelLabel ?? 'Cancel'}"
        ?destructive="${args.destructive}"
        ?info-mode="${args.infoMode}"
        @dialog-confirm="${() => console.log('Confirmed!')}"
        @dialog-cancel="${() => console.log('Cancelled!')}">
    </ag-confirm-dialog>
    <p style="color: var(--text-secondary)">Toggle 'show' to see the dialog.</p>
  </div>
`;

/** A confirmation that deletes: OK is orange, Cancel is focused on opening. */
export const Destructive = Template.bind({});
Destructive.args = {
    show: true,
    title: 'Clear History',
    message: 'Clear config history?',
    destructive: true,
};

/** A confirmation that deletes nothing: OK is filled and focused on opening. */
export const NormalAction = Template.bind({});
NormalAction.args = {
    show: true,
    title: 'Restart Service',
    message: 'This will temporarily interrupt audio playback.',
    okLabel: 'Restart Now',
};

/** Information only: OK alone. */
export const Information = Template.bind({});
Information.args = {
    show: true,
    title: 'Validation',
    message: 'The configuration is valid.',
    infoMode: true,
};
