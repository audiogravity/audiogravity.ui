import { html } from 'lit';
import './ag-history-panel.js';

export default {
    title: 'Organisms/HistoryPanel',
    component: 'ag-history-panel',
    argTypes: {
        actions: { control: 'object' }
    },
};

const actionsMock = [
    { id: 1, type: 'service', action: 'restart', target: 'mpd', timestamp: '19:40:01', status: 'success' },
    { id: 2, type: 'profile', action: 'switch', target: 'Hi-Fi', timestamp: '19:42:15', status: 'success' },
    { id: 3, type: 'system', action: 'update', target: 'kernel', timestamp: '19:45:00', status: 'error' }
];

const Template = (args) => html`
  <div style="padding: 20px; max-width: 400px; background: var(--bg-primary);">
    <ag-history-panel 
        .actions="${args.actions}"
        @clear-history="${() => console.log('History clear requested')}">
    </ag-history-panel>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    actions: actionsMock
};

export const Empty = Template.bind({});
Empty.args = {
    actions: []
};
