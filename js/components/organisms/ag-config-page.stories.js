import { html } from 'lit';
import './ag-config-page.js';
import '../molecules/ag-config-card.js';
import '../organisms/ag-config-editor.js';
import '../organisms/ag-card-grid.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'config'
    };
}

export default {
    title: 'Pages/ConfigPage',
    component: 'ag-config-page',
};

const servicesMock = [
    { id: 'mpd', name: 'Music Player Daemon', path: '/etc/mpd.conf', critical: true },
    { id: 'squeezelite', name: 'Squeezelite', path: '/etc/default/squeezelite', critical: false },
    { id: 'shairport-sync', name: 'Shairport Sync', path: '/etc/shairport-sync.conf', critical: false }
];

const Template = (args) => {
    const el = document.createElement('ag-config-page');
    el.services = args.services;
    el.selectedServiceId = args.selectedServiceId;
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

export const Selector = Template.bind({});
Selector.args = {
    services: servicesMock,
    selectedServiceId: null,
    loading: false
};

export const Loading = Template.bind({});
Loading.args = {
    services: [],
    selectedServiceId: null,
    loading: true
};
