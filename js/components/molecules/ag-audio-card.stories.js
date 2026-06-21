import { html } from 'lit';
import './ag-audio-card.js';

export default {
    title: 'Molecules/AudioCard',
    component: 'ag-audio-card',
};

const cardMock = {
    card_id: 0,
    card_name: 'bcm2835 ALSA',
    long_name: 'bcm2835 ALSA at 0x00000000, irq 37',
    usb_id: null,
    usb_bus: null,
    devices: [
        { name: 'bcm2835 ALSA', subdevices_available: 7, subdevices_total: 8 },
        { name: 'bcm2835 IEC958/HDMI', subdevices_available: 1, subdevices_total: 1 }
    ]
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 400px;">
    <ag-audio-card .card="${args.card}"></ag-audio-card>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    card: cardMock
};
