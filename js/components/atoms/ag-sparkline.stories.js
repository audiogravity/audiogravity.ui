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
