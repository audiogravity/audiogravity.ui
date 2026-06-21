import { html } from 'lit';
import './ag-modal.js';
import '../atoms/ag-button.js';

export default {
    title: 'Organisms/Modal',
    component: 'ag-modal',
    argTypes: {
        title: { control: 'text' },
        show: { control: 'boolean' },
        size: {
            control: 'select',
            options: ['normal', 'large', 'premium']
        },
        noBackdropClose: { control: 'boolean' },
        noEscapeClose: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="height: 400px; background: var(--bg-primary); padding: 20px;">
    <p style="color: var(--text-primary)">Toggle 'show' in controls to open the modal.</p>
    
    <ag-modal 
        .title="${args.title}"
        ?show="${args.show}"
        .size="${args.size}"
        ?no-backdrop-close="${args.noBackdropClose}"
        ?no-escape-close="${args.noEscapeClose}"
        @modal-close="${() => console.log('Modal close requested')}">
        
        <div slot="body">
            <p style="color: var(--text-primary)">This is the main content of the modal. You can put forms, text, or other components here.</p>
            <div style="background: var(--bg-tertiary); padding: 15px; border-radius: 4px; margin-top: 10px;">
                <code style="color: var(--accent-primary)">Light DOM inherited styles work here!</code>
            </div>
        </div>
        
        <div slot="footer" style="display: flex; gap: 10px; justify-content: flex-end; width: 100%;">
            <ag-button type="secondary" label="Cancel"></ag-button>
            <ag-button type="primary" label="Confirm action"></ag-button>
        </div>
    </ag-modal>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    title: 'System Configuration',
    show: true,
    size: 'normal'
};

export const LargePremium = Template.bind({});
LargePremium.args = {
    title: 'Advanced Audio Settings',
    show: true,
    size: 'premium'
};
