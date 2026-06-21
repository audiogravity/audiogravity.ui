import { html } from 'lit';
import './ag-button.js';

export default {
    title: 'Atoms/Button',
    component: 'ag-button',
    argTypes: {
        type: {
            control: 'select',
            options: ['primary', 'secondary', 'warning', 'error']
        },
        label: { control: 'text' },
        icon: { control: 'text' },
        disabled: { control: 'boolean' },
        loading: { control: 'boolean' },
        compact: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <ag-button 
    .type="${args.type}"
    .label="${args.label}"
    .icon="${args.icon}"
    ?disabled="${args.disabled}"
    ?loading="${args.loading}"
    ?compact="${args.compact}"
    @btn-click="${(e) => console.log('Button clicked:', e.detail)}">
  </ag-button>
`;

export const Primary = Template.bind({});
Primary.args = {
    type: 'primary',
    label: 'Primary Action',
};

export const WithIcon = Template.bind({});
WithIcon.args = {
    type: 'secondary',
    label: 'Play Music',
    icon: 'icon-play'
};

export const Loading = Template.bind({});
Loading.args = {
    type: 'primary',
    label: 'Installing...',
    loading: true
};

export const Compact = Template.bind({});
Compact.args = {
    type: 'error',
    label: 'Delete',
    compact: true
};
