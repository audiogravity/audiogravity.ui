import { html } from 'lit';
import './ag-sparkline.js';

export default {
    title: 'Atoms/Sparkline',
    component: 'ag-sparkline',
    argTypes: {
        data: { control: 'object' },
        width: { control: 'number' },
        height: { control: 'number' },
        color: { control: 'text' },
        activityLevel: {
            control: 'select',
            options: ['low', 'medium', 'high', 'none']
        }
    },
};

const Template = (args) => html`
  <div style="padding: 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px;">
    <ag-sparkline 
        .data="${args.data}"
        .width="${args.width}"
        .height="${args.height}"
        .color="${args.color}"
        .activityLevel="${args.activityLevel}">
    </ag-sparkline>
  </div>
`;

export const CPUUsage = Template.bind({});
CPUUsage.args = {
    data: [10, 25, 45, 30, 60, 80, 40, 20, 35, 50],
    width: 200,
    height: 50,
    color: 'var(--chart-cpu)',
    activityLevel: 'medium'
};

export const HighActivity = Template.bind({});
HighActivity.args = {
    data: [90, 95, 88, 92, 98, 91, 94, 96, 99, 95],
    width: 200,
    height: 50,
    color: 'var(--color-error)',
    activityLevel: 'high'
};

/**
 * 'area' — the Services boxes. Values fill a 30-measurement window from the right;
 * a null is a gap; the second series (outgoing) is a thin grey line.
 */
export const MeasuredArea = () => html`
  <div style="padding: 20px; background: var(--bg-primary); border: 1px solid var(--border-color); width: 65px; height: 20px;">
    <ag-sparkline
        variant="area"
        slots="30"
        auto-scale
        .data=${[18, 21, 19, 24, null, 22, 20, 23, 25, 21, 19, 22]}
        .data2=${[2, 2, 1, 3, null, 2, 2, 1, 2, 2, 3, 2]}
        line-color="var(--chart-network)"
        fill-color="var(--chart-network-bg)"
        second-line-color="var(--chart-secondary)">
    </ag-sparkline>
  </div>
`;

/**
 * 'bars' — the System tiles. One bar per measurement, the latest in full, and
 * captions for the scale's top and the time covered.
 */
export const MeasuredBars = () => html`
  <div style="padding: 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); width: 225px; height: 40px;">
    <ag-sparkline
        variant="bars"
        slots="60"
        auto-scale
        caption-start="max 38.0%"
        caption-end="3m"
        .data=${[22, 19, 25, 21, 38, 24, 20, 23, 26, 22, 21, 24, 19, 22, 20, 23, 21, 25]}
        line-color="var(--chart-cpu)">
    </ag-sparkline>
  </div>
`;
