import { html } from 'lit';
import './ag-dsd-delivery.js';

export default {
    title: 'Atoms/DsdDelivery',
    component: 'ag-dsd-delivery',
    argTypes: {
        delivery: { control: 'select', options: ['native', 'dop', 'pcm', null] },
    },
};

const Template = (args) => html`
  <div style="padding: 20px;">
    <span>DSD | DSD128</span> <ag-dsd-delivery .delivery=${args.delivery}></ag-dsd-delivery>
  </div>
`;

/** Reaches the DAC as DSD: nothing more than the format. */
export const Native = Template.bind({});
Native.args = { delivery: 'native' };

export const DoP = Template.bind({});
DoP.args = { delivery: 'dop' };

export const ConvertedToPcm = Template.bind({});
ConvertedToPcm.args = { delivery: 'pcm' };
