import { html } from 'lit';
import './ag-systemd-override-editor.js';
import './ag-modal.js';

export default {
    title: 'Organisms/SystemdOverrideEditor',
    component: 'ag-systemd-override-editor',
};

const serviceMock = {
    name: 'mpd.service',
    display_name: 'Music Player Daemon',
    properties: {
        cpu_affinity: '0,1',
        cpu_scheduling_policy: 'fifo',
        cpu_scheduling_priority: 50,
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
