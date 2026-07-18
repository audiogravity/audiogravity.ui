/**
 * Unit tests for ag-manual-modal — chapter fetch/render/cache, error states,
 * open/close, the table of contents, link rewriting and in-modal navigation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MANUAL_CHAPTERS, MANUAL_BASE, parseToc } from './ag-manual-modal.js';

// The component lazy-imports the real `marked` (installed dep); tests assert on its
// actual output rather than a mock, so they exercise the true render integration.

describe('ag-manual-modal', () => {
    let el;

    beforeEach(() => {
        // Default benign fetch so the is-open auto-load never throws in tests that
        // don't stub fetch themselves; specific tests re-stub with vi.stubGlobal.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') }));
        el = document.createElement('ag-manual-modal');
        document.body.appendChild(el);
    });

    afterEach(() => {
        el.remove();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('fallback chapters are structurally sound (unique ids, NN-prefix order, labels)', () => {
        // Structural, not data, assertions: the canonical TOC lives in the site
        // repo's README.md (fetched live); this list is only the offline fallback.
        const ids = MANUAL_CHAPTERS.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => /^\d{2}-[a-z0-9-]+$/.test(id))).toBe(true);
        expect([...ids].sort()).toEqual(ids); // NN prefixes in ascending order
        expect(MANUAL_CHAPTERS.every((c) => c.label.trim().length > 0)).toBe(true);
    });

    describe('parseToc (live TOC from README.md)', () => {
        it('parses numbered contents entries, including chapter 0, stripping label markup', () => {
            const md = [
                '# Audiogravi<sup>ty</sup> — User Manual',
                '',
                '0. [Quick start](00-quick-start.md) — from zero to music',
                '1. [Introduction](01-introduction.md) — what Audiogravi<sup>ty</sup> is',
                '10. [Glossary](10-glossary.md) — the vocabulary',
                'Not a chapter line. See [elsewhere](../../README.md).',
            ].join('\n');
            expect(parseToc(md)).toEqual([
                { id: '00-quick-start', label: 'Quick start' },
                { id: '01-introduction', label: 'Introduction' },
                { id: '10-glossary', label: 'Glossary' },
            ]);
        });

        it('returns empty for markdown with no contents list', () => {
            expect(parseToc('# X\n\nJust prose.')).toEqual([]);
        });
    });

    describe('_loadToc (sidebar derived from the published README)', () => {
        it('replaces the fallback with the parsed live TOC', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('0. [Quick start](00-quick-start.md)\n11. [New chapter](11-new-chapter.md)'),
            }));
            await el._loadToc();
            expect(el._chapters.map((c) => c.id)).toEqual(['00-quick-start', '11-new-chapter']);
        });

        it('keeps the fallback (and allows a retry) when the fetch fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
            await el._loadToc();
            expect(el._chapters).toBe(MANUAL_CHAPTERS);
            expect(el._tocPromise).toBeNull(); // next open retries
        });

        it('keeps the fallback when the README has no parsable contents list', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true, text: () => Promise.resolve('# Broken page'),
            }));
            await el._loadToc();
            expect(el._chapters).toBe(MANUAL_CHAPTERS);
        });
    });

    it('starts closed', () => {
        expect(el.isOpen).toBe(false);
    });

    it('open() shows the modal and loads the default (first) chapter', () => {
        const spy = vi.spyOn(el, '_loadChapter').mockResolvedValue();
        el.open();
        expect(el.isOpen).toBe(true);
        expect(spy).toHaveBeenCalledWith('00-quick-start');
    });

    it('open(id) loads the requested chapter', () => {
        const spy = vi.spyOn(el, '_loadChapter').mockResolvedValue();
        el.open('05-library-streaming');
        expect(spy).toHaveBeenCalledWith('05-library-streaming');
    });

    it('auto-loads a chapter when opened via the is-open property (not open())', async () => {
        const load = vi.spyOn(el, '_loadChapter').mockResolvedValue();
        el.isOpen = true; // attribute/property path — no open() call
        await el.updateComplete;
        expect(load).toHaveBeenCalledWith('00-quick-start');
    });

    it('does not double-load: open() sets _loading so updated() skips the auto-load', async () => {
        const load = vi.spyOn(el, '_loadChapter'); // real impl runs (sets _loading)
        el.open('05-library-streaming');
        await el.updateComplete;
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('fetches the right URL, renders via marked, and caches (no refetch)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('# Hello') });
        vi.stubGlobal('fetch', fetchMock);

        await el._loadChapter('02-installation');
        expect(fetchMock).toHaveBeenCalledWith(`${MANUAL_BASE}/02-installation.md`);
        expect(el._html).toContain('<h1 id="hello">Hello</h1>'); // marked output, enhanced at cache time
        expect(el._error).toBe(false);
        expect(el._loading).toBe(false);

        // Second visit is served from the in-memory cache — no second fetch.
        await el._loadChapter('02-installation');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates concurrent loads of the same uncached chapter (single fetch)', async () => {
        let resolveFetch;
        const fetchMock = vi.fn().mockReturnValue(new Promise((r) => { resolveFetch = r; }));
        vi.stubGlobal('fetch', fetchMock);

        const p1 = el._fetchAndCache('05-library-streaming');
        const p2 = el._fetchAndCache('05-library-streaming');
        resolveFetch({ ok: true, text: () => Promise.resolve('# X') });
        const [r1, r2] = await Promise.all([p1, p2]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(r1).toBe(true);
        expect(r2).toBe(true);
    });

    it('shows an error state on a non-OK response and logs it (not swallowed)', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
        await el._loadChapter('03-first-run');
        expect(el._error).toBe(true);
        expect(el._html).toBe('');
        expect(err).toHaveBeenCalled();
    });

    it('shows an error state when the network throws (offline box)', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await el._loadChapter('04-listening');
        expect(el._error).toBe(true);
    });

    it('close() hides the modal and emits manual-close', () => {
        const onClose = vi.fn();
        el.addEventListener('manual-close', onClose);
        el.isOpen = true;
        el.close();
        expect(el.isOpen).toBe(false);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('Escape closes an open modal but is ignored when closed', () => {
        el.isOpen = false;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(el.isOpen).toBe(false); // no-op, no error

        el.isOpen = true;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(el.isOpen).toBe(false);
    });

    it('renders one TOC item per fallback chapter and the rendered chapter body', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('# X') }));
        el.isOpen = true;
        await el._loadChapter('01-introduction');
        await el.updateComplete;

        expect(el.querySelectorAll('.manual-toc-item')).toHaveLength(MANUAL_CHAPTERS.length);
        expect(el.querySelector('.manual-toc-item.active').textContent).toContain('Introduction');
        expect(el.querySelector('.manual-md').textContent).toContain('X');
    });

    describe('click handling (never navigate the host app away)', () => {
        /** Fake click event whose target is an <a> with the given href + dataset. */
        const clickOn = (href, dataset = {}) => {
            const a = document.createElement('a');
            if (href != null) a.setAttribute('href', href);
            Object.assign(a.dataset, dataset);
            return { target: a, preventDefault: vi.fn() };
        };

        it('switches chapter in place for a tagged intra-manual link', () => {
            const load = vi.spyOn(el, '_loadChapter').mockResolvedValue();
            const e = clickOn(`${MANUAL_BASE}/06-outputs-engines.md`, { chapter: '06-outputs-engines' });
            el._onContentClick(e);
            expect(e.preventDefault).toHaveBeenCalled();
            expect(load).toHaveBeenCalledWith('06-outputs-engines', null);
        });

        it('passes the anchor for a tagged chapter+anchor link', () => {
            const load = vi.spyOn(el, '_loadChapter').mockResolvedValue();
            el._onContentClick(clickOn(`${MANUAL_BASE}/07-administration.md#roon`, { chapter: '07-administration', anchor: 'roon' }));
            expect(load).toHaveBeenCalledWith('07-administration', 'roon');
        });

        it('scrolls for an in-page anchor without loading a chapter', () => {
            const scroll = vi.spyOn(el, '_scrollToAnchor');
            const load = vi.spyOn(el, '_loadChapter').mockResolvedValue();
            const e = clickOn('#roon');
            el._onContentClick(e);
            expect(e.preventDefault).toHaveBeenCalled();
            expect(scroll).toHaveBeenCalledWith('roon');
            expect(load).not.toHaveBeenCalled();
        });

        it('leaves rewritten external links to the browser (no preventDefault, no in-modal load)', () => {
            const load = vi.spyOn(el, '_loadChapter').mockResolvedValue();
            const e = clickOn('https://github.com/audiogravity/audiogravity.site/issues');
            el._onContentClick(e);
            expect(e.preventDefault).not.toHaveBeenCalled(); // target=_blank opens it natively
            expect(load).not.toHaveBeenCalled();
        });

        it('leaves mailto: links to the OS', () => {
            const e = clickOn('mailto:contact@audiogravity.app');
            el._onContentClick(e);
            expect(e.preventDefault).not.toHaveBeenCalled();
        });

        it('ignores clicks that are not on a link', () => {
            const div = document.createElement('div');
            expect(() => el._onContentClick({ target: div, preventDefault: vi.fn() })).not.toThrow();
        });
    });

    describe('link rewriting (_rewriteLink / _enhanceHtml)', () => {
        const mkLink = (href) => {
            const a = document.createElement('a');
            a.setAttribute('href', href);
            return a;
        };

        it('tags an intra-manual chapter link and points it at the published URL', () => {
            const a = mkLink('06-outputs-engines.md');
            el._rewriteLink(a);
            expect(a.dataset.chapter).toBe('06-outputs-engines');
            expect(a.getAttribute('href')).toBe(`${MANUAL_BASE}/06-outputs-engines.md`);
            expect(a.target).toBe(''); // chapter links stay in-modal, not new-tab
        });

        it('carries the anchor on a chapter+anchor link', () => {
            const a = mkLink('07-administration.md#roon');
            el._rewriteLink(a);
            expect(a.dataset.chapter).toBe('07-administration');
            expect(a.dataset.anchor).toBe('roon');
            expect(a.getAttribute('href')).toBe(`${MANUAL_BASE}/07-administration.md#roon`);
        });

        it('absolutises a sibling repo doc and opens it in a new tab', () => {
            const a = mkLink('../../RELEASE_NOTES.md');
            el._rewriteLink(a);
            expect(a.getAttribute('href')).toBe(new URL('../../RELEASE_NOTES.md', `${MANUAL_BASE}/`).href);
            expect(a.target).toBe('_blank');
            expect(a.rel).toBe('noopener');
            expect(a.dataset.chapter).toBeUndefined();
        });

        it('leaves in-page anchors and mailto untouched', () => {
            const anchor = mkLink('#roon');
            el._rewriteLink(anchor);
            expect(anchor.getAttribute('href')).toBe('#roon');
            expect(anchor.target).toBe('');

            const mail = mkLink('mailto:x@y.z');
            el._rewriteLink(mail);
            expect(mail.getAttribute('href')).toBe('mailto:x@y.z');
        });

        it('is idempotent — a second pass does not re-rewrite a chapter link', () => {
            const a = mkLink('06-outputs-engines.md');
            el._rewriteLink(a);
            el._rewriteLink(a);
            expect(a.target).toBe(''); // not flipped to _blank on the 2nd pass
            expect(a.getAttribute('href')).toBe(`${MANUAL_BASE}/06-outputs-engines.md`);
        });

        it('absolutises a manual-relative image against the manual base, lazily', () => {
            const img = document.createElement('img');
            img.setAttribute('src', 'images/04-queue.png');
            el._rewriteImage(img);
            expect(img.getAttribute('src')).toBe(`${MANUAL_BASE}/images/04-queue.png`);
            expect(img.getAttribute('loading')).toBe('lazy');
        });

        it('keeps absolute and data: image sources as authored (still lazy)', () => {
            const abs = document.createElement('img');
            abs.setAttribute('src', 'https://example.com/pic.png');
            el._rewriteImage(abs);
            expect(abs.getAttribute('src')).toBe('https://example.com/pic.png');
            expect(abs.getAttribute('loading')).toBe('lazy');

            const data = document.createElement('img');
            data.setAttribute('src', 'data:image/png;base64,AAAA');
            el._rewriteImage(data);
            expect(data.getAttribute('src')).toBe('data:image/png;base64,AAAA');
        });

        it('is idempotent — a second pass leaves an already-absolutised image unchanged', () => {
            const img = document.createElement('img');
            img.setAttribute('src', 'images/04-queue.png');
            el._rewriteImage(img);
            el._rewriteImage(img);
            expect(img.getAttribute('src')).toBe(`${MANUAL_BASE}/images/04-queue.png`);
        });

        it('stamps GitHub-style slug ids (punctuation, duplicate dedup, unicode)', () => {
            const out = el._enhanceHtml(
                '<h2>Audio topology (signal-chain map)</h2><h2>Roon</h2><h2>Roon</h2><h3>Réglages</h3>',
            );
            const tpl = document.createElement('template');
            tpl.innerHTML = out;
            const ids = [...tpl.content.querySelectorAll('h2, h3')].map((h) => h.id);
            expect(ids).toEqual(['audio-topology-signal-chain-map', 'roon', 'roon-1', 'réglages']);
        });

        it('enhances at cache time: cached HTML already has ids, absolute lazy images', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('## Roon\n\n<img src="images/x.png" alt="">'),
            }));
            await el._loadChapter('06-outputs-engines');
            const cached = el._cache.get('06-outputs-engines');
            expect(cached).toContain('id="roon"');
            expect(cached).toContain(`${MANUAL_BASE}/images/x.png`);
            expect(cached).toContain('loading="lazy"');
        });
    });
});
