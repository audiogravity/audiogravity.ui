import { html } from 'lit';
import './ag-library-playlist-btn.js';

export default {
    title: 'Atoms/LibraryPlaylistBtn',
    component: 'ag-library-playlist-btn',
    argTypes: {
        mode: { control: 'select', options: ['add', 'remove', 'open'] },
        variant: { control: 'select', options: ['row', 'card', 'player'] },
    },
};

const Template = (args) => html`
  <ag-library-playlist-btn
    mode="${args.mode ?? 'add'}"
    variant="${args.variant}"
    @playlist-add=${() => console.log('playlist-add')}
    @playlist-remove=${() => console.log('playlist-remove')}
    @playlist-open=${() => console.log('playlist-open')}>
  </ag-library-playlist-btn>
`;

export const Row = Template.bind({});
Row.args = { variant: 'row' };

export const Player = Template.bind({});
Player.args = { variant: 'player' };

export const CardOverlay = () => html`
  <div class="lib-ac-wrap" style="position:relative;display:inline-block;width:120px;height:120px;background:#ccc">
    <ag-library-playlist-btn variant="card"></ag-library-playlist-btn>
  </div>
`;

/** Take a track out of the account's playlist — a row of a playlist page. */
export const Remove = Template.bind({});
Remove.args = { mode: 'remove', variant: 'row' };

/** Open a playlist's page — the bottom-left corner of a playlist card, which has no ★. */
export const OpenOnCard = () => html`
  <div class="lib-ac-wrap" style="position:relative;display:inline-block;width:120px;height:120px;background:var(--bg-tertiary)">
    <ag-library-playlist-btn mode="open" variant="card"></ag-library-playlist-btn>
  </div>
`;
