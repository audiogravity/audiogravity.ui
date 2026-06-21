import { html } from 'lit';
import './ag-config-diff.js';

export default {
    title: 'Molecules/ConfigDiff',
    component: 'ag-config-diff',
};

const oldText = `# MPD Configuration
music_directory "/var/lib/mpd/music"
playlist_directory "/var/lib/mpd/playlists"
db_file "/var/lib/mpd/tag_cache"
log_file "/var/log/mpd/mpd.log"
bind_to_address "localhost"
port "6600"`;

const newText = `# MPD Configuration
music_directory "/mnt/nas/music"
playlist_directory "/var/lib/mpd/playlists"
db_file "/var/lib/mpd/tag_cache"
log_file "/var/log/mpd/mpd.log"
bind_to_address "0.0.0.0"
port "6600"
audio_output {
    type "alsa"
    name "HiFiBerry DAC+"
}`;

export const RawDiff = {
    render: () => html`
        <div style="padding: 20px; max-width: 700px; background: var(--bg-primary);">
            <ag-config-diff
                mode="raw"
                .oldText=${oldText}
                .newText=${newText}>
            </ag-config-diff>
        </div>
    `
};

export const RawNoChanges = {
    render: () => html`
        <div style="padding: 20px; max-width: 700px; background: var(--bg-primary);">
            <ag-config-diff
                mode="raw"
                .oldText=${oldText}
                .newText=${oldText}>
            </ag-config-diff>
        </div>
    `
};

const schema = {
    music_directory: { label: 'Music Directory', type: 'string' },
    port: { label: 'Port', type: 'integer' },
    bind_to_address: { label: 'Bind Address', type: 'string' }
};

export const FormDiff = {
    render: () => html`
        <div style="padding: 20px; max-width: 700px; background: var(--bg-primary);">
            <ag-config-diff
                mode="form"
                .schema=${schema}
                .formData=${{ music_directory: '/mnt/nas/music', port: 6600, bind_to_address: '0.0.0.0' }}
                .originalFormData=${{ music_directory: '/var/lib/mpd/music', port: 6600, bind_to_address: 'localhost' }}>
            </ag-config-diff>
        </div>
    `
};
