import { html } from 'lit';
import './ag-json-config-modal.js';

export default {
    title: 'Organisms/JsonConfigModal',
    component: 'ag-json-config-modal',
    argTypes: {
        show: { control: 'boolean' },
        configText: { control: 'text' }
    },
};

const Template = (args) => html`
  <div style="height: 600px; padding: 20px;">
    <ag-json-config-modal 
        ?show="${args.show}"
        .configText="${args.configText}"
        @close-request="${() => console.log('Close requested')}"
        @save-request="${(e) => console.log('Save config:', e.detail)}">
    </ag-json-config-modal>
  </div>
`;

export const JSONEditor = Template.bind({});
JSONEditor.args = {
    show: true,
    configText: JSON.stringify({
        "repositories": ["default", "community"],
        "auto_update": true,
        "cleanup_after_install": false
    }, null, 4)
};
