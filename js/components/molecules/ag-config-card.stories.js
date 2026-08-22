import { html } from 'lit';
import './ag-config-card.js';

export default {
    title: 'Molecules/ConfigCard',
    component: 'ag-config-card',
    args: { provisionable: true, configured: true },
};

// `path` is the field the component reads — `config_file` from the API response
// is mapped to it by ag-config-page before the tile ever sees it. Same for
// `fileExists` / `isInstalled`, mapped from `file_exists` / `is_installed`.
const serviceMock = {
    id: 'mpd',
    name: 'MPD',
    displayName: 'Music Player Daemon',
    description: 'Music Player Daemon',
    path: '/etc/mpd.conf',
    audioOutput: 'hw:0,0',
    status: 'active',
    fileMtime: '2026-08-20T09:12:00Z',
    backupCount: 2,
    isInstalled: true,
    fileExists: true,
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 350px;">
    <ag-config-card
        .service="${args.service}"
        .delayIndex="${0}"
        ?provisionable="${args.provisionable}"
        ?configured="${args.configured}"
        @edit-config="${(e) => console.log('Edit config:', e.detail)}">
    </ag-config-card>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    service: serviceMock
};

/** Installed but idle — the state systemd's unit list does not report. */
export const Stopped = Template.bind({});
Stopped.args = {
    service: { ...serviceMock, id: 'upmpdcli', displayName: 'UPnP Bridge',
               path: '/etc/upmpdcli.conf', status: 'inactive', audioOutput: null }
};

export const Failed = Template.bind({});
Failed.args = {
    service: { ...serviceMock, status: 'failed' }
};

/** Package absent: greyed out, named as such, and nothing left to click. */
export const NotInstalled = Template.bind({});
NotInstalled.args = {
    service: { ...serviceMock, id: 'airplay', displayName: 'AirPlay Receiver',
               path: '/etc/shairport-sync.conf', audioOutput: null,
               fileMtime: null, backupCount: 0, fileExists: false, isInstalled: false }
};

/** Removed without --purge: the package is gone but its conffile stays, so the
 *  file can still be downloaded. Editing is refused — saving would restart a
 *  service that is not there. */
export const NotInstalledConfigLeftBehind = Template.bind({});
NotInstalledConfigLeftBehind.args = {
    service: { ...serviceMock, id: 'airplay', displayName: 'AirPlay Receiver',
               path: '/etc/shairport-sync.conf', audioOutput: null,
               isInstalled: false }
};

/** Installed, but its file is gone — deleted by hand, or never shipped. The
 *  editor stays open because it creates the file; only the download is refused. */
export const InstalledWithoutConfigFile = Template.bind({});
InstalledWithoutConfigFile.args = {
    service: { ...serviceMock, fileMtime: null, backupCount: 0, fileExists: false }
};
