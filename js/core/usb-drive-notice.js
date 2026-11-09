/**
 * @module usb-drive-notice
 * @description A USB drive plugged into the box or pulled out, shown as a toast on
 * whatever page is open.
 *
 * The core hears the drive come and go, mounts it when it is the music library's
 * drive, and says what became of it in its `usb_drive` SSE event (API.md, "SSE
 * events") — the very words the devices subscribed to notifications receive. The
 * words are the core's; the app only shows them. A failure stays on screen until it
 * is dismissed, like every error and warning toast.
 *
 * @dependency js/ui-helpers.js (showToast)
 */
import { showToast } from '../ui-helpers.js';

/** The toast kinds the core may ask for; anything else shows as `info`. */
const LEVELS = new Set(['success', 'info', 'warning', 'error']);

/**
 * Show one `usb_drive` event as a toast.
 *
 * @param {object} notice - The event's data: `{ event, level, title, message, url, drive }`.
 * @param {string} notice.level - `success`, `info`, `warning` or `error`.
 * @param {string} notice.title - What happened ("USB drive mounted").
 * @param {string} notice.message - The drive, and what to do with it.
 * @returns {boolean} Whether a toast was shown — not for an event with nothing to say.
 */
export function showUsbDriveNotice(notice) {
    if (!notice) return false;
    const title = typeof notice.title === 'string' ? notice.title.trim() : '';
    const message = typeof notice.message === 'string' ? notice.message.trim() : '';
    if (!title && !message) return false;
    const level = LEVELS.has(notice.level) ? notice.level : 'info';
    showToast(level, title || 'USB drive', message);
    return true;
}
