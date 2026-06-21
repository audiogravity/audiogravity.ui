import { html } from 'lit';
import './ag-system-dashboard.js';
import '../molecules/ag-system-info.js';
import '../molecules/ag-system-tile.js';
import '../molecules/ag-network-card.js';
import '../molecules/ag-audio-card.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        connected: true,
        connectionId: 'SB-12345'
    };
}

export default {
    title: 'Organisms/SystemDashboard',
    component: 'ag-system-dashboard',
};

const sysinfoMock = {
    system: { 
        hostname: 'audiogravity-pi',
        operating_system: 'Debian GNU/Linux 11 (bullseye)',
        kernel: 'Linux 6.1.21-v8+',
        architecture: 'aarch64',
        network_interfaces: [
            { name: 'eth0', ip: '192.168.1.15', speed: '1000Mb/s', status: 'up' },
            { name: 'wlan0', ip: '192.168.1.16', speed: '300Mb/s', status: 'up' }
        ]
    },
    cpu: { 
        model: 'ARMv8 Processor rev 3 (v8l)',
        physical_cores: 4,
        logical_cores: 4
    },
    boot_time: '2026-03-01T08:00:24.000Z'
};

const audioDevicesMock = [
    { card_id: 0, card_name: 'bcm2835 ALSA', long_name: 'bcm2835 ALSA', usb_id: null, usb_bus: null, devices: [{name: 'PCM', subdevices_available: 7, subdevices_total: 8}] },
    { card_id: 1, card_name: 'Focusrite Scarlett', long_name: 'Focusrite Scarlett 2i2 USB', usb_id: '1234:abcd', usb_bus: '1-1.2', devices: [{name: 'Audio', subdevices_available: 1, subdevices_total: 1}] }
];

const metricsMock = {
    cpu_percent: 12.5,
    load_avg: [0.45, 0.32, 0.28],
    memory_percent: 35.8,
    memory_used: 1536 * 1024 * 1024,
    memory_total: 4096 * 1024 * 1024,
    disk_usage_percent: 22.1,
    disk_used_gb: 14.5,
    disk_total_gb: 64.0,
    temperature: 45.2,
    network_bytes_sent: 1000000,
    network_bytes_recv: 5000000,
    uptime: 3600 * 24 + 3600 * 2 // 1 day, 2 hours
};

const Template = (args) => {
    // We instantiate and manually set data to avoid apiGet failures in Storybook
    const el = document.createElement('ag-system-dashboard');
    el.metrics = args.metrics;
    el.statusFetch.data = args.sysinfo;
    el.audioFetch.data = { cards: args.audioDevices };
    el.isConnected = args.isConnected;
    
    // Simulate some history data
    el._historyStore = {
        cpu: Array.from({length: 60}, () => 10 + Math.random() * 20),
        memory: Array.from({length: 60}, () => 30 + Math.random() * 5),
        temperature: Array.from({length: 60}, () => 40 + Math.random() * 10),
        network: Array.from({length: 60}, () => Math.random() * 500),
        disk: Array.from({length: 60}, () => 22)
    };

    return html`
        <div class="system-dashboard-grid" style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
            ${el}
        </div>
    `;
};

export const FullDashboard = Template.bind({});
FullDashboard.args = {
    metrics: metricsMock,
    sysinfo: sysinfoMock,
    audioDevices: audioDevicesMock,
    isConnected: true
};

export const Disconnected = Template.bind({});
Disconnected.args = {
    metrics: metricsMock,
    sysinfo: sysinfoMock,
    audioDevices: audioDevicesMock,
    isConnected: false
};
