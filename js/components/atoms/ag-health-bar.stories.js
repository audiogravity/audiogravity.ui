import { html } from 'lit';
import './ag-health-bar.js';

export default {
    title: 'Atoms/HealthBar',
    component: 'ag-health-bar',
    argTypes: {
        active: { control: 'number' },
        failed: { control: 'number' },
        idle:   { control: 'number' }
    }
};

const Template = (args) => html`
    <div style="padding: 24px; background: var(--bg-primary); max-width: 320px;">
        <ag-health-bar
            active=${args.active}
            failed=${args.failed}
            idle=${args.idle}>
        </ag-health-bar>
    </div>
`;

export const AllActive = Template.bind({});
AllActive.args = { active: 4, failed: 0, idle: 0 };

export const PartiallyActive = Template.bind({});
PartiallyActive.args = { active: 2, failed: 0, idle: 2 };

export const WithFailure = Template.bind({});
WithFailure.args = { active: 1, failed: 1, idle: 2 };

export const AllIdle = Template.bind({});
AllIdle.args = { active: 0, failed: 0, idle: 4 };

export const Empty = Template.bind({});
Empty.args = { active: 0, failed: 0, idle: 0 };
