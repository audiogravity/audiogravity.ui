import { html } from 'lit';
import './ag-audio-software-page.js';
import '../molecules/ag-package-card.js';
import '../organisms/ag-card-grid.js';
import { AuthState } from '../../auth.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'audio-software',
        animationsEnabled: true
    };
}

// Render as admin so admin-only controls (the DRY-RUN toggle) are visible in stories.
AuthState.isAuthenticated = true;
AuthState.user = { role: 'admin' };

export default {
    title: 'Pages/AudioSoftwarePage',
    component: 'ag-audio-software-page',
};

const packagesMock = [
    { 
        id: 'mpd', label: 'Music Player Daemon', description: 'Flexible, powerful, server-side application for playing music.', 
        status: 'installed', installed_version: '0.23.5', available_version: '0.23.5',
        type: 'audio-engine', homepage: 'https://www.musicpd.org/'
    },
    { 
        id: 'squeezelite', label: 'Squeezelite', description: 'Lightweight headless Squeezebox player.', 
        status: 'not_installed', installed_version: null, available_version: '1.9.9',
        type: 'audio-engine', homepage: 'https://github.com/ralph-irving/squeezelite'
    },
    { 
        id: 'shairport-sync', label: 'Shairport Sync', description: 'AirPlay audio player.', 
        status: 'installed', installed_version: '3.3.8', available_version: '3.4.1',
        type: 'audio-engine', homepage: 'https://github.com/mikebrady/shairport-sync'
    }
];

const Template = (args) => {
    const el = document.createElement('ag-audio-software-page');
    el.packages = args.packages;
    el.packagesFetch.loading = args.loading;
    el.packagesFetch.error = args.error;
    el.dryRun = args.dryRun;
    
    // Mock methods
    el._loadPackages = () => {};

    return html`
        <div style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
            ${el}
        </div>
    `;
};

export const Default = Template.bind({});
Default.args = {
    packages: packagesMock,
    loading: false,
    error: null,
    dryRun: false
};

export const Loading = Template.bind({});
Loading.args = {
    packages: [],
    loading: true,
    error: null,
    dryRun: false
};
