import { html } from 'lit';
import './ag-performance-page.js';
import '../molecules/ag-governor-card.js';
import '../organisms/ag-latency-test.js';
import '../organisms/ag-network-test.js';
import '../organisms/ag-card-grid.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'performance'
    };
}

export default {
    title: 'Pages/PerformancePage',
    component: 'ag-performance-page',
};

const cpuGeneralInfoMock = {
    model: 'ARMv8 Processor rev 3 (v8l)',
    architecture: 'aarch64',
    physical_cores: 4,
    logical_cores: 4,
    current_freq: 1500,
    min_freq: 600,
    max_freq: 1800
};

const cpuInfoMock = [
    { cpu_id: 0, physical_id: 0, core_id: 0, governor: 'performance', available_governors: ['performance', 'powersave', 'schedutil'], threadLabel: '' },
    { cpu_id: 1, physical_id: 0, core_id: 1, governor: 'performance', available_governors: ['performance', 'powersave', 'schedutil'], threadLabel: '' },
    { cpu_id: 2, physical_id: 0, core_id: 2, governor: 'schedutil', available_governors: ['performance', 'powersave', 'schedutil'], threadLabel: '' },
    { cpu_id: 3, physical_id: 0, core_id: 3, governor: 'schedutil', available_governors: ['performance', 'powersave', 'schedutil'], threadLabel: '' }
];

const Template = (args) => {
    const el = document.createElement('ag-performance-page');
    el.cpuGeneralInfo = args.cpuGeneralInfo;
    el.cpuInfo = args.cpuInfo;
    el.dataFetch.loading = args.loading;
    el.dataFetch.error = args.error;
    
    // Mock methods
    el._loadData = () => {};

    return html`
        <div style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
            ${el}
        </div>
    `;
};

export const Default = Template.bind({});
Default.args = {
    cpuGeneralInfo: cpuGeneralInfoMock,
    cpuInfo: cpuInfoMock,
    loading: false,
    error: null
};

export const Loading = Template.bind({});
Loading.args = {
    cpuGeneralInfo: null,
    cpuInfo: [],
    loading: true,
    error: null
};
