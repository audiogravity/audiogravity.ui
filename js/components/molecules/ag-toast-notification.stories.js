import { expect } from 'storybook/test';
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
        title: { control: 'text' },
        message: { control: 'text' },
        duration: { control: 'number' },
        show: { control: 'boolean' }
    },
};

// A long duration: a success or an info left alone would leave the canvas while it is looked at.
const Template = (args) => html`
  <div style="padding: 20px; max-width: 420px;">
    <ag-toast-notification
        .type="${args.type}"
        .title="${args.title}"
        .message="${args.message}"
        .duration="${args.duration ?? 600000}"
        ?show="${args.show}">
    </ag-toast-notification>
    ${!args.show ? html`<p style="color: var(--text-secondary)">Set 'show' to true in controls to see the toast.</p>` : ''}
  </div>
`;

export const Success = Template.bind({});
Success.args = {
    type: 'success',
    title: 'Added to queue',
    message: 'Kind of Blue — Miles Davis',
    show: true
};

/** Stays until it is closed: its X is the way out. */
export const Error = Template.bind({});
Error.args = {
    type: 'error',
    title: 'Playback failed',
    message: 'Unable to connect to server. Please check your connection.',
    show: true
};
Error.play = async ({ canvasElement }) => {
    const toast = canvasElement.querySelector('ag-toast-notification');
    await toast.updateComplete;
    const close = toast.querySelector('button.toast-close');
    expect(close.getAttribute('aria-label')).toBe('Dismiss');
    // The error's icon is a circled X, apart from the X that closes.
    expect(toast.querySelector('.toast-icon svg circle')).not.toBeNull();
    close.click();
    expect(toast.closing).toBe(true);
};

export const Warning = Template.bind({});
Warning.args = {
    type: 'warning',
    title: 'Some Services Failed',
    message: 'shairport-sync, upmpdcli',
    show: true
};

export const Info = Template.bind({});
Info.args = {
    type: 'info',
    title: 'Core restarting',
    message: 'The interface reconnects on its own…',
    show: true
};

/** An operation in progress (duration 0) turns into its outcome, in the same toast. */
export const InProgressThenDone = Template.bind({});
InProgressThenDone.args = {
    type: 'info',
    title: 'Checking for updates',
    message: 'Every package is being checked…',
    duration: 0,
    show: true
};
InProgressThenDone.play = async ({ canvasElement }) => {
    const toast = canvasElement.querySelector('ag-toast-notification');
    await toast.updateComplete;
    toast.setMessage('success', 'Updates checked', '2 updates are available.', 600000);
    await toast.updateComplete;
    expect(toast.querySelector('.toast').classList.contains('success')).toBe(true);
    expect(toast.querySelector('.toast-title').textContent).toBe('Updates checked');
};
