import { html } from 'lit';
import './ag-config-editor.js';

// Setup Mock Environment
if (!window.showConfirm) {
    window.showConfirm = (title, msg) => {
        console.log('CONFIRM', title, msg);
        return Promise.resolve(true);
    };
}
if (!window.showToast) {
    window.showToast = (type, title, msg) => console.log('TOAST', type, title, msg);
}

export default {
    title: 'Organisms/ConfigEditor',
    component: 'ag-config-editor',
};

const serviceMock = {
    id: 'mpd',
    displayName: 'Music Player Daemon',
    path: '/etc/mpd.conf'
};

const schemaMock = {
    music_directory: { type: 'string', label: 'Music Directory', description: 'Path to your music collection', required: true },
    port: { type: 'integer', label: 'Port', description: 'MPD listening port', min: 1, max: 65535, default: 6600 },
    auto_update: { type: 'boolean', label: 'Auto Update', description: 'Automatically update database' },
    log_level: { type: 'enum', label: 'Log Level', options: ['default', 'secure', 'verbose'], default: 'default' },
    extra_options: { type: 'object', label: 'Extra Options', description: 'Raw JSON options' }
};

const formDataMock = {
    music_directory: '/var/lib/mpd/music',
    port: 6600,
    auto_update: true,
    log_level: 'verbose',
    extra_options: { "max_output_buffer_size": 16384 }
};

const rawContentMock = `# MPD Configuration
music_directory "/var/lib/mpd/music"
playlist_directory "/var/lib/mpd/playlists"
db_file "/var/lib/mpd/tag_cache"
log_file "/var/log/mpd/mpd.log"
pid_file "/run/mpd/pid"
state_file "/var/lib/mpd/state"
sticker_file "/var/lib/mpd/sticker.sql"

port "6600"
log_level "verbose"
auto_update "yes"
`;

const Template = (args) => html`
  <div style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
    <ag-config-editor 
        .service="${args.service}"
        .schema="${args.schema}"
        .formData="${args.formData}"
        .rawContent="${args.rawContent}"
        .configFormat="${args.configFormat}"
        .backups="${args.backups}"
        ?is-guest="${args.isGuest}"
        .guided="${args.guided}"
        .outputs="${args.outputs}"
        .librarySources="${args.librarySources}"
        .serviceOutput="${args.serviceOutput}">
    </ag-config-editor>
  </div>
`;

export const FormMode = Template.bind({});
FormMode.args = {
    service: serviceMock,
    schema: schemaMock,
    formData: formDataMock,
    rawContent: rawContentMock,
    configFormat: 'conf',
    backups: [
        { filename: 'mpd.conf.bak.20260301', date: '2026-03-01' },
        { filename: 'mpd.conf.bak.20260228', date: '2026-02-28' }
    ],
    isGuest: false
};

export const GuestMode = Template.bind({});
GuestMode.args = {
    ...FormMode.args,
    isGuest: true
};

export const GuidedMode = Template.bind({});
GuidedMode.args = {
    ...FormMode.args,
    guided: true,
    outputs: [
        { hw: 'hw:2,0', card_name: 'Abacus', usb_id: '20b1:30ab', device_id: 0, is_usb_dac: true, recommended: true, label: 'Abacus — USB Audio' },
        { hw: 'hw:0,0', card_name: 'PCH', usb_id: null, device_id: 0, is_usb_dac: false, recommended: false, label: 'PCH — onboard' }
    ],
    librarySources: [
        { kind: 'usb', uuid: 'u-1', fstype: 'ext4', path: '/mnt/aglibrary', label: 'MUSIC (ext4)' }
    ],
    serviceOutput: { usb_id: '20b1:30ab', card_name: 'Abacus', device_id: 0 }
};
