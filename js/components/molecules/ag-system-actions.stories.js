import { html } from 'lit';
import './ag-system-actions.js';

export default {
    title: 'Molecules/SystemActions',
    component: 'ag-system-actions',
};

const Template = () => html`
    <div style="padding: 20px; max-width: 700px; background: var(--bg-primary);">
        <ag-system-actions></ag-system-actions>
    </div>
`;

export const Default = Template.bind({});
Default.args = {};
