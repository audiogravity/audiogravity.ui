import { html } from 'lit';
import './ag-filter-bar.js';

export default {
    title: 'Atoms/FilterBar',
    component: 'ag-filter-bar',
    argTypes: {
        value: { control: 'text' }
    }
};

const profileOptions = [
    { label: 'ALL',    value: 'all'    },
    { label: 'ACTIVE', value: 'active' },
    { label: 'IDLE',   value: 'idle'   }
];

const statusOptions = [
    { label: 'ALL',     value: 'all'     },
    { label: 'RUNNING', value: 'running' },
    { label: 'STOPPED', value: 'stopped' },
    { label: 'FAILED',  value: 'failed'  }
];

const Template = (args) => html`
    <div style="padding: 24px; background: var(--bg-primary); display: flex; align-items: center; gap: 16px;">
        <ag-filter-bar
            .options=${args.options}
            value=${args.value}
            @filter-change=${e => console.log('filter-change:', e.detail.value)}>
        </ag-filter-bar>
    </div>
`;

export const ProfileFilter = Template.bind({});
ProfileFilter.args = { options: profileOptions, value: 'all' };

export const ActiveSelected = Template.bind({});
ActiveSelected.args = { options: profileOptions, value: 'active' };

export const ServiceFilter = Template.bind({});
ServiceFilter.args = { options: statusOptions, value: 'all' };
