import { html } from 'lit';
import './ag-config-panel.js';

export default {
    title: 'Organisms/ConfigPanel',
    component: 'ag-config-panel',
    argTypes: {
        active: { control: 'boolean' },
        theme: {
            control: 'select',
            options: ['slate', 'minimal', 'gravity']
        },
        animations: { control: 'boolean' },
        pushSubscribed: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="height: 600px; padding: 20px; background: var(--bg-primary); overflow: hidden; position: relative;">
    <p style="color: var(--text-primary)">Click the burger menu in the real app, or toggle 'active' here.</p>
    
    <ag-config-panel 
        ?active="${args.active}"
        .theme="${args.theme}"
        .animations="${args.animations}"
        .pushSubscribed="${args.pushSubscribed}"
        @close-panel="${() => console.log('Close panel requested')}"
        @theme-change="${(e) => console.log('Theme change:', e.detail)}"
        @toggle-animations="${(e) => console.log('Animations toggled:', e.detail)}">
    </ag-config-panel>
  </div>
`;

export const SidebarOpen = Template.bind({});
SidebarOpen.args = {
    active: true,
    theme: 'slate',
    animations: true,
    pushSubscribed: false
};

export const Subscribed = Template.bind({});
Subscribed.args = {
    active: true,
    theme: 'slate',
    animations: true,
    pushSubscribed: true
};
