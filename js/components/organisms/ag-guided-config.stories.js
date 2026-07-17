import { html } from 'lit';
import './ag-guided-config.js';
import { DEMO_OUTPUTS as OUTPUTS, DEMO_SOURCES as SOURCES } from './audio-stack-demo-data.js';

export default {
    title: 'Organisms/GuidedConfig',
    component: 'ag-guided-config',
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 560px;">
    <ag-guided-config .serviceId=${args.serviceId} .outputs=${args.outputs}
        .librarySources=${args.librarySources} .serviceOutput=${args.serviceOutput}></ag-guided-config>
  </div>
`;

export const Mpd = Template.bind({});
Mpd.args = { serviceId: 'mpd', outputs: OUTPUTS, librarySources: SOURCES, serviceOutput: { usb_id: '20b1:30ab', card_name: 'Abacus', device_id: 0 } };

export const Airplay = Template.bind({});
Airplay.args = { serviceId: 'airplay', outputs: OUTPUTS, librarySources: [], serviceOutput: null };

export const Upmpdcli = Template.bind({});
Upmpdcli.args = { serviceId: 'upmpdcli', outputs: OUTPUTS, librarySources: [], serviceOutput: null };
