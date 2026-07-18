import './ag-network-mount-form.js';
import { injectLibStyles } from '../organisms/ag-library-page.js';

/**
 * The molecule fetches /audio-stack/mounts when opened; in Storybook (no
 * backend) `_loadMounts` is stubbed and the state set directly.
 */

export default {
    title: 'Molecules/NetworkMountForm',
    component: 'ag-network-mount-form',
    parameters: {
        docs: {
            description: {
                component:
                    'Add-a-NAS-share panel (CIFS/SMB) embedded in the music-library '
                    + 'pickers: connectivity-tested mount on submit, plus the list '
                    + 'of AG-created shares with a remove action.',
            },
        },
    },
};

const DEMO_MOUNTS = [
    { slug: 'nas-salon', label: 'NAS Salon', host: '192.168.1.20', share: 'music', mountpoint: '/mnt/nas-salon', read_only: true, mounted: true },
    { slug: 'backup-nas', label: 'Backup NAS', host: 'backup.local', share: 'flac', mountpoint: '/mnt/backup-nas', read_only: true, mounted: false },
];

/**
 * Mount the form with a fixed state (no backend).
 * @param {object} state - Private state to apply.
 * @returns {HTMLElement} Wrapped, ready-to-render element.
 */
const mount = (state = {}) => {
    injectLibStyles();
    const el = document.createElement('ag-network-mount-form');
    el._loadMounts = async () => {};
    Object.assign(el, state);
    const wrap = document.createElement('div');
    wrap.style.cssText =
        'background: var(--bg-primary); color: var(--text-primary); '
        + 'max-width: 560px; padding: var(--spacing-md);';
    wrap.appendChild(el);
    return wrap;
};

/** Collapsed entry card, as shown at the bottom of the library picker. */
export const Collapsed = { render: () => mount() };

/** Open panel with two existing shares and the add form. */
export const Open = { render: () => mount({ _open: true, _mounts: DEMO_MOUNTS }) };

/** Mount failure surfaced from the core's connectivity test. */
export const MountError = {
    render: () => mount({
        _open: true,
        _mounts: [],
        _error: 'Could not mount //192.168.1.20/music: mount error(13): Permission denied',
    }),
};

/** Mount in progress — the button shows a spinner (can take up to ~30s). */
export const Mounting = {
    render: () => mount({
        _open: true,
        _mounts: [],
        _busy: true,
        _form: {
            label: 'NAS Salon', host: '192.168.1.20', share: 'music',
            username: 'nasuser', password: 'secret', read_only: true,
        },
    }),
};
