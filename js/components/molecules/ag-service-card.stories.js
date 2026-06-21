import { html } from 'lit';
import './ag-service-card.js';

export default {
    title: 'Molecules/ServiceCard',
    component: 'ag-service-card',
    argTypes: {
        isGuest: { control: 'boolean' }
    },
};

const serviceMock = {
    id: 'mpd',
    name: 'Music Player Daemon',
    state: 'active',
    enabled: true,
    critical: true,
    systemd_unit: 'mpd.service'
};

const metricsMock = {
    cpu_percent: 2.5,
    memory_mb: 45,
    tasks: 12,
    net_rx_mb_per_sec: 0.15,
    net_tx_mb_per_sec: 0.05,
    io_read_mb_per_sec: 0.01,
    io_write_mb_per_sec: 0.00
};

const historyMock = {
    cpu: Array.from({length: 20}, () => Math.random() * 5),
    mem: Array.from({length: 20}, () => 40 + Math.random() * 10),
    net: Array.from({length: 20}, () => Math.random() * 0.5),
    disk: Array.from({length: 20}, () => Math.random() * 0.1),
    netRx: Array.from({length: 20}, () => Math.random() * 0.3),
    netTx: Array.from({length: 20}, () => Math.random() * 0.2),
    diskRead: Array.from({length: 20}, () => Math.random() * 0.05),
    diskWrite: Array.from({length: 20}, () => Math.random() * 0.05)
};

const Template = (args) => html`
  <div style="padding: 24px; max-width: 450px; background: var(--bg-primary);">
    <ag-service-card 
        .service="${args.service}"
        .metrics="${args.metrics}"
        .history="${args.history}">
    </ag-service-card>
  </div>
`;

export const ActiveService = Template.bind({});
ActiveService.args = {
    service: serviceMock,
    metrics: metricsMock,
    history: historyMock
};

export const StoppedService = Template.bind({});
StoppedService.args = {
    service: { ...serviceMock, state: 'inactive', name: 'Squeezelite', critical: false },
    metrics: { cpu_percent: 0, memory_mb: 0, tasks: 0 },
    history: historyMock
};
