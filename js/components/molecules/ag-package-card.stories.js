import { html } from 'lit';
import './ag-package-card.js';

export default {
    title: 'Molecules/PackageCard',
    component: 'ag-package-card',
    argTypes: {
        isChecking: { control: 'boolean' },
        isGuest: { control: 'boolean' }
    },
};

const pkgMock = {
    id: 'roonserver',
    label: 'Roon Server',
    description: 'The brain of the Roon music management system.',
    status: 'installed',
    installed_version: '2.0.12',
    available_version: '2.0.15',
    is_supported: true,
    arch_support: ['x86_64', 'aarch64'],
    installer_type: 'binary'
};

const Template = (args) => html`
  <div style="padding: 24px; max-width: 400px; background: var(--bg-primary);">
    <ag-package-card 
        .pkg="${args.pkg}"
        ?isChecking="${args.isChecking}"
        ?isGuest="${args.isGuest}"
        @package-action="${(e) => console.log('Action:', e.detail)}">
    </ag-package-card>
  </div>
`;

export const InstalledWithUpdate = Template.bind({});
InstalledWithUpdate.args = {
    pkg: pkgMock,
    isChecking: false,
    isGuest: false
};

export const NotInstalled = Template.bind({});
NotInstalled.args = {
    pkg: { 
        ...pkgMock, 
        status: 'not_installed', 
        installed_version: null, 
        available_version: null 
    },
    isChecking: false,
    isGuest: false
};

export const Installing = Template.bind({});
Installing.args = {
    pkg: {
        ...pkgMock,
        status: 'installing',
        installed_version: null
    },
    isChecking: false,
    isGuest: false
};

/** Blocked by another package — Roon Server already contains the Bridge. */
export const BlockedByConflict = Template.bind({});
BlockedByConflict.args = {
    pkg: {
        ...pkgMock,
        status: 'not_installed',
        installed_version: null,
        available_version: null,
        is_supported: false,
        availability: 'blocked',
        availability_reason: 'Roon Bridge is installed — the two cannot run together'
    },
    isChecking: false,
    isGuest: false
};

/** The vendor has nothing for this system — permanent, and said as such. */
export const NotAvailableHere = Template.bind({});
NotAvailableHere.args = {
    pkg: {
        ...pkgMock,
        status: 'not_installed',
        installed_version: null,
        available_version: null,
        is_supported: false,
        availability: 'unsupported',
        availability_reason: 'vendor publishes no build for aarch64'
    },
    isChecking: false,
    isGuest: false
};

/** The source could not be reached: unknown, not incompatible — worth retrying. */
export const AvailabilityUnknown = Template.bind({});
AvailabilityUnknown.args = {
    pkg: {
        ...pkgMock,
        status: 'not_installed',
        installed_version: null,
        available_version: null,
        is_supported: false,
        availability: 'unknown',
        availability_reason: 'vendor download site unreachable'
    },
    isChecking: false,
    isGuest: false
};

/**
 * Already installed, and the vendor has since stopped publishing for this
 * system. No banner — it explains a disabled INSTALL button, and there is none
 * here — and the update and uninstall buttons stay available.
 */
export const InstalledButNoLongerPublished = Template.bind({});
InstalledButNoLongerPublished.args = {
    pkg: {
        ...pkgMock,
        status: 'installed',
        installed_version: '2.0.12',
        available_version: null,
        is_supported: false,
        availability: 'unsupported',
        availability_reason: 'vendor publishes no build for x86_64'
    },
    isChecking: false,
    isGuest: false
};
