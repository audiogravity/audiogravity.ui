import { html } from 'lit';
import './ag-guided-config.js';

export default {
    title: 'Organisms/GuidedConfig',
    component: 'ag-guided-config',
};

const OUTPUTS = [
    { hw: 'hw:2,0', card_name: 'Abacus', usb_id: '20b1:30ab', device_id: 0, is_usb_dac: true, recommended: true, label: 'Abacus — USB Audio' },
    { hw: 'hw:0,0', card_name: 'PCH', usb_id: null, device_id: 0, is_usb_dac: false, recommended: false, label: 'PCH — onboard' },
];
const SOURCES = [
    { kind: 'usb', uuid: 'u-1', fstype: 'ext4', path: '/mnt/aglibrary', label: 'MUSIC (ext4)' },
    { kind: 'mount', fstype: 'cifs', path: '/mnt/musics', label: '/mnt/musics (cifs)' },
];

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
