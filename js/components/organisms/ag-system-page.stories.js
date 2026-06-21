import { html } from 'lit';
import './ag-system-page.js';
import './ag-system-dashboard.js';
import './ag-log-viewer.js';
import '../molecules/ag-event-item.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'system',
        connected: true
    };
}

export default {
    title: 'Pages/SystemPage',
    component: 'ag-system-page',
};

const eventsMock = [
    { type: 'info', data: { message: 'System monitoring active' }, timestamp: Date.now() - 5000 },
    { type: 'service_state', data: { service_id: 'mpd', state: 'active' }, timestamp: Date.now() - 10000 },
    { type: 'error', data: { message: 'Failed to mount network drive' }, timestamp: Date.now() - 20000 }
];

const Template = (args) => {
    const el = document.createElement('ag-system-page');
    el.events = args.events;
    el.eventsEnabled = args.eventsEnabled;
    el.isConnected = args.isConnected;
    
    return html`
        <div style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
            ${el}
        </div>
    `;
};

export const Default = Template.bind({});
Default.args = {
    events: eventsMock,
    eventsEnabled: true,
    isConnected: true
};

export const Stopped = Template.bind({});
Stopped.args = {
    events: eventsMock,
    eventsEnabled: false,
    isConnected: false
};
