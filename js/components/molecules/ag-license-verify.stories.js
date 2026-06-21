import './ag-license-verify.js';

export default {
    title: 'Molecules/AgLicenseVerify',
    tags: ['autodocs'],
    parameters: {
        docs: { description: { component: 'License verification tile — look up a license by key or MAC address.' } },
    },
};

export const Default = {
    render: () => '<ag-license-verify></ag-license-verify>',
    name: 'Default',
};
