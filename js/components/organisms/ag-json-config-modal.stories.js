import { html } from 'lit';
import './ag-json-config-modal.js';

export default {
    title: 'Organisms/JsonConfigModal',
    component: 'ag-json-config-modal',
    argTypes: {
        show: { control: 'boolean' },
        configText: { control: 'text' },
        allowFileTransfer: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="height: 600px; padding: 20px;">
    <ag-json-config-modal
        ?show="${args.show}"
        .configText="${args.configText}"
        .filename="${args.filename ?? 'packages-config.json'}"
        .allowFileTransfer="${args.allowFileTransfer ?? false}"
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

export const WithFileTransfer = Template.bind({});
WithFileTransfer.args = {
    show: true,
    filename: 'audio-topology.json',
    allowFileTransfer: true,
    configText: JSON.stringify({
        "hifi_topology": {
            "devices": {
                "streamer_01": {
                    "type": "streamer",
                    "label": "Audiogravity",
                    "outputs": { "usb_out": { "connector": "usb-a", "target_device_id": "dac_01" } }
                }
            }
        }
    }, null, 2)
};
