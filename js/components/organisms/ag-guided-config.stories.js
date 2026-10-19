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
        .librarySources=${args.librarySources} .serviceOutput=${args.serviceOutput}
        .serviceDop=${args.serviceDop ?? null} .serviceDsdFullVolume=${args.serviceDsdFullVolume ?? null}
        .serviceVolumeOnDsd=${args.serviceVolumeOnDsd ?? null}></ag-guided-config>
  </div>
`;

export const Mpd = Template.bind({});
Mpd.args = { serviceId: 'mpd', outputs: OUTPUTS, librarySources: SOURCES, serviceOutput: { usb_id: '20b1:30ab', card_name: 'Abacus', device_id: 0 } };

export const Airplay = Template.bind({});
Airplay.args = { serviceId: 'airplay', outputs: OUTPUTS, librarySources: [], serviceOutput: null };

export const Upmpdcli = Template.bind({});
Upmpdcli.args = { serviceId: 'upmpdcli', outputs: OUTPUTS, librarySources: [], serviceOutput: null };

/**
 * A HiFiBerry on a Raspberry Pi: no output of the box takes DSD as it is, so MPD turns
 * DSD into PCM before its volume — said under DSD.
 */
export const MpdOnAHat = Template.bind({});
MpdOnAHat.args = {
    serviceId: 'mpd',
    outputs: [{ hw: 'hw:0,0', card_name: 'sndrpihifiberry', usb_id: null, device_id: 0, is_usb_dac: false,
        recommended: true, label: 'sndrpihifiberry — HiFiBerry DAC+ Pro' }],
    librarySources: SOURCES,
    serviceOutput: { usb_id: null, card_name: 'sndrpihifiberry', device_id: 0 },
    serviceDop: false,
    serviceDsdFullVolume: true,
    serviceVolumeOnDsd: true,
};
