import { html } from 'lit';
import './ag-library-fav-btn.js';

export default {
    title: 'Atoms/LibraryFavBtn',
    component: 'ag-library-fav-btn',
    argTypes: {
        favorite: { control: 'boolean' },
        variant:  { control: 'select', options: ['row', 'card'] },
    },
};

const Template = (args) => html`
  <ag-library-fav-btn
    ?favorite=${args.favorite}
    variant="${args.variant}"
    @fav-toggle=${(e) => console.log('fav-toggle', e.detail)}>
  </ag-library-fav-btn>
`;

export const Row = Template.bind({});
Row.args = { favorite: false, variant: 'row' };

export const RowFavorited = Template.bind({});
RowFavorited.args = { favorite: true, variant: 'row' };

export const CardOverlay = (args) => html`
  <div class="lib-ac-wrap" style="position:relative;display:inline-block;width:120px;height:120px;background:#ccc">
    <ag-library-fav-btn ?favorite=${args.favorite} variant="card"></ag-library-fav-btn>
  </div>
`;
CardOverlay.args = { favorite: true };
