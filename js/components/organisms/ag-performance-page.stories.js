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

// The fields GET /performance/cpu/info gives, for a Raspberry Pi: no throttle counter.
const cpuInfoMock = [0, 1, 2, 3].map((id) => ({
    cpu_id: id,
    physical_id: 0,
    core_id: id,
    current_governor: id < 2 ? 'performance' : 'schedutil',
    available_governors: ['performance', 'powersave', 'schedutil'],
    current_frequency: 1500,
    min_frequency: 600,
    max_frequency: 1800,
    throttle_count: null,
    threadLabel: '',
}));

const Template = (args) => {
    const el = document.createElement('ag-performance-page');
    el.cpuGeneralInfo = args.cpuGeneralInfo;
    el.cpuInfo = args.cpuInfo;
    el.dataFetch.loading = args.loading;
    el.dataFetch.error = args.error;
    // What the monitoring tick says of each core: throttled since the previous tick.
    el._cpuThrottled = args.cpuThrottled ?? null;
    
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

/**
 * A Raspberry Pi short of power: every core shows THROTTLED, and the speeds — on the cards and
 * above them — read "Slowed down", where Linux would give the speed it asked for.
 */
export const PiShortOfPower = Template.bind({});
PiShortOfPower.args = {
    cpuGeneralInfo: cpuGeneralInfoMock,
    cpuInfo: cpuInfoMock,
    cpuThrottled: [true, true, true, true],
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
