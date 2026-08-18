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

export const NothingMeasured = Template.bind({});
NothingMeasured.args = {
    // What a running service looks like when the counters behind its figures are
    // off: memory on a Raspberry Pi kernel, disk and network until IO/IP
    // Accounting is enabled for the unit. A dash, and no graph — printing 0 here
    // would be indistinguishable from an idle service.
    service: { ...serviceMock, name: 'MPD' },
    metrics: {
        cpu_percent: 1.4, tasks: 7,
        memory_mb: null,
        io_read_rate: null, io_write_rate: null,
        network_rx_rate: null, network_tx_rate: null,
    },
    history: historyMock
};

export const MemoryNotMeasured = Template.bind({});
MemoryNotMeasured.args = {
    // The Raspberry Pi case on its own: disk and network are counted, memory is
    // not, so one tile shows a dash while the others carry figures.
    service: { ...serviceMock, name: 'MPD' },
    metrics: {
        cpu_percent: 2.2, tasks: 7,
        memory_mb: null,
        io_read_rate: 0.4, io_write_rate: 0,
        network_rx_rate: 1.2, network_tx_rate: 0.3,
    },
    history: historyMock
};
