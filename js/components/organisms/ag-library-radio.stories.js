import { html } from 'lit';
import './ag-library-radio.js';

/**
 * The organism fetches data from `/api/radio/*` on connect; in Storybook
 * without a backend the lists render empty (loading → empty-state copy).
 * The story is mostly visual: tabs, search filters, layout.
 */

export default {
    title: 'Organisms/LibraryRadio',
    component: 'ag-library-radio',
};

const Template = () => html`
    <div style="background: var(--bg-primary); color: var(--text-primary); min-height: 600px;">
        <ag-library-radio></ag-library-radio>
    </div>
`;

export const Default = Template.bind({});
Default.args = {};
