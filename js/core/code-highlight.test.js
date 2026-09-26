/**
 * Tests for the manual's code colouring.
 *
 * The manual is coloured twice — here for the app, and by the site's generator
 * (audiogravity.site/scripts/gen_manual_html.py) for the website — and the two must agree.
 * The cases below are the site's, character for character; the last suite goes further and
 * checks this colourer against the site's own pages, block by block, when that checkout is
 * present next to this one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { highlightCode, renderCodeBlock, NOCOPY_FLAG } from './code-highlight.js';

// Same cases as SHELL_CASES / JSON_CASES in test_gen_manual_html.py — keep them in step.
const SHELL_CASES = [
    ['curl -fsSL https://x/install.sh | sudo bash',
        '<span class="hl-cmd">curl</span> <span class="hl-opt">-fsSL</span> https://x/install.sh | '
        + '<span class="hl-cmd">sudo</span> <span class="hl-cmd">bash</span>'],
    ["cat /proc/cmdline   # 'memory' missing",
        '<span class="hl-cmd">cat</span> /proc/cmdline   <span class="hl-comment"># \'memory\' missing</span>'],
    ['sudo cp a b.bak-$(date +%F)',
        '<span class="hl-cmd">sudo</span> <span class="hl-cmd">cp</span> a b.bak-<span class="hl-var">$(date +%F)</span>'],
    ["sed -i '1 s/$/ x/' f",
        '<span class="hl-cmd">sed</span> <span class="hl-opt">-i</span> <span class="hl-string">\'1 s/$/ x/\'</span> f'],
    ['echo "a \\"b\\"" \\\n    | sudo tee -a /etc/fstab',
        '<span class="hl-cmd">echo</span> <span class="hl-string">"a \\"b\\""</span> \\\n    | '
        + '<span class="hl-cmd">sudo</span> <span class="hl-cmd">tee</span> <span class="hl-opt">-a</span> /etc/fstab'],
    ['bash -s -- \\\n    --email you@example.com',
        '<span class="hl-cmd">bash</span> <span class="hl-opt">-s</span> <span class="hl-opt">--</span> \\\n'
        + '    <span class="hl-opt">--email</span> you@example.com'],
    ["tee f >/dev/null <<'EOF'\nuser=a\nEOF\nls",
        '<span class="hl-cmd">tee</span> f &gt;/dev/null &lt;&lt;\'EOF\'\n<span class="hl-string">user=a</span>\n'
        + 'EOF\n<span class="hl-cmd">ls</span>'],
    ['a 2>&1 && b',
        '<span class="hl-cmd">a</span> 2&gt;&amp;1 &amp;&amp; <span class="hl-cmd">b</span>'],
    ['x#y $HOME ${A} $? $',
        '<span class="hl-cmd">x#y</span> <span class="hl-var">$HOME</span> <span class="hl-var">${A}</span> '
        + '<span class="hl-var">$?</span> $'],
    ["printf '<b>' & ls",
        '<span class="hl-cmd">printf</span> <span class="hl-string">\'&lt;b&gt;\'</span> &amp; '
        + '<span class="hl-cmd">ls</span>'],
    ['# note\nsudo -E tee x',
        '<span class="hl-comment"># note</span>\n<span class="hl-cmd">sudo</span> <span class="hl-opt">-E</span> '
        + '<span class="hl-cmd">tee</span> x'],
    ['echo a\u00a0b',
        '<span class="hl-cmd">echo</span> a&nbsp;b'],
    ['sudo -u audiogravity systemctl status x',
        '<span class="hl-cmd">sudo</span> <span class="hl-opt">-u</span> audiogravity '
        + '<span class="hl-cmd">systemctl</span> status x'],
    ['LANG=C sort f',
        '<span class="hl-var">LANG=C</span> <span class="hl-cmd">sort</span> f'],
    ['echo sudo tee',
        '<span class="hl-cmd">echo</span> sudo tee'],
];

const JSON_CASES = [
    ['{"a": "b", "n": -1.5e3, "t": true, "z": null}',
        '{<span class="hl-key">"a"</span>: <span class="hl-string">"b"</span>, <span class="hl-key">"n"</span>: '
        + '<span class="hl-num">-1.5e3</span>, <span class="hl-key">"t"</span>: <span class="hl-lit">true</span>, '
        + '<span class="hl-key">"z"</span>: <span class="hl-null">null</span>}'],
    ['{"k" : "a\\"<b>", "l": [1, false]}',
        '{<span class="hl-key">"k"</span> : <span class="hl-string">"a\\"&lt;b&gt;"</span>, '
        + '<span class="hl-key">"l"</span>: [<span class="hl-num">1</span>, <span class="hl-lit">false</span>]}'],
];

/**
 * The text a browser shows for a piece of HTML — what a reader sees and what a copy takes.
 * @param {string} markup
 * @returns {string}
 */
const shown = (markup) => {
    const div = document.createElement('div');
    div.innerHTML = markup;
    return div.textContent;
};

describe('highlightCode', () => {
    it.each(SHELL_CASES)('shell: %j', (code, expected) => {
        expect(highlightCode(code, 'bash')).toBe(expected);
    });

    it.each(JSON_CASES)('json: %j', (code, expected) => {
        expect(highlightCode(code, 'json')).toBe(expected);
    });

    it.each(['sh', 'shell'])('colours %s as bash', (lang) => {
        const [code, expected] = SHELL_CASES[0];
        expect(highlightCode(code, lang)).toBe(expected);
    });

    it.each(['', 'text', 'ini', 'python'])('leaves %j alone', (lang) => {
        expect(highlightCode('x = 1', lang)).toBeNull();
    });

    it('keeps every character: what the block shows is exactly what was written', () => {
        // A colourer that drops or doubles a character hands the reader a command that is
        // not the one written — the worst thing a copy button can do.
        for (const [code] of SHELL_CASES) expect(shown(highlightCode(code, 'bash'))).toBe(code);
        for (const [code] of JSON_CASES) expect(shown(highlightCode(code, 'json'))).toBe(code);
    });
});

describe('renderCodeBlock', () => {
    it('colours a known language and closes the block as marked does', () => {
        expect(renderCodeBlock('ls', 'bash')).toBe(
            '<pre><code class="language-bash"><span class="hl-cmd">ls</span>\n</code></pre>\n');
    });

    it(`flags a ${NOCOPY_FLAG} block whatever its language`, () => {
        expect(renderCodeBlock('a <b>', `text ${NOCOPY_FLAG}`)).toBe(
            '<pre data-copy="no"><code class="language-text">a &lt;b&gt;\n</code></pre>\n');
        expect(renderCodeBlock('ls', `bash ${NOCOPY_FLAG}`)).toContain('<pre data-copy="no">');
    });

    it('renders an untagged block plainly', () => {
        expect(renderCodeBlock('x', '')).toBe('<pre><code>x\n</code></pre>\n');
        expect(renderCodeBlock('x', undefined)).toBe('<pre><code>x\n</code></pre>\n');
    });

    it('keeps a language that is not a word out of the attribute', () => {
        // The first word is the language — `a"><img` — and only its word characters survive.
        expect(renderCodeBlock('x', 'a"><img src=x onerror=1>')).toBe(
            '<pre><code class="language-aimg">x\n</code></pre>\n');
    });
});

// The site's checkout, next to this one: its generated pages carry the Python colourer's
// output, so the two can be compared on the real manual rather than on chosen cases.
const SITE_MANUAL = path.join(path.dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'audiogravity.site', 'docs', 'manual');

describe.skipIf(!fs.existsSync(SITE_MANUAL))('parity with the site, on the real manual', () => {
    it('colours every block exactly as the site pages do', () => {
        let checked = 0;
        for (const name of fs.readdirSync(SITE_MANUAL).filter((f) => /^\d{2}-.*\.md$/.test(f))) {
            const page = path.join(SITE_MANUAL, name.replace(/\.md$/, '.html'));
            if (!fs.existsSync(page)) continue;
            // A fence may sit up to three spaces in, inside a list item; its lines then lose
            // that much indentation, as they do in the renderer.
            const blocks = [...fs.readFileSync(path.join(SITE_MANUAL, name), 'utf8')
                .matchAll(/^( {0,3})```(\w*)[^\n]*\n([\s\S]*?)^ {0,3}```/gm)]
                .map(([, indent, lang, body]) => [lang,
                    body.replace(new RegExp(`^ {0,${indent.length}}`, 'gm'), '')]);
            const rendered = [...fs.readFileSync(page, 'utf8')
                .matchAll(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)].map((m) => m[1]);
            expect(rendered.length, `${name}: blocks in the Markdown vs the page`).toBe(blocks.length);
            blocks.forEach(([lang, text], k) => {
                const ours = highlightCode(text, lang);
                if (ours === null) return;
                expect(ours, `${name}, block ${k + 1}`).toBe(rendered[k]);
                checked += 1;
            });
        }
        // 29 on 2026-09-26: 24 at column 0 and 5 inside list items.
        expect(checked, 'the manual\'s coloured blocks were not found').toBeGreaterThanOrEqual(29);
    });
});
