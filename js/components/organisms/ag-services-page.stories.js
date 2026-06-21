import { html } from 'lit';
import './ag-services-page.js';
import '../molecules/ag-service-card.js';
import '../organisms/ag-card-grid.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'services',
        connected: true
    };
}

export default {
    title: 'Pages/ServicesPage',
    component: 'ag-services-page',
};

const servicesMock = [
    { 
        id: 'mpd', name: 'Music Player Daemon', systemd_unit: 'mpd.service', 
        state: 'active', enabled: true, critical: true,
        metrics: { cpu_percent: 2.1, memory_mb: 45, tasks: 12 }
    },
    { 
        id: 'squeezelite', name: 'Squeezelite', systemd_unit: 'squeezelite.service', 
        state: 'inactive', enabled: false, critical: false,
        metrics: { cpu_percent: 0, memory_mb: 0, tasks: 0 }
    },
    { 
        id: 'shairport-sync', name: 'Shairport Sync', systemd_unit: 'shairport-sync.service', 
        state: 'active', enabled: true, critical: false,
        metrics: { cpu_percent: 0.5, memory_mb: 12, tasks: 4 }
    }
];

const historyMock = {
    mpd: {
        cpu: Array.from({length: 30}, () => Math.random() * 5),
        mem: Array.from({length: 30}, () => 40 + Math.random() * 10),
        net: Array.from({length: 30}, () => Math.random() * 0.5),
        netRx: Array.from({length: 30}, () => Math.random() * 0.3),
        netTx: Array.from({length: 30}, () => Math.random() * 0.2),
        disk: Array.from({length: 30}, () => Math.random() * 0.1),
        diskRead: Array.from({length: 30}, () => Math.random() * 0.05),
        diskWrite: Array.from({length: 30}, () => Math.random() * 0.05)
    },
    squeezelite: {
        cpu: Array(30).fill(0),
        mem: Array(30).fill(0),
        net: Array(30).fill(0),
        netRx: Array(30).fill(0),
        netTx: Array(30).fill(0),
        disk: Array(30).fill(0),
        diskRead: Array(30).fill(0),
        diskWrite: Array(30).fill(0)
    },
    'shairport-sync': {
        cpu: Array.from({length: 30}, () => Math.random() * 2),
        mem: Array.from({length: 30}, () => 10 + Math.random() * 5),
        net: Array.from({length: 30}, () => Math.random() * 0.2),
        netRx: Array.from({length: 30}, () => Math.random() * 0.1),
        netTx: Array.from({length: 30}, () => Math.random() * 0.1),
        disk: Array(30).fill(0),
        diskRead: Array(30).fill(0),
        diskWrite: Array(30).fill(0)
    }
};

const Template = (args) => {
    const el = document.createElement('ag-services-page');
    el.services = args.services;
    el.metricsHistory = args.metricsHistory;
    el.servicesFetch.loading = args.loading;
    el.servicesFetch.error = args.error;
    
    // Mock methods that call API
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
    metricsHistory: historyMock,
    loading: false,
    error: null
};

export const Loading = Template.bind({});
Loading.args = {
    services: [],
    metricsHistory: {},
    loading: true,
    error: null
};
