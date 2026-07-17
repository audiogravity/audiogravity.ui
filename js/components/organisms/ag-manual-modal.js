/**
 * @module AgManualModal
 * @description Full-screen modal that renders the Audiogravity user manual.
 * The manual is authored as Markdown in the audiogravity.site repo and published
 * at audiogravity.app/docs/manual/. Chapters are fetched on demand (one per
 * click, then cached) and rendered client-side with `marked`, which is
 * lazy-loaded on first open so it costs nothing until the manual is used.
 * Layout: a chapter sidebar (table of contents) plus a reading pane.
 *
 * Trust boundary: the rendered HTML comes from our own first-party manual over
 * HTTPS and is injected with `unsafeHTML` (intentional inline HTML like `<sup>`
 * must survive). The app ships a CSP whose `script-src` omits `'unsafe-inline'`,
 * so injected inline event handlers (`<img onerror>`) and `<script>` do not
 * execute — that CSP, not sanitisation, is the guard. If the manual ever sources
 * non-first-party content, add DOMPurify here.
 *
 * @element ag-manual-modal
 *
 * @attr {boolean} is-open - Modal visibility state
 *
 * @dependency css/components/modal.css - .manual-modal styles
 *
 * @fires manual-close - Dispatched when the modal is closed
 */
import { LitElement, html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

/**
 * Base URL of the published manual. Single-sourced in audiogravity.site and
 * overridable per box via the runtime-config channel (window.AG_CONFIG, the same
 * mechanism used for apiUrl) so an install can repoint it without a UI rebuild.
 */
export const MANUAL_BASE =
    (typeof window !== 'undefined' && window.AG_CONFIG && window.AG_CONFIG.manualBase)
    || 'https://audiogravity.app/docs/manual';

// BACKLOG: this TOC duplicates docs/manual/README.md (audiogravity.site) — derive
// it live instead of hardcoding. See audiogravity.ops/BACKLOG.md (UI / Polish).
/** Ordered chapters — stable slugs (mirror docs/manual/) → sidebar labels. */
export const MANUAL_CHAPTERS = [
    { id: '00-quick-start',       label: 'Quick start' },
    { id: '01-introduction',      label: 'Introduction' },
    { id: '02-installation',      label: 'Installation' },
    { id: '03-first-run',         label: 'First run' },
    { id: '04-listening',         label: 'Listening' },
    { id: '05-library-streaming', label: 'Library & streaming' },
    { id: '06-outputs-engines',   label: 'Outputs & engines' },
    { id: '07-administration',    label: 'Administration' },
    { id: '08-updating',          label: 'Updating' },
    { id: '09-troubleshooting',   label: 'Troubleshooting' },
    { id: '10-glossary',          label: 'Glossary' },
];

/** Match an intra-manual link "NN-name.md" with an optional "#anchor". */
const CHAPTER_HREF = /^(?:\.\/)?(\d{2}-[a-z0-9-]+)\.md(?:#(.+))?$/i;

/**
 * GitHub-style heading slug so intra-manual anchors (authored against GitHub's
 * rendering) resolve: lowercase, drop punctuation, keep Unicode letters/numbers,
 * and turn each whitespace into a hyphen without collapsing runs (GitHub does not
 * collapse). Duplicate slugs are disambiguated by the caller.
 * @param {string} text - heading text content
 * @returns {string}
 */
function slugify(text) {
    return text.toLowerCase().trim().replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s/g, '-');
}

// BACKLOG: the full-screen modal shell below (open/close/Escape/updated .show)
// duplicates ag-docs-modal.js — extract a shared AgFullscreenModal base (+ focus
// management). See audiogravity.ops/BACKLOG.md (UI / Polish).
export class AgManualModal extends LitElement {
    static properties = {
        isOpen:    { type: Boolean, attribute: 'is-open' },
        _activeId: { state: true },
        _html:     { state: true },
        _loading:  { state: true },
        _error:    { state: true },
    };

    createRenderRoot() {
        return this; // Light DOM — picks up .manual-modal from modal.css
    }

    constructor() {
        super();
        this.isOpen = false;
        this._activeId = MANUAL_CHAPTERS[0].id;
        this._html = '';
        this._loading = false;
        this._error = false;
        /** @type {Map<string, string>} rendered-HTML cache keyed by chapter id */
        this._cache = new Map();
        /** @type {Map<string, Promise<boolean>>} in-flight loads, de-duped by id */
        this._inflight = new Map();
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onContentClick = this._onContentClick.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this._onKeyDown);
        this.classList.add('manual-modal');
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this._onKeyDown);
    }

    updated(changed) {
        if (changed.has('isOpen')) {
            this.classList.toggle('show', this.isOpen);
            // Opened via the `is-open` attribute/property rather than open() → kick a
            // load so the reading pane is never blank. open() already sets _loading,
            // so this only fires for the attribute path.
            if (this.isOpen && !this._html && !this._loading && !this._error) {
                this._loadChapter(this._activeId);
            }
        }
    }

    /**
     * Open the manual, optionally at a specific chapter.
     * @param {string} [chapterId] - a MANUAL_CHAPTERS[].id; defaults to the last-viewed
     */
    open(chapterId) {
        this.isOpen = true;
        this._loadChapter(chapterId || this._activeId);
    }

    /**
     * Close the manual and notify listeners.
     * @fires manual-close
     */
    close() {
        this.isOpen = false;
        this.dispatchEvent(new CustomEvent('manual-close', { bubbles: true, composed: true }));
    }

    _onKeyDown(e) {
        if (this.isOpen && e.key === 'Escape') this.close();
    }

    /**
     * Show a chapter: fetch+render+enhance it (cached), then scroll (anchor or
     * top). The cached HTML is already enhanced (heading ids, absolute links,
     * lazy absolute images), so displaying is a pure innerHTML swap. The scroll
     * is applied unconditionally after `updateComplete` rather than gated on
     * `_html` changing, so navigating to an anchor within the already-displayed
     * chapter still scrolls.
     * @param {string} id - chapter slug (a MANUAL_CHAPTERS[].id)
     * @param {?string} [anchor] - heading id to scroll to once rendered
     * @returns {Promise<void>}
     */
    async _loadChapter(id, anchor = null) {
        this._activeId = id;
        this._error = false;

        if (!this._cache.has(id)) {
            const ok = await this._fetchAndCache(id);
            if (!ok || this._activeId !== id) return;
        }

        this._html = this._cache.get(id);
        await this.updateComplete;
        if (this._activeId !== id) return; // user switched chapters mid-render
        this._scrollTo(anchor);
    }

    /**
     * Fetch a chapter's Markdown and render it into the cache, de-duplicating
     * concurrent loads of the same chapter (a repeat click reuses the pending
     * promise instead of firing a second fetch). `marked` is imported lazily.
     * @param {string} id - chapter slug
     * @returns {Promise<boolean>} true on success, false on error (sets _error)
     */
    async _fetchAndCache(id) {
        if (this._inflight.has(id)) return this._inflight.get(id);
        const load = (async () => {
            this._loading = true;
            this._html = '';
            try {
                const res = await fetch(`${MANUAL_BASE}/${id}.md`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const md = await res.text();
                const { marked } = await import('marked');
                this._cache.set(id, this._enhanceHtml(marked.parse(md, { gfm: true })));
                return true;
            } catch (e) {
                console.error('[manual] chapter load failed', id, e);
                if (this._activeId === id) this._error = true;
                return false;
            } finally {
                if (this._activeId === id) this._loading = false;
                this._inflight.delete(id);
            }
        })();
        this._inflight.set(id, load);
        return load;
    }

    /**
     * Enhance a rendered chapter BEFORE it reaches the live DOM: stamp slug ids
     * on headings (marked emits none), absolutise links so non-left-click
     * interactions (middle-click, "copy link address") resolve to published URLs,
     * and absolutise + lazy-load images. Runs inside an inert <template> — its
     * content lives in a separate document, so setting an image src cannot
     * trigger a fetch. Enhancing at cache time means the browser never sees a
     * manual-relative image src (which would eagerly 404 against the app origin),
     * `loading="lazy"` exists before the fetch decision, and chapter revisits
     * reuse the enhanced HTML with zero rework.
     * @param {string} html - marked output for one chapter
     * @returns {string} the enhanced HTML
     */
    _enhanceHtml(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        const root = tpl.content;
        const seen = new Map(); // disambiguate duplicate headings ("Notes" → notes, notes-1)
        root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
            if (h.id) return;
            const slug = slugify(h.textContent || '');
            const n = seen.get(slug) || 0;
            seen.set(slug, n + 1);
            h.id = n ? `${slug}-${n}` : slug;
        });
        root.querySelectorAll('a[href]').forEach((a) => this._rewriteLink(a));
        root.querySelectorAll('img[src]').forEach((img) => this._rewriteImage(img));
        return tpl.innerHTML;
    }

    /**
     * Absolutise a rendered image against the manual base and make it lazy.
     * Markdown images are authored manual-relative (`images/04-queue.png`); left
     * as-is the browser would resolve them against the app origin, where they
     * don't exist. Absolute (http/https/data) sources are kept as authored.
     * @param {HTMLImageElement} img - a rendered <img src>
     */
    _rewriteImage(img) {
        // Attribute (not property) so it survives template-content serialisation.
        img.setAttribute('loading', 'lazy'); // illustrated chapters must not fetch every image up front
        const src = img.getAttribute('src') || '';
        if (!src || /^(https?:|data:)/i.test(src)) return;
        try {
            img.setAttribute('src', new URL(src, `${MANUAL_BASE}/`).href);
        } catch {
            /* leave a malformed src untouched */
        }
    }

    /**
     * Rewrite one rendered link. Intra-manual chapter links are tagged with
     * `data-chapter`/`data-anchor` (consumed by the click handler for in-modal
     * navigation) and pointed at the published chapter URL so a middle-click still
     * opens something real; every other non-anchor link is absolutised against the
     * manual base and set to open in a new tab.
     * @param {HTMLAnchorElement} a - a rendered <a href>
     */
    _rewriteLink(a) {
        const href = a.getAttribute('href') || '';
        if (!href || href.startsWith('#') || /^(mailto:|tel:)/i.test(href)) return;
        if (a.dataset.chapter || a.target === '_blank') return; // already rewritten

        const m = href.match(CHAPTER_HREF);
        if (m && MANUAL_CHAPTERS.some((c) => c.id === m[1])) {
            a.dataset.chapter = m[1];
            if (m[2]) a.dataset.anchor = m[2];
            a.setAttribute('href', `${MANUAL_BASE}/${m[1]}.md${m[2] ? `#${m[2]}` : ''}`);
            return;
        }
        try {
            a.setAttribute('href', new URL(href, `${MANUAL_BASE}/`).href);
        } catch {
            /* leave a malformed href untouched */
        }
        a.target = '_blank';
        a.rel = 'noopener';
    }

    /**
     * Scroll the reading pane to an anchor, or back to the top for a fresh chapter.
     * @param {?string} anchor - heading id (without '#'), or null for top
     */
    _scrollTo(anchor) {
        if (anchor) {
            this._scrollToAnchor(anchor);
            return;
        }
        const pane = this.querySelector('.manual-content');
        if (pane) pane.scrollTop = 0;
    }

    /**
     * Scroll the reading pane to a heading by id (no host navigation).
     * @param {string} anchorId - heading id (without the leading '#')
     */
    _scrollToAnchor(anchorId) {
        if (!anchorId) return;
        const esc = (window.CSS && CSS.escape) ? CSS.escape(anchorId) : anchorId;
        this.querySelector(`#${esc}`)?.scrollIntoView({ block: 'start' });
    }

    /**
     * Intercept clicks on rendered links so the host app is never navigated away
     * (which would close the modal). Chapter links (tagged during render) switch
     * chapters in place, in-page anchors scroll, and rewritten external links are
     * left to the browser (they already carry an absolute href + target=_blank).
     * @param {MouseEvent} e - click event within the reading pane
     */
    _onContentClick(e) {
        const a = e.target.closest?.('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';

        if (href.startsWith('#')) {
            e.preventDefault();
            this._scrollToAnchor(href.slice(1));
            return;
        }
        if (a.dataset.chapter) {
            e.preventDefault();
            this._loadChapter(a.dataset.chapter, a.dataset.anchor || null);
        }
        // mailto/tel and rewritten external links (target=_blank) → browser handles.
    }

    render() {
        if (!this.isOpen) return nothing;
        return html`
            <div class="manual-modal-header">
                <h3>User Manual</h3>
                <button class="modal-close" @click=${this.close} aria-label="Close">&times;</button>
            </div>
            <div class="manual-modal-body">
                <nav class="manual-toc" aria-label="Manual chapters">
                    ${MANUAL_CHAPTERS.map((c) => html`
                        <button
                            class="manual-toc-item ${c.id === this._activeId ? 'active' : ''}"
                            aria-current=${c.id === this._activeId ? 'true' : nothing}
                            @click=${() => this._loadChapter(c.id)}
                        >${parseInt(c.id, 10)}. ${c.label}</button>
                    `)}
                </nav>
                <div class="manual-content" aria-live="polite" @click=${this._onContentClick}>
                    ${this._loading ? html`<div class="manual-status">Loading…</div>` : nothing}
                    ${this._error ? html`
                        <div class="manual-status">
                            <p>Couldn't load the manual — check the box's internet connection.</p>
                            <a href="${MANUAL_BASE}/${this._activeId}.md" target="_blank" rel="noopener">
                                Open this chapter on audiogravity.app
                            </a>
                        </div>` : nothing}
                    ${!this._loading && !this._error
                        ? html`<article class="manual-md">${unsafeHTML(this._html)}</article>`
                        : nothing}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-manual-modal', AgManualModal);
