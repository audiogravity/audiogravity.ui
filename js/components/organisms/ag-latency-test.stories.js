import { html } from 'lit';
import './ag-latency-test.js';

// Mock Chart if not available
if (typeof Chart === 'undefined') {
    window.Chart = class {
        constructor() {}
        destroy() {}
        update() {}
    };
}

export default {
    title: 'Organisms/LatencyTest',
    component: 'ag-latency-test',
};

const Template = (args) => html`
  <div style="padding: 24px; background: var(--bg-primary);">
    <ag-latency-test 
        .testState="${args.testState}"
        .statusData="${args.statusData}"
        .resultData="${args.resultData}">
    </ag-latency-test>
  </div>
`;

export const Idle = Template.bind({});
Idle.args = {
    testState: 'idle'
};

export const Running = Template.bind({});
Running.args = {
    testState: 'running',
    statusData: {
        status: 'running',
        progress: 45,
        current_stats: { min_us: 1.2, avg_us: 4.5, max_us: 12.8, samples: 4500 }
    }
};

export const Completed = Template.bind({});
Completed.args = {
    testState: 'completed',
    resultData: {
        stats: { min_us: 0.8, avg_us: 3.2, max_us: 15.4, stddev_us: 1.1 },
        percentiles: { p50: 2.8, p90: 5.4, p95: 7.2, p99: 10.5, p999: 14.2 },
        histogram: {
            buckets: { "1": 500, "2": 1200, "4": 800, "8": 200, "16": 50 }
        }
    }
};
