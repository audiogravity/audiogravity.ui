import { html } from 'lit';
import './ag-top-bar.js';

export default {
    title: 'Organisms/TopBar',
    component: 'ag-top-bar',
    argTypes: {
        connected: { control: 'boolean' },
        user: { control: 'object' },
        metrics: { control: 'object' },
        showMetrics: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="background: var(--bg-primary); padding-bottom: 100px;">
    <ag-top-bar 
        ?connected="${args.connected}"
        .user="${args.user}"
        .metrics="${args.metrics}"
        .showMetrics="${args.showMetrics ?? true}">
    </ag-top-bar>
    <div style="padding: 20px; color: var(--text-secondary)">
        Main application content would be below this bar.
    </div>
  </div>
`;

export const Connected = Template.bind({});
Connected.args = {
    connected: true,
    user: { username: 'admin' },
    metrics: { uptime: 3600, cpu_percent: 12.5, temp: 45.2, memory_percent: 35.8 }
};

export const Disconnected = Template.bind({});
Disconnected.args = {
    connected: false,
    user: null,
    metrics: { uptime: 0, cpu_percent:0, temp: 0, memory_percent: 0 }
};

/** This device's "Top Bar Metrics" setting switched off: the middle of the bar stays empty. */
export const MetricsHidden = Template.bind({});
MetricsHidden.args = {
    connected: true,
    user: { username: 'admin' },
    metrics: { uptime: 3600, cpu_percent: 12.5, temp: 45.2, memory_percent: 35.8 },
    showMetrics: false
};
