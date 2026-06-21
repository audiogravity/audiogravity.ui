import { html } from 'lit';
import './ag-radio-card.js';

export default {
    title: 'Molecules/RadioCard',
    component: 'ag-radio-card',
    argTypes: {
        favorite:  { control: 'boolean' },
        inLibrary: { control: 'boolean' },
        editable:  { control: 'boolean' },
        swipeable: { control: 'boolean' },
    },
};

const SAMPLE_STATION = {
    uuid:    '78012206-1aa1-11e9-a80b-52543be04c81',
    name:    'MANGORADIO',
    url:     'https://mangoradio.stream.laut.fm/mangoradio',
    codec:   'MP3',
    bitrate: 128,
    country: 'Germany',
    favicon: 'https://mangoradio.de/wp-content/uploads/cropped-Logo-192x192.webp',
};

const Template = (args) => html`
    <ag-radio-card
        .station=${args.station ?? SAMPLE_STATION}
        ?favorite=${args.favorite}
        ?in-library=${args.inLibrary}
        ?editable=${args.editable}
        ?swipeable=${args.swipeable}
    ></ag-radio-card>
`;

export const Default = Template.bind({});
Default.args = { favorite: false, inLibrary: false, editable: false, swipeable: false };

export const InLibraryOnly = Template.bind({});
InLibraryOnly.args = { favorite: false, inLibrary: true, editable: false, swipeable: true };

export const FavoriteOnly = Template.bind({});
FavoriteOnly.args = { favorite: true, inLibrary: false, editable: false, swipeable: true };

export const InLibraryAndFavorite = Template.bind({});
InLibraryAndFavorite.args = { favorite: true, inLibrary: true, editable: false, swipeable: true };

// Saved station with edit affordance — pencil shown alongside the toggles.
// Available on every saved row (RBI catalogue + custom) in My Live Radio &
// Favorites tabs; the organism sets editable=true regardless of is_custom.
export const Editable = Template.bind({});
Editable.args = {
    favorite: true, inLibrary: true, editable: true, swipeable: true,
    station: { ...SAMPLE_STATION, name: 'FIP' },
};

// Missing favicon — the cover atom degrades to the radio glyph (no homepage fallback).
export const NoFavicon = Template.bind({});
NoFavicon.args = {
    favorite: false, inLibrary: false, editable: false, swipeable: false,
    station: { ...SAMPLE_STATION, favicon: '' },
};

export const HiResFlac = Template.bind({});
HiResFlac.args = {
    favorite: true, inLibrary: true, editable: false, swipeable: true,
    station: {
        ...SAMPLE_STATION,
        name:    'Radio Paradise — Main Mix (FLAC)',
        codec:   'FLAC',
        bitrate: 850,
        country: 'United States',
    },
};
