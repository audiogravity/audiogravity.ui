import { html } from 'lit';
import './ag-user-modal.js';

export default {
    title: 'Organisms/UserModal',
    component: 'ag-user-modal',
    argTypes: {
        show: { control: 'boolean' },
        user: { control: 'object' },
        isEdit: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="height: 500px; padding: 20px;">
    <ag-user-modal 
        ?show="${args.show}"
        .user="${args.user}"
        ?isEdit="${args.isEdit}"
        @modal-close="${() => console.log('Close requested')}"
        @save="${(e) => console.log('Save user:', e.detail)}">
    </ag-user-modal>
    <p style="color: var(--text-secondary)">Toggle 'show' to see the user form.</p>
  </div>
`;

export const CreateUser = Template.bind({});
CreateUser.args = {
    show: true,
    user: null,
    isEdit: false
};

export const EditUser = Template.bind({});
EditUser.args = {
    show: true,
    user: { id: 1, username: 'admin', role: 'administrator' },
    isEdit: true
};
