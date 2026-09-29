import { html } from 'lit';
import './ag-governor-card.js';

export default {
    title: 'Molecules/GovernorCard',
    component: 'ag-governor-card',
};

const cpuMock = {
    id: 0,
    current_governor: 'performance',
    available_governors: ['performance', 'powersave', 'ondemand', 'schedutil'],
    current_freq: '1500MHz',
    min_freq: '600MHz',
    max_freq: '1500MHz'
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 400px;">
    <ag-governor-card
        .cpu="${args.cpu}"
        .usage="${args.usage ?? 0}"
        .usageHistory="${args.usageHistory ?? []}"
        .usageSpan="${args.usageSpan ?? 0}"
        .throttled="${args.throttled ?? false}"
        @governor-change="${(e) => console.log('Governor change requested:', e.detail)}">
    </ag-governor-card>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    cpu: cpuMock
};

/**
 * Sixty samples 20 s apart: an idle core (1–3 %) with two spikes, and the one gap the
 * page inserts where the stream paused, on the 0–100 % scale every core shares.
 */
export const WithLoad = Template.bind({});
WithLoad.args = {
    cpu: cpuMock,
    usage: 2.4,
    usageHistory: Array.from({ length: 60 }, (_, i) =>
        (i === 20 ? 64 : i === 41 ? 38 : i === 30 ? null : 1 + (i % 3))),
    usageSpan: 59 * 20 * 1000,
};

/** The core saw the kernel throttle this core for heat since its previous monitoring tick. */
export const Throttled = Template.bind({});
Throttled.args = {
    cpu: cpuMock,
    throttled: true
};
