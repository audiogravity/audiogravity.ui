/**
 * @module manual-shots/review
 * @description The page that puts each new figure beside the one the manual publishes,
 * so a person decides what to replace. Every image is embedded as a data: URI: the page
 * is meant to be opened anywhere — a local file, or a published page whose host blocks
 * images served beside it.
 */

/**
 * @typedef {object} ReviewEntry
 * @property {string} name - Recipe name: `software` is images/ios-software.webp.
 * @property {string[]} [chapters] - The manual's chapter files that show the figure.
 * @property {string[]} [needs] - What the lab had to provide (the recipe's `needs`).
 * @property {Buffer} [after] - The new WebP; absent when the recipe failed.
 * @property {?Buffer} [before] - The published WebP; null when the manual has none.
 * @property {?number} [changed] - Share of pixels that moved (0 to 1); null when the sizes differ.
 * @property {?number[]} [beforeSize] - [width, height] of the published figure.
 * @property {number[]} [afterSize] - [width, height] of the new figure.
 * @property {string} [error] - Why the recipe failed.
 */

import { escapeHtml } from '../../js/core/escape-html.js';

/** Below this share of moved pixels, a figure counts as unchanged: two encodings of one screen. */
export const UNCHANGED_BELOW = 0.0005;

/**
 * Text for an element's body — the app's own escaping (js/core/escape-html.js), handed a
 * string whatever it is given.
 *
 * @param {*} value - Rendered through String().
 * @returns {string}
 */
function text(value) {
    return escapeHtml(String(value));
}

/**
 * Text for a double- or single-quoted attribute value: the app's escaping leaves quotes
 * alone, which an element's body allows and an attribute does not.
 *
 * @param {*} value - Rendered through String().
 * @returns {string}
 */
export function escapeAttribute(value) {
    return text(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * How a figure compares with the published one, as the page's chip says it.
 *
 * @param {ReviewEntry} entry - One figure.
 * @returns {{ key: 'failed'|'new'|'resized'|'unchanged'|'changed', label: string }}
 */
export function verdict(entry) {
    if (entry.error) return { key: 'failed', label: 'Failed' };
    if (!entry.before) return { key: 'new', label: 'Not in the manual yet' };
    if (entry.changed === null || entry.changed === undefined) return { key: 'resized', label: 'New size' };
    if (entry.changed < UNCHANGED_BELOW) return { key: 'unchanged', label: 'Unchanged' };
    return { key: 'changed', label: `Changed · ${(entry.changed * 100).toFixed(1)} % of pixels` };
}

/**
 * A WebP as a data: URI.
 *
 * @param {Buffer} buf - The file.
 * @returns {string}
 */
function dataUri(buf) {
    return `data:image/webp;base64,${buf.toString('base64')}`;
}

/**
 * "1029 × 2361 · 67 KB"
 *
 * @param {?number[]} size - [width, height].
 * @param {?Buffer} buf - The file, for its weight.
 * @returns {string}
 */
function describe(size, buf) {
    if (!size || !buf) return '—';
    return `${size[0]} × ${size[1]} · ${Math.round(buf.length / 1024)} KB`;
}

/**
 * One figure: what it is, how it compares, and the two images side by side.
 *
 * @param {ReviewEntry} e - One figure that was taken.
 * @returns {string} HTML.
 */
function figureSection(e) {
    const v = verdict(e);
    const file = `ios-${e.name}.webp`;
    const where = e.chapters?.length ? e.chapters.join(', ') : 'Not shown by any chapter';
    const needs = e.needs?.length ? `<p class="needs">Needs: ${e.needs.map(text).join(' · ')}</p>` : '';
    const published = e.before
        ? `<img src="${dataUri(e.before)}" alt="${escapeAttribute(file)}, as the manual publishes it">`
        : '<p class="none">The manual has no such figure.</p>';
    return `
<section class="fig" id="${escapeAttribute(e.name)}">
  <header class="fig-hd">
    <div>
      <p class="eyebrow">${text(where)}</p>
      <h2>${text(file)}</h2>
    </div>
    <span class="chip ${v.key}">${text(v.label)}</span>
  </header>
  ${needs}
  <div class="pair">
    <figure><figcaption>Published · <span class="num">${text(describe(e.beforeSize, e.before))}</span></figcaption>${published}</figure>
    <figure><figcaption>New · <span class="num">${text(describe(e.afterSize, e.after))}</span></figcaption><img src="${dataUri(e.after)}" alt="${escapeAttribute(file)}, retaken"></figure>
  </div>
</section>`;
}

/**
 * The whole review page.
 *
 * @param {ReviewEntry[]} entries - Every recipe run, failed ones included.
 * @param {object} meta
 * @param {string} meta.source - Where the figures were taken, e.g. "http://10.0.4.254:3000".
 * @param {string} meta.outDir - Where the new figures were written.
 * @param {Date} [meta.when=new Date()] - When they were taken.
 * @returns {string} A self-contained HTML page.
 */
export function reviewPage(entries, { source, outDir, when = new Date() }) {
    const taken = entries.filter((e) => !e.error);
    const failed = entries.filter((e) => e.error);
    const count = (key) => taken.filter((e) => verdict(e).key === key).length;
    const summary = [
        ['changed', 'changed'], ['resized', 'new size'], ['new', 'not in the manual'], ['unchanged', 'unchanged'],
    ].map(([key, label]) => [count(key), key, label]).filter(([n]) => n)
        .map(([n, key, label]) => `<span class="chip ${key}">${n} ${label}</span>`)
        .concat(failed.length ? [`<span class="chip failed">${failed.length} failed</span>`] : [])
        .join('');
    const failures = failed.length ? `
<section class="panel">
  <h2>Failed</h2>
  <ul>${failed.map((e) => `<li><span class="mono">ios-${text(e.name)}.webp</span> — ${text(e.error)}</li>`).join('')}</ul>
</section>` : '';
    return `<title>Manual figure review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --ground: #f2f4f4; --surface: #ffffff; --ink: #151a1b; --muted: #59625f; --rule: #d7dddc;
    --edge: #c9d0cf; --ok: #1f6b42; --ok-bg: #e2f1e8; --warn: #8a4b00; --warn-bg: #fbeedb;
    --info: #1c5a8a; --info-bg: #e2eef8; --bad: #a3261d; --bad-bg: #fbe4e1;
    --font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --ground: #121515; --surface: #1b1f1f; --ink: #e9eceb; --muted: #a0a8a6; --rule: #333a39;
      --edge: #3d4544; --ok: #8bd3a8; --ok-bg: #16301f; --warn: #f0b56e; --warn-bg: #3a2912;
      --info: #8cc2ee; --info-bg: #15293a; --bad: #f19a90; --bad-bg: #3b1714;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --ground: #121515; --surface: #1b1f1f; --ink: #e9eceb; --muted: #a0a8a6; --rule: #333a39;
    --edge: #3d4544; --ok: #8bd3a8; --ok-bg: #16301f; --warn: #f0b56e; --warn-bg: #3a2912;
    --info: #8cc2ee; --info-bg: #15293a; --bad: #f19a90; --bad-bg: #3b1714;
  }
  body { background: var(--ground); color: var(--ink); font: 15px/1.55 var(--font); padding-inline: 16px; padding-block: 32px 64px; }
  .wrap { max-width: 1040px; margin: 0 auto; display: grid; gap: 24px; }
  h1 { font-size: 30px; line-height: 1.15; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
  .lede { margin: 8px 0 0; color: var(--muted); max-width: 68ch; }
  .lede .mono { overflow-wrap: anywhere; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; }
  .fig, .panel { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 20px; display: grid; gap: 12px; }
  .fig-hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  .eyebrow { margin: 0; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  h2 { font: 500 16px/1.3 var(--mono); margin: 2px 0 0; overflow-wrap: anywhere; }
  .panel h2 { font: 600 18px/1.3 var(--font); }
  .chip { font-size: 12px; font-weight: 600; letter-spacing: 0.03em; padding: 3px 10px; border-radius: 999px; white-space: nowrap; color: var(--muted); background: var(--ground); }
  .chip.unchanged { color: var(--ok); background: var(--ok-bg); }
  .chip.changed { color: var(--warn); background: var(--warn-bg); }
  .chip.resized, .chip.new { color: var(--info); background: var(--info-bg); }
  .chip.failed { color: var(--bad); background: var(--bad-bg); }
  .needs { margin: 0; color: var(--muted); font-size: 14px; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 360px)); gap: 20px; align-items: start; }
  figure { margin: 0; display: grid; gap: 6px; }
  figcaption { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .num, .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: 0; text-transform: none; }
  figure img { width: 100%; max-width: 100%; height: auto; border: 1px solid var(--edge); border-radius: 3px; }
  .none { margin: 0; padding: 24px 12px; border: 1px dashed var(--edge); border-radius: 3px; color: var(--muted); text-align: center; font-size: 14px; }
  .panel ul { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
</style>
<main class="wrap">
  <header>
    <h1>Manual figure review</h1>
    <p class="lede">Each figure retaken from <span class="mono">${text(source)}</span> in the manual's phone format, 375 × 812 at density 3, beside the one the manual publishes. Taken ${text(when.toISOString().slice(0, 16).replace('T', ' '))} UTC; the new files are in <span class="mono">${text(outDir)}</span>, and the manual is untouched.</p>
  </header>
  <div class="summary">${summary}</div>
${failures}
${taken.map(figureSection).join('\n')}
</main>
`;
}
