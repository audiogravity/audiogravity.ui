import { html } from 'lit';
import './ag-user-card.js';

export default {
    title: 'Molecules/UserCard',
    component: 'ag-user-card',
    argTypes: {
        isMe: { control: 'boolean' },
        isActive: { control: 'boolean' }
    },
};

const userMock = {
    username: 'admin',
    role: 'administrator',
    last_login: '2026-03-03 14:20:00',
    persistent_auth: true,
    enabled: true,
    id: 1
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 350px;">
    <ag-user-card 
        .user="${args.user}"
        ?isMe="${args.isMe}"
        ?isActive="${args.isActive}">
    </ag-user-card>
  </div>
`;

export const Administrator = Template.bind({});
Administrator.args = {
    user: userMock,
    isMe: true,
    isActive: true
};

export const Guest = Template.bind({});
Guest.args = {
    user: { username: 'visitor', role: 'guest', last_login: 'Never' },
    isMe: false,
    isActive: false
};
