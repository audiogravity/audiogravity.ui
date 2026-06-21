import { html } from 'lit';
import './ag-perf-monitor.js';

export default {
    title: 'Organisms/PerfMonitor',
    component: 'ag-perf-monitor',
};

const mockStats = {
    totalEvents: 1250,
    totalBytes: 450000,
    eventsInLastSecond: 3,
    startTime: Date.now() - 3600000, // 1 hour ago
    eventsByType: {
        'sysinfo': 800,
        'service_metrics': 400,
        'profile_state': 50
    }
};

const mockTimers = [
    { id: 'perf-monitor-ui', interval: 1000, effectiveInterval: 1000, ticks: 120, running: true, pauseOnHidden: false },
    { id: 'uptime-updater', interval: 30000, effectiveInterval: 90000, ticks: 4, running: true, pauseOnHidden: true },
    { id: 'sse-reconnect', interval: 3000, effectiveInterval: 3000, ticks: 0, running: false, pauseOnHidden: false },
    { id: 'sw-check', interval: 300000, effectiveInterval: 300000, ticks: 1, running: true, pauseOnHidden: false }
];

const Template = (args) => {
    const el = document.createElement('ag-perf-monitor');
    
    // Seed initial data
    el.timers = args.timers || mockTimers;
    el.sse = args.sse || mockStats;
    el.lowPower = args.lowPower || false;
    el.expanded = args.expanded || false;
    
    // In Storybook, we might want to prevent the internal interval from 
    // overriding our mock data, or just let it run if common.js is safe.
    // For visual testing, we override the methods that fetch real data.
    
    return html`
        <div style="padding: 24px; background: var(--bg-primary); min-height: 400px; color: var(--text-primary);">
            ${el}
        </div>
    `;
};

export const Default = Template.bind({});
Default.args = {
    timers: mockTimers,
    sse: mockStats,
    expanded: false
};

export const Detailed = Template.bind({});
Detailed.args = {
    timers: mockTimers,
    sse: mockStats,
    expanded: true
};

export const LowPowerMode = Template.bind({});
LowPowerMode.args = {
    timers: mockTimers.map(t => ({...t, effectiveInterval: t.interval * 3})),
    sse: mockStats,
    lowPower: true,
    expanded: true
};
