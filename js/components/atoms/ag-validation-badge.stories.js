import { html } from 'lit';
import './ag-validation-badge.js';

export default {
    title: 'Atoms/ValidationBadge',
    component: 'ag-validation-badge',
};

const Template = (args) => html`
  <div style="padding: 20px;">
    <ag-validation-badge .result="${args.result}"></ag-validation-badge>
  </div>
`;

export const Success = Template.bind({});
Success.args = {
    result: { valid: true, errors: [], warnings: [] }
};

export const Warning = Template.bind({});
Warning.args = {
    result: { valid: true, errors: [], warnings: ['Minor issue detected'] }
};

export const Error = Template.bind({});
Error.args = {
    result: { valid: false, errors: ['Critical error!'], warnings: [] }
};
