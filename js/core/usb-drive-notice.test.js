/**
 * Unit tests for js/core/usb-drive-notice.js — a USB drive's `usb_drive` event as a toast.
 *
 * The events are the core's (modules/audio_app_config/usb_drives.py), words included:
 * the app shows them as they come, and only guards against an event it cannot show.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ui-helpers.js', () => ({ showToast: vi.fn() }));

import { showToast } from '../ui-helpers.js';
import { showUsbDriveNotice } from './usb-drive-notice.js';

/** One `usb_drive` event as the core sends it: the library's drive, mounted and read. */
function notice(overrides = {}) {
    return {
        event: 'added',
        level: 'success',
        title: 'USB drive mounted',
        message: 'Micron CT2000X6SSD9 is mounted — your music library is available.',
        url: '/index.html#library',
        drive: 'Micron CT2000X6SSD9',
        ...overrides,
    };
}

beforeEach(() => { showToast.mockClear(); });

describe('a USB drive notice', () => {
    it('is shown as the core words it', () => {
        expect(showUsbDriveNotice(notice())).toBe(true);
        expect(showToast).toHaveBeenCalledWith('success', 'USB drive mounted',
            'Micron CT2000X6SSD9 is mounted — your music library is available.');
    });

    it.each(['success', 'info', 'warning', 'error'])('keeps the kind %s', (level) => {
        showUsbDriveNotice(notice({ level }));
        expect(showToast.mock.calls[0][0]).toBe(level);
    });

    it('shows an unknown kind as info rather than not at all', () => {
        showUsbDriveNotice(notice({ level: 'critical' }));
        expect(showToast.mock.calls[0][0]).toBe('info');
    });

    it('has a title even when the core sent none', () => {
        showUsbDriveNotice(notice({ title: '' }));
        expect(showToast.mock.calls[0][1]).toBe('USB drive');
    });

    it.each([
        ['nothing', undefined],
        ['null', null],
        ['a string', 'USB drive mounted'],
        ['no words at all', { level: 'info', title: ' ', message: '' }],
        ['words that are not text', { level: 'info', title: 42, message: {} }],
    ])('shows nothing for %s', (_, data) => {
        expect(showUsbDriveNotice(data)).toBe(false);
        expect(showToast).not.toHaveBeenCalled();
    });
});
