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
