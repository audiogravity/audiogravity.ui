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

export const Iperf3UDP = Template.bind({});
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
                retransmits: null
            }
        }
    },
    healthStatus: { label: 'GOOD', class: 'good' }
};
