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
        pushSubscribed: { control: 'boolean' },
        docsUrl: { control: 'text' },
    },
};

const Template = (args) => html`
  <div style="height: 600px; padding: 20px; background: var(--bg-primary); overflow: hidden; position: relative;">
    <p style="color: var(--text-primary)">Click the burger menu in the real app, or toggle 'active' here.</p>
    
    <ag-config-panel 
        ?active="${args.active}"
        ._docsUrl="${args.docsUrl ?? null}"
        .theme="${args.theme}"
        .animations="${args.animations}"
        .pushSubscribed="${args.pushSubscribed}"
        @close-panel="${() => console.log('Close panel requested')}"
        @theme-change="${(e) => console.log('Theme change:', e.detail)}"
        @toggle-animations="${(e) => console.log('Animations toggled:', e.detail)}">
    </ag-config-panel>
  </div>
`;

// `_docsUrl` comes from the core's entry point in the application — the API reference is
// a setting on the box, off by default — and is set by hand here to render both states.
export const SidebarOpen = Template.bind({});
SidebarOpen.args = {
    active: true,
    theme: 'slate',
    animations: true,
    pushSubscribed: false,
    docsUrl: null,
};

/** With the reference switched on: the version line gains the icon that opens it. */
export const WithApiReference = Template.bind({});
WithApiReference.args = {
    active: true,
    theme: 'slate',
    animations: true,
    pushSubscribed: false,
    docsUrl: 'http://audiogravity.local/api/docs',
};

export const Subscribed = Template.bind({});
Subscribed.args = {
    active: true,
    theme: 'slate',
    animations: true,
    pushSubscribed: true
};
