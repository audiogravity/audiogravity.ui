import { html } from 'lit';
import './ag-source-badge.js';
import { ORIGIN_LABELS } from '../library-constants.js';

export default {
    title: 'Atoms/SourceBadge',
    component: 'ag-source-badge',
    argTypes: {
        origin: { control: 'select', options: Object.keys(ORIGIN_LABELS) },
        name: { control: 'text' },
    },
};

const Template = (args) => html`
  <ag-source-badge .origin=${args.origin} .name=${args.name ?? ''}></ag-source-badge>
`;

export const Tidal = Template.bind({});
Tidal.args = { origin: 'tidal', name: '' };

export const Qobuz = Template.bind({});
Qobuz.args = { origin: 'qobuz', name: '' };

export const Highresaudio = Template.bind({});
Highresaudio.args = { origin: 'highresaudio', name: '' };

export const Radio = Template.bind({});
Radio.args = { origin: 'radio', name: 'FIP' };

export const UpnpServer = Template.bind({});
UpnpServer.args = { origin: 'upnp', name: 'MinimServer' };

export const LocalLibrary = Template.bind({});
LocalLibrary.args = { origin: 'library', name: '' };

/** All providers side by side. */
export const Gallery = () => html`
  <div style="display:flex; gap:var(--spacing-sm); flex-wrap:wrap;">
    ${Object.keys(ORIGIN_LABELS).map(
        (o) => html`<ag-source-badge .origin=${o}></ag-source-badge>`
    )}
  </div>
`;
