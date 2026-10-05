import { html } from 'lit';
import './ag-systemd-card.js';

export default {
    title: 'Molecules/SystemdCard',
    component: 'ag-systemd-card',
};

const serviceMock = {
    name: 'ag-core-server',
    description: 'AudioGravity Core Backend',
    active: 'active',
    substate: 'running',
    unit: 'ag-core-server.service'
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 400px;">
    <ag-systemd-card 
        .service="${args.service}"
        .delayIndex="${0}"
        @edit-service="${(e) => console.log('Edit service:', e.detail)}">
    </ag-systemd-card>
  </div>
`;

export const Running = Template.bind({});
Running.args = {
    service: serviceMock
};

export const Failed = Template.bind({});
Failed.args = {
    service: { ...serviceMock, active: 'failed', substate: 'exited' }
};

/** A service the audio chain depends on: CRITICAL, a tint without a frame, the same tag
 *  as on the Services and Config cards. */
export const Critical = Template.bind({});
Critical.args = {
    service: { ...serviceMock, name: 'HQPlayer NAA', systemd_unit: 'networkaudiod.service', critical: true }
};
