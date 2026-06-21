import { html } from 'lit';
import './ag-skeleton-loader.js';

export default {
    title: 'Molecules/SkeletonLoader',
    component: 'ag-skeleton-loader',
    argTypes: {
        type: {
            control: 'select',
            options: ['tiles', 'list', 'spinner']
        },
        count: { control: 'number' }
    },
};

const Template = (args) => html`
  <div style="padding: 20px; background: var(--bg-primary);">
    <ag-skeleton-loader 
        .type="${args.type}"
        .count="${args.count}">
    </ag-skeleton-loader>
  </div>
`;

export const GridTiles = Template.bind({});
GridTiles.args = {
    type: 'tiles',
    count: 3
};

export const List = Template.bind({});
List.args = {
    type: 'list',
    count: 5
};

export const Spinner = Template.bind({});
Spinner.args = {
    type: 'spinner'
};
