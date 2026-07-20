/**
 * @module PlayerUtils
 * @description Pure utilities shared by the AG player UI (mini + fullscreen).
 * Avoids duplicating identical helpers across `ag-now-playing` and
 * `ag-now-playing-fullscreen`.
 */

/** Suppression window for stale "stopped" events arriving just after a
 *  user-initiated control (prev/next/play). The backend can briefly publish a
 *  title-less PlayerState while transitioning sources/tracks — we ignore it. */
export const TRANSITION_GUARD_MS = 8000;

/**
 * Whether the player is currently inside the post-control suppression window.
 * @param {number|null} controlRecentTime - Result of `Date.now()` at the last
 *        control action, or `null` if none.
 * @returns {boolean}
 */
export function inTransition(controlRecentTime) {
    return controlRecentTime !== null
        && (Date.now() - controlRecentTime < TRANSITION_GUARD_MS);
}

/**
 * Transport drivers that manage DSD/volume in their own chain — mirrors the
 * backend `_SELF_MANAGED_DSD_DRIVERS` set: HQPlayer (own DSP chain) and a
 * native UPnP renderer (its own DAC/amplifier stage). For these drivers the
 * UI keeps the volume control available during DSD and hides the DSD lock.
 * @type {Set<string>}
 */
const SELF_MANAGED_DSD_DRIVERS = new Set(['src_hqplayer', 'upnp_renderer']);

/**
 * Whether an item/state is played by a self-managed transport driver.
 * Keys on the routing identity (`control_id`, spec §3) — display fields
 * (origin, display_name) never influence this — with `source_id` fallback.
 * @param {object|null} itemOrState - NowPlayingItem-like or PlayerState-like object.
 * @returns {boolean}
 */
export function isSelfManagedDriver(itemOrState) {
    return SELF_MANAGED_DSD_DRIVERS.has(itemOrState?.control_id ?? itemOrState?.source_id);
}

/**
 * Raw failure reported by the active output's engine, when it explains the
 * silence (e.g. the exclusive DAC held by another local service).
 * @param {object|null} state - PlayerState-like object.
 * @returns {string|null} The engine's own message, or null when the output is fine.
 */
export function activeOutputError(state) {
    return (state?.outputs ?? []).find(o => o.active)?.error ?? null;
}

/**
 * Plain-language rendering of {@link activeOutputError} — the raw ALSA/engine
 * string is only ever shown as a tooltip, never as the primary message.
 * @param {string|null} raw - Value returned by {@link activeOutputError}.
 * @returns {string}
 */
export function outputErrorLabel(raw) {
    return /busy/i.test(raw ?? '')
        ? 'Output in use by another player — stop it to play here'
        : 'Output unavailable';
}

/** How long a seek target overrides incoming positions (ms). */
export const SEEK_GUARD_MS = 3000;
/** How far a reported position may sit from the target and still count as arrived (s). */
export const SEEK_ARRIVED_S = 3;

/**
 * Keep a seek target on screen until the backend's position catches up.
 *
 * A state event emitted while the seek was still travelling carries the
 * pre-seek position; applying it rewinds the progress bar for a tick before it
 * jumps forward, which reads as "the seek did not work" and invites the user to
 * seek again. The guard releases as soon as a report lands near the target, on a
 * track change (a new track resets the position to 0, which would otherwise look
 * like "not arrived"), and on expiry — so a seek the device actually refused
 * cannot freeze the bar.
 *
 * Pure: callers own the pending value and store whatever comes back.
 *
 * @param {object} state - Incoming PlayerState.
 * @param {{target: number, at: number, title: string|null}|null} pending - Seek in flight.
 * @param {number} [now] - Injectable clock for tests.
 * @returns {{state: object, pending: object|null}} State to apply, and the guard to keep.
 */
export function applySeekGuard(state, pending, now = Date.now()) {
    if (!pending) return { state, pending: null };
    if ((state.title ?? null) !== pending.title) return { state, pending: null };
    const elapsed = state.elapsed ?? 0;
    if (Math.abs(elapsed - pending.target) <= SEEK_ARRIVED_S
        || now - pending.at > SEEK_GUARD_MS) {
        return { state, pending: null };
    }
    return { state: { ...state, elapsed: pending.target }, pending };
}

/**
 * Detect a DSD signal from either a FormatInfo-like object
 * (`{ format?, codec? }`) or a raw NowPlayingItem `source_format` string.
 * @param {{format?:string, codec?:string}|string|null|undefined} fmtOrSourceFormat
 * @returns {boolean}
 */
export function isDsd(fmtOrSourceFormat) {
    if (!fmtOrSourceFormat) return false;
    if (typeof fmtOrSourceFormat === 'string') {
        return fmtOrSourceFormat.toUpperCase().includes('DSD');
    }
    return (fmtOrSourceFormat.format || '').toUpperCase().includes('DSD')
        || (fmtOrSourceFormat.codec  || '').toUpperCase().includes('DSD');
}

/**
 * Extract a saturated-boost dominant `{r, g, b}` color from an image URL.
 * Samples a 16×16 downscale, averages, then amplifies the dominant channel
 * by 1.4× (and attenuates the others) for a livelier tint.
 *
 * Resolves `null` on tainted-canvas / load error.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {boolean} [opts.crossOrigin=true] - Set `img.crossOrigin = 'anonymous'`.
 *        Required for cross-origin URLs (e.g. backend cover proxy); set false
 *        for same-origin / blob URLs where CORS would block decoding.
 * @returns {Promise<{r:number, g:number, b:number}|null>}
 */
export function extractDominantColor(url, { crossOrigin = true } = {}) {
    return new Promise((resolve) => {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width  = 16;
                canvas.height = 16;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 16, 16);
                const data = ctx.getImageData(0, 0, 16, 16).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
                }
                if (!count) return resolve(null);
                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);
                const max = Math.max(r, g, b);
                const boost = 1.4;
                r = Math.min(255, Math.round(r * (max === r ? boost : 1 / boost)));
                g = Math.min(255, Math.round(g * (max === g ? boost : 1 / boost)));
                b = Math.min(255, Math.round(b * (max === b ? boost : 1 / boost)));
                resolve({ r, g, b });
            } catch (_) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}
