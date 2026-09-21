import { html } from 'lit';
import './ag-package-install-dialog.js';

export default {
    title: 'Molecules/PackageInstallDialog',
    component: 'ag-package-install-dialog',
    argTypes: {
        show: { control: 'boolean' }
    },
    parameters: {
        docs: {
            description: {
                component:
                    'Shown before a package is installed. Carries the vendor licence a '
                    + 'noninteractive install would skip — both Signalyst packages ship '
                    + 'one — and, for a package whose vendor publishes several major lines, '
                    + 'the choice of which line to install, among those this machine can.',
            },
        },
    },
};

// The dialog reads /packages/{id}/notices and /packages/{id}/versions itself,
// so the stories stub fetch rather than passing data in: what is on screen is
// then produced by the same code path the app uses.
const LICENCE = {
    title: 'HQPlayer License',
    body: [
        'HQPlayer End User License Agreement',
        '',
        'CAREFULLY READ THE FOLLOWING LICENSE AGREEMENT. BY INSTALLING THE SOFTWARE YOU',
        'ARE CONSENTING TO BE BOUND BY AND ARE BECOMING A PARTY TO THIS AGREEMENT.',
        '',
        'License Grant',
        'This Software is licensed, not sold. We hereby grant you a nonexclusive license',
        'to use one copy of the Software on any single computer.',
        '',
        'Trial Version',
        'Limited time trial license is provided solely for the purpose of verifying that',
        'the Software is suitable for You, before purchasing a license.',
    ].join('\n'),
};

const GROUPS = {
    title: 'Special groups and device access',
    body: 'Please make sure that no other audio daemon is keeping your audio device reserved.',
};

/**
 * Answer the dialog's two requests with fixed payloads.
 * @param {{notices: Array, versions: Array, unavailable: Array, readable: boolean}} payload
 *   What the core would return.
 */
function stubApi({ notices = [], versions = [], unavailable = [], readable = true }) {
    window.fetch = async (url) => new Response(
        JSON.stringify(
            String(url).endsWith('/versions')
                ? { package_id: 'x', offers_choice: true, versions, unavailable }
                : { package_id: 'x', readable, notices }
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

const Template = (args) => {
    stubApi(args);
    return html`
        <ag-package-install-dialog
            .pkg=${args.pkg}
            ?show=${args.show}>
        </ag-package-install-dialog>
    `;
};

/**
 * HQPlayer Embedded on Debian 13, as measured: a licence to accept, the 6 line
 * on offer, and the 5 line named but not offered — it needs libgmpris, which
 * nothing publishes there.
 */
export const LicenceAndVersionChoice = Template.bind({});
LicenceAndVersionChoice.args = {
    show: true,
    pkg: {
        id: 'hqplayerd',
        label: 'HQPlayer Embedded',
        installed_version: null,
        offers_version_choice: true,
        doc_url: 'https://signalyst.com/',
    },
    notices: [LICENCE, GROUPS],
    versions: [{ major: 6, version: '6.0.2-3', missing: [] }],
    unavailable: [{ major: 5, version: '5.17.2-48', missing: ['libgmpris'] }],
};

/** Two lines that both install: a real choice. */
export const TwoInstallableLines = Template.bind({});
TwoInstallableLines.args = {
    ...LicenceAndVersionChoice.args,
    versions: [
        { major: 6, version: '6.0.2-3', missing: [] },
        { major: 5, version: '5.17.2-48', missing: [] },
    ],
    unavailable: [],
};

/**
 * The terms could not be read — a proxy that drops Range, say. Acceptance is
 * still asked for: unreadable is not "nothing to accept".
 */
export const TermsUnreadable = Template.bind({});
TermsUnreadable.args = {
    ...LicenceAndVersionChoice.args,
    notices: [],
    readable: false,
};

/** The same box already running the 5 line: that line is preselected. */
export const AlreadyOnTheOlderLine = Template.bind({});
AlreadyOnTheOlderLine.args = {
    ...TwoInstallableLines.args,
    pkg: {
        id: 'hqplayerd',
        label: 'HQPlayer Embedded',
        installed_version: '5.17.2-48',
        offers_version_choice: true,
    },
};

/** The NAA: a licence, but no choice of line — its line follows HQPlayer's. */
export const LicenceOnly = Template.bind({});
LicenceOnly.args = {
    show: true,
    pkg: {
        id: 'naa',
        label: 'HQPlayer NAA',
        installed_version: null,
        offers_version_choice: false,
    },
    notices: [{ ...LICENCE, title: 'networkaudiod License' }],
    versions: [],
};

/** MPD: nothing to read, nothing to choose — the plain question. */
export const NothingToShow = Template.bind({});
NothingToShow.args = {
    show: true,
    pkg: {
        id: 'mpd',
        label: 'Music Player Daemon',
        installed_version: null,
        offers_version_choice: false,
    },
    notices: [],
    versions: [],
};
