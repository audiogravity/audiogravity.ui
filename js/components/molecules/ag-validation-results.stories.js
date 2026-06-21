import { html } from 'lit';
import './ag-validation-results.js';

export default {
    title: 'Molecules/ValidationResults',
    component: 'ag-validation-results',
    argTypes: {
        successTitle: { control: 'text' },
        successMessage: { control: 'text' },
        errorTitle: { control: 'text' },
        showSummary: { control: 'boolean' }
    }
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 600px; background: var(--bg-primary);">
    <ag-validation-results 
        .result="${args.result}"
        success-title="${args.successTitle}"
        success-message="${args.successMessage}"
        error-title="${args.errorTitle}"
        ?show-summary="${args.showSummary}">
    </ag-validation-results>
  </div>
`;

export const Valid = Template.bind({});
Valid.args = {
    result: { 
        valid: true, 
        errors: [], 
        warnings: [],
        summary: { services_count: 12, profiles_count: 5, critical_services: 0 },
        properties_preview: { provider: 'alsa', buffer_size: 128, periods: 2 }
    },
    successTitle: 'Configuration Valid',
    successMessage: 'Ready to apply changes.',
    errorTitle: 'Validation Errors',
    showSummary: true
};

export const WithWarnings = Template.bind({});
WithWarnings.args = {
    result: { 
        valid: true, 
        errors: [], 
        warnings: ['Interface Ethernet is disconnected', 'CPU scaling is not optimized'],
        summary: { services_count: 8, profiles_count: 2, critical_services: 0 }
    },
    successTitle: 'Valid with Warnings',
    showSummary: true
};

export const Invalid = Template.bind({});
Invalid.args = {
    result: { 
        valid: false, 
        errors: [
            { location: 'services.mpd', message: 'Missing user field', type: 'SchemaError' },
            'Global buffer_size must be a power of 2'
        ], 
        warnings: [],
        summary: { services_count: 5, profiles_count: 0, critical_services: 2 }
    },
    errorTitle: 'Configuration Invalid',
    showSummary: true
};
