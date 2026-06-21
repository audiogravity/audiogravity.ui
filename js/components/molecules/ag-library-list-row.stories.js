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
