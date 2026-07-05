import { html } from 'lit';
import './ag-prov-output-picker.js';

export default {
    title: 'Molecules/ProvOutputPicker',
    component: 'ag-prov-output-picker',
};

const OUTPUTS = [
    { hw: 'hw:2,0', card_name: 'Abacus', usb_id: '20b1:30ab', device_id: 0, is_usb_dac: true, recommended: true, label: 'Abacus — USB Audio' },
    { hw: 'hw:0,0', card_name: 'PCH', usb_id: null, device_id: 0, is_usb_dac: false, recommended: false, label: 'PCH — onboard' },
    { hw: 'hw:0,3', card_name: 'HDMI', usb_id: null, device_id: 3, is_usb_dac: false, recommended: false, label: 'HDMI 0' },
];

const Template = (args) => html`
  <div style="padding: 20px; max-width: 480px;">
    <ag-prov-output-picker .outputs=${args.outputs} .selected=${args.selected}></ag-prov-output-picker>
  </div>
`;

export const Default = Template.bind({});
Default.args = { outputs: OUTPUTS, selected: 'hw:2,0' };

export const NoneDetected = Template.bind({});
NoneDetected.args = { outputs: [], selected: null };
