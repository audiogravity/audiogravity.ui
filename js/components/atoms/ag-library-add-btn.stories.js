import { html } from 'lit';
import './ag-library-add-btn.js';

export default {
    title: 'Atoms/LibraryAddBtn',
    component: 'ag-library-add-btn',
    argTypes: {
        label:   { control: 'text' },
        variant: { control: 'select', options: ['row', 'card'] },
    },
};

const Template = (args) => html`
  <ag-library-add-btn
    label="${args.label}"
    variant="${args.variant}"
    @click=${() => console.log('add clicked')}>
  </ag-library-add-btn>
`;

export const Row = Template.bind({});
Row.args = { label: 'Add to queue', variant: 'row' };

export const CardOverlay = (args) => html`
  <div class="lib-ac-wrap" style="position:relative;display:inline-block;width:120px;height:120px;background:#ccc">
    <ag-library-add-btn label="${args.label}" variant="card"></ag-library-add-btn>
  </div>
`;
CardOverlay.args = { label: 'Add to queue' };
