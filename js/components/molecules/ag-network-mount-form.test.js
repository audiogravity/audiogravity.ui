/**
 * Unit tests for ag-network-mount-form — validation, submit flow (transient
 * admin password, payload, events, error surface) and removal with the
 * confirm + 409-force retry contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api.js', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiDelete: vi.fn(),
}));
vi.mock('../../ui-helpers.js', () => ({
    showConfirm: vi.fn(),
    showPasswordConfirm: vi.fn(),
    getUserFriendlyError: vi.fn((e) => e?.detail || e?.message || 'error'),
}));

import { apiGet, apiPost, apiDelete } from '../../api.js';
import { showConfirm, showPasswordConfirm } from '../../ui-helpers.js';
import './ag-network-mount-form.js';

const VALID_FORM = {
    label: 'NAS Salon', host: '192.168.1.20', share: 'music',
    username: '', password: '', read_only: true,
};

describe('ag-network-mount-form', () => {
    let el;

    beforeEach(async () => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue([]);
        el = document.createElement('ag-network-mount-form');
        document.body.appendChild(el);
        await el.updateComplete;
    });

    afterEach(() => {
        el.remove();
    });

    it('validates required fields and credential pairing', () => {
        el._form = { ...VALID_FORM, label: '' };
        expect(el._validate()).toMatch(/required/);

        el._form = { ...VALID_FORM, username: 'u', password: '' };
        expect(el._validate()).toMatch(/both username and password/);

        el._form = { ...VALID_FORM };
        expect(el._validate()).toBe('');
    });

    it('asks for the admin password transiently and submits a trimmed payload', async () => {
        const mount = { slug: 'nas-salon', mountpoint: '/mnt/nas-salon', label: 'NAS Salon' };
        showPasswordConfirm.mockResolvedValue('admin-pw');
        apiPost.mockResolvedValue(mount);
        const created = vi.fn();
        el.addEventListener('mount-created', created);
        el._form = { ...VALID_FORM, host: ' 192.168.1.20 ' };

        await el._submit();

        expect(apiPost).toHaveBeenCalledWith('/audio-stack/mounts', {
            label: 'NAS Salon', host: '192.168.1.20', share: 'music',
            username: null, password: null, read_only: true, admin_password: 'admin-pw',
        });
        expect(created).toHaveBeenCalledTimes(1);
        expect(created.mock.calls[0][0].detail.mount).toEqual(mount);
        expect(el._form.label).toBe(''); // reset after success
        expect(el._form.admin_password).toBeUndefined(); // never held in state
    });

    it('does nothing when the password prompt is cancelled', async () => {
        showPasswordConfirm.mockResolvedValue(null);
        el._form = { ...VALID_FORM };
        await el._submit();
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('surfaces the core mount error and keeps the form', async () => {
        showPasswordConfirm.mockResolvedValue('admin-pw');
        apiPost.mockRejectedValue({ detail: 'Could not mount //h/s: Permission denied' });
        el._form = { ...VALID_FORM };

        await el._submit();

        expect(el._error).toMatch(/Permission denied/);
        expect(el._form.label).toBe('NAS Salon'); // not reset on failure
    });

    it('does not prompt nor call the API when client validation fails', async () => {
        el._form = { ...VALID_FORM, host: '' };
        await el._submit();
        expect(showPasswordConfirm).not.toHaveBeenCalled();
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('removes a share after showConfirm, clearing any stale error', async () => {
        showConfirm.mockResolvedValue(true);
        apiDelete.mockResolvedValue(undefined);
        const removed = vi.fn();
        el.addEventListener('mount-removed', removed);
        el._error = 'stale error from a previous attempt';

        await el._remove({ slug: 'nas', label: 'NAS', mountpoint: '/mnt/nas', in_use: false });

        expect(apiDelete).toHaveBeenCalledWith('/audio-stack/mounts/nas');
        expect(removed).toHaveBeenCalledTimes(1);
        // The hosts key their selection reconcile off detail.mountpoint — assert
        // the producer actually emits it (not just slug).
        expect(removed.mock.calls[0][0].detail).toEqual({ slug: 'nas', mountpoint: '/mnt/nas' });
        expect(el._error).toBe('');
    });

    it('does not delete when the confirm is declined', async () => {
        showConfirm.mockResolvedValue(false);
        await el._remove({ slug: 'nas', label: 'NAS', in_use: false });
        expect(apiDelete).not.toHaveBeenCalled();
    });

    it('deletes with force directly when the share is the active library', async () => {
        showConfirm.mockResolvedValue(true);
        apiDelete.mockResolvedValue(undefined);

        await el._remove({ slug: 'nas', label: 'NAS', in_use: true });

        expect(apiDelete).toHaveBeenCalledWith('/audio-stack/mounts/nas?force=true');
    });

    it('offers a forced retry on a 409 busy and honors the second confirm', async () => {
        showConfirm.mockResolvedValueOnce(true);   // initial remove confirm
        apiDelete.mockRejectedValueOnce({ status: 409, detail: 'The share is busy.' });
        showConfirm.mockResolvedValueOnce(true);   // force confirm
        apiDelete.mockResolvedValueOnce(undefined);

        await el._remove({ slug: 'nas', label: 'NAS', in_use: false });

        expect(apiDelete).toHaveBeenNthCalledWith(1, '/audio-stack/mounts/nas');
        expect(apiDelete).toHaveBeenNthCalledWith(2, '/audio-stack/mounts/nas?force=true');
    });

    it('keeps the 409 error when the forced retry is declined', async () => {
        showConfirm.mockResolvedValueOnce(true);
        apiDelete.mockRejectedValueOnce({ status: 409, detail: 'The share is busy.' });
        showConfirm.mockResolvedValueOnce(false);

        await el._remove({ slug: 'nas', label: 'NAS', in_use: false });

        expect(apiDelete).toHaveBeenCalledTimes(1);
        expect(el._error).toMatch(/busy/);
    });

    it('loads the existing AG mounts when opened', async () => {
        apiGet.mockResolvedValue([{ slug: 'x', label: 'X', host: 'h', share: 's', mountpoint: '/mnt/x', mounted: true, in_use: false }]);
        await el._toggle();
        expect(apiGet).toHaveBeenCalledWith('/audio-stack/mounts');
        expect(el._mounts).toHaveLength(1);
        expect(el._open).toBe(true);
    });
});
