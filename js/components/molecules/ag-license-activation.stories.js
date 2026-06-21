import './ag-license-activation.js';

export default {
    title: 'Molecules/AgLicenseActivation',
    tags: ['autodocs'],
    parameters: {
        docs: { description: { component: 'Self-service license activation — 3-step stepper (KEY → HOST → ACTIVATE).' } },
    },
};

export const Step1Key = {
    render: () => '<ag-license-activation></ag-license-activation>',
    name: 'Step 1 — Key entry',
};
