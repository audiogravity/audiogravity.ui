import { html } from 'lit';
import './ag-library-playlist-btn.js';

export default {
    title: 'Atoms/LibraryPlaylistBtn',
    component: 'ag-library-playlist-btn',
    argTypes: {
        variant: { control: 'select', options: ['row', 'card', 'player'] },
    },
};

const Template = (args) => html`
  <ag-library-playlist-btn
    variant="${args.variant}"
    @playlist-add=${() => console.log('playlist-add')}>
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
