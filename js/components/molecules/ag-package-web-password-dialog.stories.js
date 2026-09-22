import { html } from 'lit';
import './ag-package-web-password-dialog.js';

export default {
    title: 'Molecules/PackageWebPasswordDialog',
    component: 'ag-package-web-password-dialog',
    argTypes: {
        show: { control: 'boolean' }
    },
    parameters: {
        docs: {
            description: {
                component:
                    'Sets the password of an installed package\'s web interface when it has '
                    + 'none — the install could not set it, or the package came some other '
                    + 'way. Opens with a random password in clear, says the service restarts '
                    + 'to use it, and keeps "Set password" out of reach while the password is '
                    + 'unusable.',
            },
        },
    },
};

const HQPLAYERD = {
    id: 'hqplayerd', label: 'HQPlayer Embedded', status: 'installed',
    web_credentials: { username: 'hqplayer', port: 8088, already_set: false },
};

/** Opened on HQPlayer Embedded, with a password drawn at random. */
export const Default = {
    args: { show: true },
    render: (args) => html`
        <ag-package-web-password-dialog .pkg=${HQPLAYERD} ?show=${args.show}>
        </ag-package-web-password-dialog>
    `,
};

/** A password too short: the dialog says why, and the button waits. */
export const Unusable = {
    args: { show: true },
    render: (args) => html`
        <ag-package-web-password-dialog .pkg=${HQPLAYERD} ._password=${'short'} ?show=${args.show}>
        </ag-package-web-password-dialog>
    `,
};
