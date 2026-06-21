import { html } from 'lit';
import './ag-profile-detail-modal.js';

export default {
    title: 'Molecules/ProfileDetailModal',
    component: 'ag-profile-detail-modal',
    argTypes: {
        show: { control: 'boolean' }
    }
};

const profileMock = {
    name: 'Roon Hi-Res',
    services_status: [
        { logical_name: 'roon',       label: 'Roon Bridge',  state: 'active',   is_running: true,  systemd_unit: 'roonbridge.service' },
        { logical_name: 'mpd',        label: 'MPD',          state: 'inactive', is_running: false, systemd_unit: 'mpd.service'        },
        { logical_name: 'squeezelite',label: 'Squeezelite',  state: 'failed',   is_running: false, systemd_unit: 'squeezelite.service'}
    ]
};

const historyMock = [
    { action: 'Activated: Roon Hi-Res',   timestamp: new Date(Date.now() - 120000).toISOString(), success: true  },
    { action: 'Deactivated: Roon Hi-Res', timestamp: new Date(Date.now() - 300000).toISOString(), success: true  },
    { action: 'Failed: Roon Hi-Res',      timestamp: new Date(Date.now() - 600000).toISOString(), success: false }
];

const Template = (args) => html`
    <ag-profile-detail-modal
        .profile=${args.profile}
        ?show=${args.show}
        .history=${args.history}>
    </ag-profile-detail-modal>
`;

export const WithHistory = Template.bind({});
WithHistory.args = { profile: profileMock, show: true, history: historyMock };

export const EmptyHistory = Template.bind({});
EmptyHistory.args = { profile: profileMock, show: true, history: [] };

export const Hidden = Template.bind({});
Hidden.args = { profile: profileMock, show: false, history: historyMock };
