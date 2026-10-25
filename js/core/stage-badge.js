/**
 * The release stage, written in the corner of the app: a badge the user can dismiss. Its words
 * come from the version itself (stageOf), so that a release cannot ship with the stage of
 * another — "BETA" for a 0.x release, "1.0 RC" for a release candidate, none for a final one.
 * They used to come from a build setting kept by hand on one machine, which nothing checked.
 *
 * Kept apart from common.js, which starts the session when it loads, so that the badge the
 * app ships is the one its test mounts.
 */

/**
 * The stage a version names, as the badge writes it.
 *
 * @param {string|undefined} version - The app's version, e.g. "0.9.80" or "1.0.0-rc.1".
 * @returns {string} "BETA" for a 0.x release, "<major>.<minor> RC" for a release candidate,
 *   '' for a final release, a development build (x.y.z-dev) or anything unreadable.
 */
export function stageOf(version) {
    const m = /^v?(\d+)\.(\d+)\.\d+(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version || '').trim());
    if (!m) return '';
    const [, major, minor, pre] = m;
    if (pre) return /^rc(\.\d+)?$/i.test(pre) ? `${major}.${minor} RC` : '';
    return major === '0' ? 'BETA' : '';
}

/**
 * Mounts the stage badge, unless there is no stage to show.
 *
 * @param {string|undefined} label - The stage, as stageOf writes it.
 * @param {Document} [doc=document] - The document to mount it in.
 * @returns {HTMLElement|null} The badge, or null when there is no stage.
 */
export function mountStageBadge(label, doc = document) {
    if (!label) return null;
    const badge = doc.createElement('div');
    badge.textContent = label;
    Object.assign(badge.style, {
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--spacing-sm))',
        right: 'calc(env(safe-area-inset-right, 0px) + var(--spacing-sm))',
        zIndex: '2147483647',
        padding: 'var(--spacing-xs) var(--spacing-md)',
        // The stage marks the build, not the theme: the same violet, and white on it, in every
        // theme — a token would take the theme's accent instead.
        background: '#8b5cf6',
        color: '#fff',
        fontFamily: 'var(--font-family)',
        fontSize: 'var(--font-size-xxs)',
        fontWeight: '700',
        letterSpacing: '0.14em',
        borderRadius: 'var(--radius-sm)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        pointerEvents: 'auto',
        cursor: 'pointer',
        userSelect: 'none',
    });
    badge.addEventListener('click', () => badge.remove());
    doc.body.appendChild(badge);
    return badge;
}
