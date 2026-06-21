import { html } from 'lit';
import './ag-log-viewer.js';

export default {
    title: 'Organisms/LogViewer',
    component: 'ag-log-viewer',
    argTypes: {
        logs: { control: 'object' },
        autoRefresh: { control: 'boolean' },
        reverseOrder: { control: 'boolean' },
        filter: { control: 'text' }
    },
};

const mockLogs = [
    { timestamp: '2026-03-03 19:40:01', level: 'INFO', message: 'System starting up...' },
    { timestamp: '2026-03-03 19:40:05', level: 'INFO', message: 'Audio interface detected: ALSA Loopback' },
    { timestamp: '2026-03-03 19:40:12', level: 'WARNING', message: 'High jitter detected on eth0' },
    { timestamp: '2026-03-03 19:40:15', level: 'ERROR', message: 'Failed to mount /mnt/music: connection timed out' },
    { timestamp: '2026-03-03 19:40:20', level: 'INFO', message: 'Service mpd restarted' },
    { timestamp: '2026-03-03 19:40:25', level: 'INFO', message: 'New SSE client connected' }
];

const Template = (args) => html`
  <div style="padding: 20px; background: var(--bg-primary); height: 500px;">
    <ag-log-viewer 
        .logs="${args.logs}"
        ?auto-refresh="${args.autoRefresh}"
        ?reverse-order="${args.reverseOrder}"
        .filter="${args.filter}"
        @log-filter-change="${(e) => console.log('Filter changed:', e.detail)}">
    </ag-log-viewer>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    logs: mockLogs,
    autoRefresh: true,
    reverseOrder: false,
    filter: ''
};

export const FilteredError = Template.bind({});
FilteredError.args = {
    logs: mockLogs,
    autoRefresh: false,
    reverseOrder: false,
    filter: 'ERROR'
};
