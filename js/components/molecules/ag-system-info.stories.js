import { html } from 'lit';
import './ag-system-info.js';

export default {
    title: 'Molecules/SystemInfo',
    component: 'ag-system-info',
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 500px; background: var(--bg-primary);">
    <ag-system-info 
        .system="${args.system}"
        .cpu="${args.cpu}"
        .bootTime="${args.bootTime}"
        .loadAvg="${args.loadAvg}">
    </ag-system-info>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    system: { 
        hostname: 'audiogravity-pi',
        operating_system: 'Debian GNU/Linux 11 (bullseye)',
        kernel: 'Linux 6.1.21-v8+',
        architecture: 'aarch64'
    },
    cpu: { 
        model: 'ARMv8 Processor rev 3 (v8l)',
        physical_cores: 4,
        logical_cores: 4
    },
    bootTime: '2026-03-01T08:00:24.000Z',
    loadAvg: [0.15, 0.22, 0.18]
};
