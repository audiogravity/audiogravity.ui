import { html } from 'lit';
import './ag-package-uninstall-dialog.js';

export default {
    title: 'Molecules/PackageUninstallDialog',
    component: 'ag-package-uninstall-dialog',
    argTypes: {
        show: { control: 'boolean' }
    },
    parameters: {
        docs: {
            description: {
                component:
                    'Shown before a package is uninstalled. A plain uninstall keeps the '
                    + 'package\'s settings, so a reinstall finds them again; for a package '
                    + 'installed through apt, the operator can tick "Also delete its '
                    + 'settings and data", unticked by default, and the dialog then says '
                    + 'what that costs. A vendor-script package (Roon) deletes its own '
                    + 'settings anyway: nothing is offered.',
            },
        },
    },
};

const PLAYBACK = ' This stops and removes HQPlayer Embedded — anything playing through it will stop.';

const HQPLAYERD = {
    id: 'hqplayerd', label: 'HQPlayer Embedded', service_id: 'hqplayerd',
    keeps_settings_on_uninstall: true,
};

const ROON_SERVER = {
    id: 'roonserver', label: 'Roon Server', service_id: null,
    keeps_settings_on_uninstall: false,
};

/** An apt package: the delete-settings choice is offered, unticked. */
export const SettingsKept = {
    args: { show: true },
    render: (args) => html`
        <ag-package-uninstall-dialog
            .pkg=${HQPLAYERD}
            .note=${PLAYBACK}
            ?show=${args.show}>
        </ag-package-uninstall-dialog>
    `,
};

/** The same, ticked: the warning says what cannot be undone. */
export const SettingsDeleted = {
    args: { show: true },
    render: (args) => html`
        <ag-package-uninstall-dialog
            .pkg=${HQPLAYERD}
            .note=${PLAYBACK}
            ._purge=${true}
            ?show=${args.show}>
        </ag-package-uninstall-dialog>
    `,
};

/** A vendor-script package: its uninstall deletes everything, nothing to offer. */
export const NothingToOffer = {
    args: { show: true },
    render: (args) => html`
        <ag-package-uninstall-dialog
            .pkg=${ROON_SERVER}
            ?show=${args.show}>
        </ag-package-uninstall-dialog>
    `,
};
