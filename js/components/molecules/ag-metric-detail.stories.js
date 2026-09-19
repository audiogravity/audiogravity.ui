import { html } from 'lit';
import './ag-metric-detail.js';

export default {
    title: 'Molecules/MetricDetail',
    component: 'ag-metric-detail',
    argTypes: {
        label: { control: 'text' },
        color: { control: 'color' },
        unit: { 
            control: 'select', 
            options: ['', '%', 'mem', 'rate'] 
        }
    }
};

const mockData = Array.from({ length: 30 }, () => Math.random() * 100);

const Template = (args) => html`
  <div style="padding: 20px; max-width: 300px; background: var(--bg-secondary); border-radius: 8px;">
    <ag-metric-detail 
        .label="${args.label}"
        .color="${args.color}"
        .unit="${args.unit}"
        .slots="${args.slots ?? 0}"
        .data="${args.data}">
    </ag-metric-detail>
  </div>
`;

export const Percentage = Template.bind({});
Percentage.args = {
    label: 'CPU Usage',
    color: 'var(--accent-primary)',
    unit: '%',
    data: mockData
};

export const Memory = Template.bind({});
Memory.args = {
    label: 'Memory Usage',
    color: 'var(--accent-secondary)',
    unit: 'mem',
    data: Array.from({ length: 30 }, () => Math.random() * 1024 * 1024 * 1024)
};

export const Rate = Template.bind({});
Rate.args = {
    label: 'Network Rate',
    color: 'var(--status-success)',
    unit: 'rate',
    data: Array.from({ length: 30 }, () => Math.random() * 500000)
};

/**
 * The cases the Services boxes meet now that their history starts empty: the view
 * places what it has on the same 30-measurement window as the small chart.
 */

/** One minute after opening the tab: three measurements on the right. */
export const PartialWindow = Template.bind({});
PartialWindow.args = {
    label: 'CPU Usage',
    color: 'var(--accent-primary)',
    unit: '%',
    slots: 30,
    data: [1.2, 1.6, 1.4],
};

/** The very first measurement: a point, not an empty chart. */
export const LonePoint = Template.bind({});
LonePoint.args = { ...PartialWindow.args, data: [1.2] };

/** A missing sample is a gap, and one measured alone between gaps is a point. */
export const WithGaps = Template.bind({});
WithGaps.args = {
    ...PartialWindow.args,
    data: [1.2, 1.6, 1.4, null, 2.1, null, 1.8, 1.9, 2.4, 2.2],
};

/** The newest sample is missing: the figure shows a dash, not an older value. */
export const StaleValue = Template.bind({});
StaleValue.args = { ...PartialWindow.args, data: [1.2, 1.6, 1.4, null] };
