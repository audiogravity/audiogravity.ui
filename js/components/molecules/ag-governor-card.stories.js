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
        @governor-change="${(e) => console.log('Governor change requested:', e.detail)}">
    </ag-governor-card>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    cpu: cpuMock
};
