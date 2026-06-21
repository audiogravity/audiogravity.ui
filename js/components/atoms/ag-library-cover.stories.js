import { html } from 'lit';
import './ag-library-cover.js';

export default {
    title: 'Atoms/LibraryCover',
    component: 'ag-library-cover',
    argTypes: {
        cover: { control: 'text' },
        fallback: {
            control: 'select',
            options: ['list', 'album', 'container', 'track', 'radio', 'next', 'queue', 'play'],
        },
        size: { control: 'number' },
    },
};

const Template = (args) => html`
  <ag-library-cover
    cover="${args.cover ?? ''}"
    fallback="${args.fallback}"
    size="${args.size}">
  </ag-library-cover>
`;

export const FallbackList = Template.bind({});
FallbackList.args = { cover: '', fallback: 'list', size: 40 };

export const FallbackAlbum = Template.bind({});
FallbackAlbum.args = { cover: '', fallback: 'album', size: 40 };

export const FallbackRadio = Template.bind({});
FallbackRadio.args = { cover: '', fallback: 'radio', size: 40 };

export const CardSize = Template.bind({});
CardSize.args = { cover: '', fallback: 'album', size: 120 };

export const WithCover = Template.bind({});
WithCover.args = {
    cover: 'https://picsum.photos/seed/audiogravity/200',
    fallback: 'album',
    size: 120,
};

export const BrokenCover = Template.bind({});
BrokenCover.args = {
    cover: 'https://example.invalid/missing.jpg',
    fallback: 'album',
    size: 40,
};

export const CardWithOverlay = (args) => html`
  <div class="lib-ac-wrap" style="position:relative;display:inline-block">
    <ag-library-cover
        cover="${args.cover ?? ''}"
        fallback="album"
        size="120">
    </ag-library-cover>
    <button
        class="lib-ac-add"
        style="position:absolute;bottom:6px;right:6px;width:24px;height:24px;background:rgba(0,0,0,0.55);color:#fff;border:0;cursor:pointer">
        +
    </button>
  </div>
`;
CardWithOverlay.args = { cover: 'https://picsum.photos/seed/agcard/240' };
