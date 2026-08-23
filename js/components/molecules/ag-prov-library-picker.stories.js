import { html } from 'lit';
import './ag-prov-library-picker.js';

export default {
    title: 'Molecules/ProvLibraryPicker',
    component: 'ag-prov-library-picker',
};

const SOURCES = [
    { kind: 'usb', uuid: 'u-1', fstype: 'ext4', path: '/mnt/aglibrary', label: 'MUSIC (ext4)' },
    { kind: 'mount', fstype: 'cifs', path: '/mnt/musics', label: '/mnt/musics (cifs)' },
    { kind: 'mount', fstype: 'ext4', path: '/srv/media', label: '/srv/media' },
];

const Template = (args) => html`
  <div style="padding: 20px; max-width: 480px;">
    <ag-prov-library-picker .sources=${args.sources} .choice=${args.choice} .manualPath=${args.manualPath}></ag-prov-library-picker>
  </div>
`;

export const Default = Template.bind({});
Default.args = { sources: SOURCES, choice: 'src:0', manualPath: '' };

export const ManualPath = Template.bind({});
ManualPath.args = { sources: SOURCES, choice: 'manual', manualPath: '/mnt/musics' };

export const NoSourcesDetected = Template.bind({});
NoSourcesDetected.args = { sources: [], choice: null, manualPath: '' };

/**
 * The deliberate "no local library" choice — a streaming-only box, an AirPlay
 * receiver, a UPnP bridge. Worth looking at on its own: it carries the only new
 * icon, and its label is the longest of the list, so it is where
 * `text-overflow: ellipsis` on `.ag-prov-card-label` shows up first.
 */
export const NoLibrary = Template.bind({});
NoLibrary.args = { sources: SOURCES, choice: 'none', manualPath: '' };

/** The same choice on a box where nothing was detected either — the case an
 *  owner with no local music actually meets. */
export const NoLibraryAndNoSources = Template.bind({});
NoLibraryAndNoSources.args = { sources: [], choice: 'none', manualPath: '' };
