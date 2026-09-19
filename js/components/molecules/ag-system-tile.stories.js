import { html } from 'lit';
import './ag-system-tile.js';

export default {
    title: 'Molecules/SystemTile',
    component: 'ag-system-tile',
};

// These props are the ones the System dashboard passes. The previous stories set
// `chartData` and `color`, which the tile does not have, so they never drew a chart.
const Template = (args) => html`
  <div style="padding: 20px; max-width: 300px; display: grid; gap: 20px;">
    <ag-system-tile
        .title="${args.title}"
        .value="${args.value}"
        .unit="${args.unit}"
        .icon="${args.icon}"
        .detail="${args.detail}"
        .sparklineData="${args.sparklineData}"
        .sparklineColor="${args.sparklineColor}"
        .sparklineFill="${args.sparklineFill}"
        .sparklineSlots="${args.sparklineSlots}"
        .sparklineSpan="${args.sparklineSpan}">
    </ag-system-tile>
  </div>
`;

/** A full window: sixty measurements at the core's default 10 s rate. */
export const CPU = Template.bind({});
CPU.args = {
    title: 'CPU Usage',
    value: '24.0',
    unit: '%',
    icon: 'icon-chip',
    detail: 'Load: 0.42, 0.38, 0.35',
    sparklineData: Array.from({ length: 60 }, (_, i) => 18 + (i % 7) + (i === 41 ? 20 : 0)),
    sparklineColor: 'var(--chart-cpu)',
    sparklineFill: 'var(--chart-cpu-bg)',
    sparklineSlots: 60,
    sparklineSpan: 590 * 1000,
};

/** One minute after opening the tab: six bars on the right, the rest of the window empty. */
export const JustOpened = Template.bind({});
JustOpened.args = {
    ...CPU.args,
    sparklineData: [22, 19, 25, 21, 38, 24],
    sparklineSpan: 50 * 1000,
};

/** A missing reading is a gap, not a zero. */
export const Temperature = Template.bind({});
Temperature.args = {
    title: 'Temperature',
    value: '52.0',
    unit: '°C',
    icon: 'icon-thermometer',
    detail: 'Core Temp',
    sparklineData: [50, 51, 52, null, 53, 52, 52, 52, 51, 52],
    sparklineColor: 'var(--chart-temperature)',
    sparklineFill: 'var(--chart-temperature-bg)',
    sparklineSlots: 60,
    sparklineSpan: 90 * 1000,
};
