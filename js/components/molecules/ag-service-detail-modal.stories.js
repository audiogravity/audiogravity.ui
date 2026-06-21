import { html } from 'lit';
import './ag-service-detail-modal.js';

export default {
    title: 'Molecules/ServiceDetailModal',
    component: 'ag-service-detail-modal',
    argTypes: {
        show: { control: 'boolean' }
    }
};

const serviceMock = {
    name: 'Roon Bridge',
    systemd_unit: 'roonbridge.service',
    enabled: true,
    state: 'active',
    metrics: {
        cpu_percent: 4.2,
        memory_mb: 87,
        tasks: 12,
        network_rx_rate: 2.1,
        network_tx_rate: 0.3,
        io_read_rate: 0.05,
        io_write_rate: 0.01
    }
};

const historyMock = [
    { action: 'Started: Roon Bridge',   timestamp: new Date(Date.now() - 120000).toISOString(), success: true  },
    { action: 'Stopped: Roon Bridge',   timestamp: new Date(Date.now() - 300000).toISOString(), success: true  },
    { action: 'Failed restart: Roon Bridge', timestamp: new Date(Date.now() - 600000).toISOString(), success: false }
];

const Template = (args) => html`
    <ag-service-detail-modal
        .service=${args.service}
        ?show=${args.show}
        .history=${args.history}>
    </ag-service-detail-modal>
`;

export const WithHistory = Template.bind({});
WithHistory.args = { service: serviceMock, show: true, history: historyMock };

export const EmptyHistory = Template.bind({});
EmptyHistory.args = { service: serviceMock, show: true, history: [] };

export const DisabledService = Template.bind({});
DisabledService.args = {
    service: { ...serviceMock, name: 'Squeezelite', systemd_unit: 'squeezelite.service', enabled: false, state: 'inactive' },
    show: true,
    history: []
};

export const Hidden = Template.bind({});
Hidden.args = { service: serviceMock, show: false, history: historyMock };
