import { html } from 'lit';
import './ag-docs-modal.js';

export default {
    title: 'Organisms/DocsModal',
    component: 'ag-docs-modal',
    argTypes: {
        show: { control: 'boolean' },
        title: { control: 'text' },
        src: { control: 'text' }
    },
};

const Template = (args) => html`
  <div style="height: 500px; padding: 20px;">
    <ag-docs-modal 
        ?show="${args.show}"
        .title="${args.title}"
        .src="${args.src}"
        @docs-close="${() => console.log('Docs closed')}">
    </ag-docs-modal>
    <p style="color: var(--text-secondary)">This modal usually displays an iframe with documentation.</p>
  </div>
`;

export const ApiReference = Template.bind({});
ApiReference.args = {
    show: true,
    title: 'API Reference (Swagger)',
    src: '/docs'
};
