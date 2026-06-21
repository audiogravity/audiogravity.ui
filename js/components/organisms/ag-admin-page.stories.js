import { html } from 'lit';
import './ag-admin-page.js';
import '../molecules/ag-user-card.js';
import '../organisms/ag-card-grid.js';

// Setup Mock Environment
if (!window.AppState) {
    window.AppState = {
        currentTab: 'admin',
        user: { role: 'admin' }
    };
}

export default {
    title: 'Pages/AdminPage',
    component: 'ag-admin-page',
};

const usersMock = [
    { username: 'admin', role: 'admin', enabled: true, last_login: '2026-03-07T10:00:00Z' },
    { username: 'operator', role: 'user', enabled: true, last_login: '2026-03-06T15:30:00Z' },
    { username: 'guest1', role: 'guest', enabled: false, last_login: null }
];

const activeUsersMock = ['admin'];

const Template = (args) => {
    const el = document.createElement('ag-admin-page');
    el.users = args.users;
    el.activeUsers = args.activeUsers;
    el.usersFetch.loading = args.loading;
    el.usersFetch.error = args.error;
    
    // Mock the _loadUsers method to prevent actual API calls
    el._loadUsers = () => {};

    return html`
        <div style="padding: 24px; background: var(--bg-primary); min-height: 100vh;">
            ${el}
        </div>
    `;
};

export const Default = Template.bind({});
Default.args = {
    users: usersMock,
    activeUsers: activeUsersMock,
    loading: false,
    error: null
};

export const Loading = Template.bind({});
Loading.args = {
    users: [],
    activeUsers: [],
    loading: true,
    error: null
};

export const Error = Template.bind({});
Error.args = {
    users: [],
    activeUsers: [],
    loading: false,
    error: 'Failed to load users from API'
};
