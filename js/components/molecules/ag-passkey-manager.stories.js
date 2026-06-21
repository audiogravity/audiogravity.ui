import { html } from 'lit';
import './ag-passkey-manager.js';

export default {
    title: 'Molecules/PasskeyManager',
    component: 'ag-passkey-manager',
};

export const Default = {
    render: () => html`
        <div style="padding: 20px; max-width: 400px; background: var(--bg-primary);">
            <ag-passkey-manager></ag-passkey-manager>
        </div>
    `
};
