import { html } from 'lit';
import './ag-system-tile.js';

export default {
    title: 'Molecules/SystemTile',
    component: 'ag-system-tile',
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 300px; display: grid; gap: 20px;">
    <ag-system-tile 
        .title="${args.title}"
        .value="${args.value}"
        .unit="${args.unit}"
        .icon="${args.icon}"
        .chartData="${args.chartData}"
        .color="${args.color}"
        .activityLevel="${args.activityLevel}">
    </ag-system-tile>
  </div>
`;

export const CPU = Template.bind({});
CPU.args = {
    title: 'CPU Usage',
    value: '24',
    unit: '%',
    icon: 'icon-cpu',
    chartData: [10, 15, 25, 20, 30, 24, 28, 22, 25, 24],
    color: 'var(--chart-cpu)',
    activityLevel: 'low'
};

export const Temperature = Template.bind({});
Temperature.args = {
    title: 'Temperature',
    value: '52',
    unit: '°C',
    icon: 'icon-temp',
    chartData: [50, 51, 52, 52, 53, 52, 52, 52, 51, 52],
    color: 'var(--chart-temperature)',
    activityLevel: 'medium'
};
