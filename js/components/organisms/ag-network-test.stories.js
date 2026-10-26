import { expect } from 'storybook/test';
import { html } from 'lit';
import './ag-network-test.js';

export default {
    title: 'Organisms/NetworkTest',
    component: 'ag-network-test',
};

const Template = (args) => html`
  <div style="padding: 24px; background: var(--bg-primary);">
    <ag-network-test 
        .testType="${args.testType}"
        .testState="${args.testState}"
        .statusData="${args.statusData}"
        .resultData="${args.resultData}"
        .healthStatus="${args.healthStatus}">
    </ag-network-test>
  </div>
`;

export const PingIdle = Template.bind({});
PingIdle.args = {
    testType: 'ping',
    testState: 'idle'
};

export const PingRunning = Template.bind({});
PingRunning.args = {
    testType: 'ping',
    testState: 'running',
    statusData: {
        status: 'running',
        progress: 60,
        current_latency: 12.5,
        samples_done: 12,
        total_samples: 20
    }
};

export const PingCompleted = Template.bind({});
PingCompleted.args = {
    testType: 'ping',
    testState: 'completed',
    resultData: {
        stats: {
            test_type: 'ping',
            min_ms: 10.2,
            avg_ms: 12.5,
            max_ms: 18.4,
            jitter_ms: 0.85,
            packet_loss: 0
        }
    },
    healthStatus: { label: 'EXCELLENT', class: 'excellent' }
};

/** FAIR: 6.2 ms of jitter, over the 5 ms that ends GOOD. */
export const PingFair = Template.bind({});
PingFair.args = {
    testType: 'ping',
    testState: 'completed',
    resultData: {
        stats: { test_type: 'ping', min_ms: 10.2, avg_ms: 14.8, max_ms: 31.0, jitter_ms: 6.2, packet_loss: 0 }
    },
    healthStatus: { label: 'FAIR', class: 'fair' }
};

/** CRITICAL: 3 % of the packets lost, over the 2 % that ends FAIR. */
export const PingCritical = Template.bind({});
PingCritical.args = {
    testType: 'ping',
    testState: 'completed',
    resultData: {
        stats: { test_type: 'ping', min_ms: 10.2, avg_ms: 22.4, max_ms: 120.5, jitter_ms: 14.1, packet_loss: 3 }
    },
    healthStatus: { label: 'CRITICAL', class: 'critical' }
};

/**
 * A UDP run with its jitter chart, drawn as the end of a run draws it — one bar per second,
 * in the theme's network colour — and checked.
 */
export const Iperf3UDP = Template.bind({});
Iperf3UDP.play = async ({ canvasElement }) => {
    const el = canvasElement.querySelector('ag-network-test');
    await el.updateComplete;
    el._renderJitterChart();
    const [dataset] = el._jitterChart.data.datasets;
    expect(el._jitterChart.config.type).toBe('bar');
    expect(dataset.data).toHaveLength(20);
    expect(dataset.backgroundColor).toBe(getComputedStyle(document.body).getPropertyValue('--chart-network').trim());
};
Iperf3UDP.args = {
    testType: 'iperf3_udp',
    testState: 'completed',
    resultData: {
        stats: {
            test_type: 'iperf3_udp',
            iperf3_stats: {
                bandwidth_mbps: 94.5,
                jitter_ms: 0.12,
                packet_loss_percent: 0.005,
                packets_received: 9999,
                packets_sent: 10000,
                retransmits: null,
                // One jitter per second, as a real run measured them (2026-10-26).
                jitter_history: [0.024, 0.023, 0.018, 0.039, 0.023, 0.022, 0.024, 0.020, 0.025, 0.023,
                    0.026, 0.016, 0.026, 0.026, 0.016, 0.025, 0.030, 0.019, 0.087, 0.024]
            }
        }
    },
    healthStatus: { label: 'GOOD', class: 'good' }
};
