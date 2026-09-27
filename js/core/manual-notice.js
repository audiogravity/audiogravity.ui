/**
 * @module manual-notice
 * @description The user manual's trademark notice, as its README.md words it — the one
 * Markdown file that carries it: the chapters no longer do, and each place the manual is
 * read shows it once instead.
 *
 * Shared by the Manual window, which shows it under each chapter, and by
 * scripts/sync-manual.js, which refuses a build whose manual lost it: found by its words,
 * a rewording on the site would otherwise drop it from the app without a word. The site's
 * generator checks the README for the same words (`NOTICE_MARK` in gen_manual_html.py).
 */

/**
 * The notice: the italic passage of README.md that says the names are trademarks of their
 * respective owners.
 *
 * @param {string} md - README.md markdown.
 * @returns {?string} The notice, its inline HTML (<sup>) kept and its lines joined, or null
 *   when the README does not carry it.
 */
export function parseNotice(md) {
    const m = md.match(/\*([^*]*trademarks\s+of\s+their\s+respective\s+owners[^*]*)\*/);
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}
