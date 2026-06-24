import { html } from 'lit';
import './ag-card-grid.js';

export default {
    title: 'Organisms/CardGrid',
    component: 'ag-card-grid',
    argTypes: {
        loading: { control: 'boolean' },
        error: { control: 'text' },
        items: { control: 'object' }
    },
};

const itemsMock = [
    { title: 'Card 1', content: 'Lorem ipsum dolor sit amet.' },
    { title: 'Card 2', content: 'Consectetur adipiscing elit.' },
    { title: 'Card 3', content: 'Sed do eiusmod tempor.' }
];

const Template = (args) => html`
  <div style="padding: 20px; background: var(--bg-primary);">
    <ag-card-grid 
        ?loading="${args.loading}"
        .error="${args.error}"
        .items="${args.items}"
        .renderItem="${(item) => html`
            <ag-tile>
                <div class="tile-header"><strong>${item.title}</strong></div>
                <div class="tile-body">${item.content}</div>
            </ag-tile>
        `}">
    </ag-card-grid>
  </div>
`;

export const Loaded = Template.bind({});
Loaded.args = {
    loading: false,
    items: itemsMock
};

export const Loading = Template.bind({});
Loading.args = {
    loading: true,
    items: []
};

export const ErrorState = Template.bind({});
ErrorState.args = {
    loading: false,
    error: 'Failed to fetch items from the server.',
    items: []
};
