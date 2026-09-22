import { html } from 'lit';
import './ag-web-password-field.js';

export default {
    title: 'Molecules/WebPasswordField',
    component: 'ag-web-password-field',
    parameters: {
        docs: {
            description: {
                component:
                    'The password for a package\'s own web interface: where to sign in, as '
                    + 'whom, and the field in clear. Shared by the install dialog and the '
                    + 'dialog that sets it on an installed package. The host owns the value '
                    + 'and receives each keystroke as `password-input`.',
            },
        },
    },
};

const CREDENTIALS = { username: 'hqplayer', port: 8088, already_set: false };

/** A usable password. */
export const Default = {
    render: () => html`
        <ag-web-password-field .credentials=${CREDENTIALS} .label=${'HQPlayer Embedded'}
            .value=${'Zq7Rk2Lm9Tx4Wp1N'}></ag-web-password-field>
    `,
};

/** An unusable one: the rule it breaks is said under the field. */
export const Unusable = {
    render: () => html`
        <ag-web-password-field .credentials=${CREDENTIALS} .label=${'HQPlayer Embedded'}
            .value=${'-sneaky123'}></ag-web-password-field>
    `,
};
