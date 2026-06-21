import { html } from 'lit';
import './ag-track-meta.js';

export default {
    title: 'Atoms/TrackMeta',
    component: 'ag-track-meta',
    argTypes: {
        title:            { control: 'text' },
        artist:           { control: 'text' },
        album:            { control: 'text' },
        year:             { control: 'number' },
        placeholderTitle: { control: 'text', name: 'placeholder-title' },
        showAlbum:        { control: 'boolean', name: 'show-album' },
    },
};

const Template = (args) => html`
    <ag-track-meta
        .title=${args.title ?? ''}
        .artist=${args.artist ?? ''}
        .album=${args.album ?? ''}
        .year=${args.year ?? null}
        placeholder-title=${args.placeholderTitle ?? ''}
        ?show-album=${args.showAlbum}
    ></ag-track-meta>
`;

export const Mini = Template.bind({});
Mini.args = {
    title: 'Spiegel im Spiegel',
    artist: 'Arvo Pärt',
    showAlbum: false,
};

export const FullscreenWithAlbum = Template.bind({});
FullscreenWithAlbum.args = {
    title: 'Spiegel im Spiegel',
    artist: 'Arvo Pärt',
    album: 'Tabula Rasa',
    year: 1984,
    showAlbum: true,
};

export const Placeholder = Template.bind({});
Placeholder.args = {
    title: '',
    placeholderTitle: 'Nothing playing',
    showAlbum: true,
};
