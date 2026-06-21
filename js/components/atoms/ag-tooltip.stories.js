import { html } from 'lit';
import './ag-tooltip.js';

export default {
    title: 'Atoms/Tooltip',
    component: 'ag-tooltip',
    argTypes: {
        text: { control: 'text' },
        position: {
            control: 'select',
            options: ['tooltip-top', 'tooltip-bottom-right']
        }
    },
};

const Template = (args) => html`
  <div style="padding: 100px; display: flex; justify-content: center;">
    <ag-tooltip 
        .text="${args.text}"
        .position="${args.position}">
        <button class="action-btn secondary">Hover me</button>
    </ag-tooltip>
  </div>
`;

export const Top = Template.bind({});
Top.args = {
    text: 'This is a helpful hint!',
    position: 'tooltip-top'
};

export const BottomRight = Template.bind({});
BottomRight.args = {
    text: 'Alternative position',
    position: 'tooltip-bottom-right'
};
