import { html } from 'lit';
import './ag-profile-card.js';

export default {
    title: 'Molecules/ProfileCard',
    component: 'ag-profile-card',
    argTypes: {
        isActive: { control: 'boolean' }
    },
};

const profileMock = {
    id: 'hi-fi',
    name: 'High Fidelity',
    description: 'Optimized for critical listening with minimal latency.',
    parameters: {
        buffer: 64,
        samplerate: 192000,
        governor: 'performance'
    }
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 350px;">
    <ag-profile-card 
        .profile="${args.profile}"
        ?isActive="${args.isActive}"
        @toggle-profile="${(e) => console.log('Profile toggle:', e.detail)}">
    </ag-profile-card>
  </div>
`;

export const Active = Template.bind({});
Active.args = {
    profile: profileMock,
    isActive: true
};

export const Inactive = Template.bind({});
Inactive.args = {
    profile: { ...profileMock, name: 'Background FM', id: 'radio' },
    isActive: false
};
