import { html } from 'lit';
import './ag-library-list-row.js';

export default {
    title: 'Molecules/LibraryListRow',
    component: 'ag-library-list-row',
    argTypes: {
        cover:      { control: 'text' },
        fallback:   { control: 'select', options: ['list', 'album', 'track', 'container', 'radio'] },
        title:      { control: 'text' },
        subtitle:   { control: 'text' },
        actionable: { control: 'boolean' },
        wide:       { control: 'boolean' },
    },
};

const Template = (args) => html`
  <div style="max-width:480px;border:1px solid #ccc">
    <ag-library-list-row
        cover="${args.cover ?? ''}"
        fallback="${args.fallback}"
        title="${args.title}"
        subtitle="${args.subtitle}"
        ?actionable="${args.actionable}"
        ?wide="${args.wide}"
        @row-click=${() => console.log('row-click')}
        @row-action=${() => console.log('row-action')}>
    </ag-library-list-row>
  </div>
`;

export const AlbumRow = Template.bind({});
AlbumRow.args = {
    cover: 'https://picsum.photos/seed/listrow/80',
    fallback: 'album',
    title: 'A Crow Looked at Me',
    subtitle: 'Mount Eerie · 2017',
    actionable: true,
};

export const TrackRow = Template.bind({});
TrackRow.args = {
    cover: '',
    fallback: 'track',
    title: 'Real Death',
    subtitle: 'Mount Eerie — A Crow Looked at Me',
    actionable: true,
};

export const NoAction = Template.bind({});
NoAction.args = {
    cover: '',
    fallback: 'list',
    title: 'Playlists',
    subtitle: '',
    actionable: false,
};

/**
 * A row whose artwork is a 2:1 banner (HIGHRESAUDIO's editorial playlists). The row keeps
 * the height it has everywhere else — the thumbnail takes twice the width instead — so a
 * list mixing both shapes does not change rhythm from one row to the next.
 */
export const BannerRow = Template.bind({});
BannerRow.args = {
    cover: 'https://picsum.photos/seed/agbannerrow/410/205',
    fallback: 'list',
    title: 'Montreux Jazz Festival — The Greatest Live Performances',
    subtitle: 'Playlist · Editor’s Pick',
    actionable: true,
    wide: true,
};
