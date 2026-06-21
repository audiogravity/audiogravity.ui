import { html } from 'lit';
import './ag-audio-output.js';

export default {
    title: 'Atoms/AudioOutput',
    component: 'ag-audio-output',
    argTypes: {
        value: { control: 'text' }
    },
};

const Template = (args) => html`
  <div style="padding: 24px; background: var(--bg-secondary);">
    <ag-audio-output .value="${args.value}"></ag-audio-output>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    value: 'hw:CARD=Audio,DEV=0'
};

export const LongName = Template.bind({});
LongName.args = {
    value: 'Very Long Audio Device Name with Multiple Parameters and Details'
};
