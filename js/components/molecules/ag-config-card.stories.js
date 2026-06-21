import { html } from 'lit';
import './ag-config-card.js';

export default {
    title: 'Molecules/ConfigCard',
    component: 'ag-config-card',
};

const serviceMock = {
    id: 'mpd',
    name: 'MPD',
    displayName: 'Music Player Daemon',
    description: 'Music Player Daemon',
    has_config: true,
    config_path: '/etc/mpd.conf',
    audioOutput: 'hw:0,0'
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 350px;">
    <ag-config-card 
        .service="${args.service}"
        .delayIndex="${0}"
        @edit-config="${(e) => console.log('Edit config:', e.detail)}">
    </ag-config-card>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    service: serviceMock
};
