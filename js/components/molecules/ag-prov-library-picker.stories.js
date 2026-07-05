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
