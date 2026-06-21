import { html } from 'lit';
import './ag-logs-modal.js';

export default {
    title: 'Organisms/LogsModal',
    component: 'ag-logs-modal',
    argTypes: {
        isOpen: { control: 'boolean' },
        title: { control: 'text' },
        logs: { control: 'object' },
        progress: { control: { type: 'range', min: 0, max: 100 } },
        isActive: { control: 'boolean' },
        showCancel: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="height: 500px; padding: 20px;">
    <ag-logs-modal 
        ?is-open="${args.isOpen}"
        .title="${args.title}"
        .logs="${args.logs}"
        .progress="${args.progress}"
        @close-request="${() => console.log('Close requested')}">
    </ag-logs-modal>
  </div>
`;

export const InstallationProgress = Template.bind({});
InstallationProgress.args = {
    isOpen: true,
    title: 'Installing Roon Server',
    logs: [
        { timestamp: Date.now() - 3000, level: 'info', message: '[1/4] Downloading package...' },
        { timestamp: Date.now() - 2000, level: 'info', message: '[2/4] Extracting files...' },
        { timestamp: Date.now() - 1000, level: 'info', message: '[3/4] Running installation script...' },
        { timestamp: Date.now(), level: 'success', message: 'Done.' }
    ],
    progress: 75
};
