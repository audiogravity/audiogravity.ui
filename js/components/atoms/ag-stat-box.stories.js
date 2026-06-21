import { html } from 'lit';
import './ag-stat-box.js';
import './ag-sparkline.js';

export default {
    title: 'Atoms/StatBox',
    component: 'ag-stat-box',
    argTypes: {
        label: { control: 'text' },
        value: { control: 'text' },
        unit: { control: 'text' },
        state: {
            control: 'select',
            options: ['active', 'warning', 'error', 'success', 'none']
        },
        variant: {
            control: 'select',
            options: ['primary', 'secondary', 'tertiary']
        }
    },
};

const Template = (args) => html`
  <div style="padding: 20px; background: var(--bg-primary); display: flex; gap: 1rem;">
    <ag-stat-box 
        .label="${args.label}" 
        .value="${args.value}" 
        .unit="${args.unit}" 
        .state="${args.state}"
        .variant="${args.variant}">
    </ag-stat-box>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    label: 'CPU Usage',
    value: '45.2',
    unit: '%',
    state: 'active',
    variant: 'primary'
};

export const Warning = Template.bind({});
Warning.args = {
    label: 'Temperature',
    value: '72.5',
    unit: '°C',
    state: 'warning',
    variant: 'primary'
};

export const ErrorState = Template.bind({});
ErrorState.args = {
    label: 'Load Average',
    value: '4.50',
    unit: '',
    state: 'error',
    variant: 'primary'
};

export const WithSparkline = (args) => {
    const data = Array.from({length: 20}, () => Math.random() * 100);
    return html`
    <div style="padding: 20px; background: var(--bg-primary); display: flex; gap: 1rem;">
        <ag-stat-box 
            .label="${args.label}" 
            .value="${args.value}" 
            .unit="${args.unit}" 
            .state="${args.state}">
            <ag-sparkline 
                slot="chart" 
                .data="\${data}" 
                line-color="var(--chart-cpu)" 
                line-width="1.5" 
                auto-scale 
                min-value="0" 
                max-value="100">
            </ag-sparkline>
        </ag-stat-box>
    </div>
    `;
};
WithSparkline.args = {
    label: 'Network Load',
    value: '1.2',
    unit: 'MB/s',
    state: 'active'
};
