import { html } from 'lit';
import './ag-systemd-page.js';
import '../molecules/ag-systemd-card.js';
import '../organisms/ag-card-grid.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'systemd'
    };
}

export default {
    title: 'Pages/SystemdPage',
    component: 'ag-systemd-page',
};

const servicesMock = [
    { 
        id: 'mpd', name: 'Music Player Daemon', systemd_unit: 'mpd.service', 
        critical: true, has_override: true, has_backup: false,
        properties: { CPUSchedulingPolicy: 'fifo', CPUSchedulingPriority: 90, CPUAffinity: '2,3' }
    },
    { 
        id: 'squeezelite', name: 'Squeezelite', systemd_unit: 'squeezelite.service', 
        critical: false, has_override: false, has_backup: true,
        properties: { CPUSchedulingPolicy: 'other', CPUSchedulingPriority: 0, CPUAffinity: 'all' }
    }
];

const Template = (args) => {
    const el = document.createElement('ag-systemd-page');
    el.services = args.services;
    el.servicesFetch.loading = args.loading;
    el.servicesFetch.error = args.error;
    
    // Mock methods
    el._loadServices = () => {};

    return html`
        <div style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
            ${el}
        </div>
    `;
};

export const Default = Template.bind({});
Default.args = {
    services: servicesMock,
    loading: false,
    error: null
};

export const Loading = Template.bind({});
Loading.args = {
    services: [],
    loading: true,
    error: null
};
