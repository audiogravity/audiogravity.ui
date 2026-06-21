import { html } from 'lit';
import './ag-profiles-page.js';
import '../molecules/ag-profile-card.js';
import '../organisms/ag-card-grid.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'profiles'
    };
}

export default {
    title: 'Pages/ProfilesPage',
    component: 'ag-profiles-page',
};

const profilesMock = [
    { 
        id: 'hi-res', name: 'Hi-Res Audio', description: 'Optimized for 192kHz/24-bit bit-perfect playback.', 
        state: 'active', services_started: ['mpd', 'alsa-utils'], services_stopped: ['avahi-daemon'],
        type: 'audiophile', icon: 'icon-music'
    },
    { 
        id: 'minimalist', name: 'Minimalist', description: 'Lowest possible jitter with only essential services.', 
        state: 'inactive', services_started: ['squeezelite'], services_stopped: ['mpd', 'avahi-daemon', 'ssh'],
        type: 'audiophile', icon: 'icon-power'
    },
    { 
        id: 'multiroom', name: 'Multiroom Sync', description: 'Synchronized playback across multiple rooms.', 
        state: 'inactive', services_started: ['snapcast-server', 'mpd'], services_stopped: [],
        type: 'standard', icon: 'icon-connection'
    }
];

const servicesConfigMock = {
    mpd: { label: 'Music Player Daemon' },
    squeezelite: { label: 'Squeezelite' },
    'alsa-utils': { label: 'ALSA Configuration' },
    'avahi-daemon': { label: 'Network Discovery' },
    'snapcast-server': { label: 'Snapcast Server' },
    ssh: { label: 'SSH Access' }
};

const Template = (args) => {
    const el = document.createElement('ag-profiles-page');
    el.profiles = args.profiles;
    el.services = args.services;
    el.activeProfiles = args.activeProfiles;
    el.profilesFetch.loading = args.loading;
    el.profilesFetch.error = args.error;
    
    // Mock methods
    el._loadProfiles = () => {};

    return html`
        <div style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
            ${el}
        </div>
    `;
};

export const Default = Template.bind({});
Default.args = {
    profiles: profilesMock,
    services: servicesConfigMock,
    activeProfiles: ['hi-res'],
    loading: false,
    error: null
};

export const Loading = Template.bind({});
Loading.args = {
    profiles: [],
    services: {},
    activeProfiles: [],
    loading: true,
    error: null
};
