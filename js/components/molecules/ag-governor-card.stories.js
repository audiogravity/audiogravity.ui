import { html } from 'lit';
import './ag-governor-card.js';

export default {
    title: 'Molecules/GovernorCard',
    component: 'ag-governor-card',
};

// The fields the card reads, as GET /performance/cpu/info gives them.
const cpuMock = {
    cpu_id: 0,
    physical_id: 0,
    core_id: 0,
    current_governor: 'performance',
    available_governors: ['performance', 'powersave', 'ondemand', 'schedutil'],
    current_frequency: 1500,
    min_frequency: 600,
    max_frequency: 1500
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

/**
 * A Raspberry Pi short of power slowed the processor down since the previous monitoring tick:
 * the badge shows, and the speed reads "Slowed down" — Linux's figure is the speed it asked for.
 */
export const Throttled = Template.bind({});
Throttled.args = {
    cpu: { ...cpuMock, throttle_count: null },
    throttled: true
};

/**
 * An Intel core throttled for heat: the badge shows, and the speed stays — it is measured, and
 * the throttle lowered it.
 */
export const ThrottledForHeat = Template.bind({});
ThrottledForHeat.args = {
    cpu: { ...cpuMock, current_frequency: 2182, max_frequency: 2700, throttle_count: 3 },
    throttled: true
};
