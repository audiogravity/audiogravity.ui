import { html } from 'lit';
import './ag-systemd-override-editor.js';
import './ag-modal.js';

export default {
    title: 'Organisms/SystemdOverrideEditor',
    component: 'ag-systemd-override-editor',
};

// As the Systemd page hands a service over: its label as `name`, its unit beside it.
const serviceMock = {
    name: 'Music Player Daemon',
    systemd_unit: 'mpd.service',
    // What the core says with MPD's properties: it gives its own sound threads 40.
    own_sound_rt_priority: 40,
    properties: {
        cpu_affinity: '0,1',
        cpu_scheduling_policy: 'fifo',
        cpu_scheduling_priority: 30,
        nice: -10,
        io_scheduling_class: 'realtime',
        io_scheduling_priority: 4,
        memory_max: '2G',
        io_accounting: true,
        ip_accounting: true
    }
};

const Template = (args) => html`
  <div style="height: 600px; background: var(--bg-primary);">
    <button class="action-btn" @click=${() => {
        const editor = document.querySelector('ag-systemd-override-editor');
        editor.isOpen = true;
    }}>Open Editor</button>
    
    <ag-systemd-override-editor 
        ?is-open="${args.isOpen}"
        .service="${args.service}"
        ?is-saving="${args.isSaving}"
        @save="${(e) => console.log('SAVE', e.detail)}"
        @cancel="${() => console.log('CANCEL')}">
    </ag-systemd-override-editor>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    isOpen: true,
    service: serviceMock,
    isSaving: false
};

export const Saving = Template.bind({});
Saving.args = {
    isOpen: true,
    service: serviceMock,
    isSaving: true
};

/**
 * MPD set above its own sound threads — the old Audio Optimized preset's FIFO 80. The
 * warning under the priority says why the sound can drop out.
 */
export const MpdAboveItsSound = Template.bind({});
MpdAboveItsSound.args = {
    isOpen: true,
    service: { ...serviceMock, properties: { ...serviceMock.properties, cpu_scheduling_priority: 80 } },
    isSaving: false
};

