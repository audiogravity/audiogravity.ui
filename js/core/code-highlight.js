/**
 * @module code-highlight
 * @description Colours the user manual's code blocks — shell and JSON, the only two
 * languages it uses — for the app's manual window.
 *
 * The manual is coloured twice: here, and for the website by
 * `audiogravity.site/scripts/gen_manual_html.py`. The two must agree — same rules, same
 * class names, the same bytes for the same block — so both test suites run the same cases
 * (`code-highlight.test.js` here, `test_gen_manual_html.py` there). Change one, change the
 * other.
 *
 * A line-oriented reading, not a parser: enough for the commands a reader copies. Output
 * is HTML with `<span class="hl-…">` tokens; every character of the input is kept, escaped.
 */
import { escapeHtml } from './escape-html.js';

/** Fence languages coloured as shell. The manual writes `bash`; the others colour the same. */
const SHELL_LANGS = new Set(['bash', 'sh', 'shell']);

/** A word that hands the command position on: in `sudo tee`, both words are commands. */
const SHELL_PREFIXES = new Set(['sudo']);

/**
 * `sudo` options that take the next word as their value: in `sudo -u audiogravity systemctl`
 * the command is `systemctl`, and `audiogravity` is only the account it runs as.
 */
const SUDO_ARG_OPTIONS = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U']);

/** A leading assignment — `LANG=C sort f` — which leaves the command position to the next word. */
const SHELL_ASSIGNMENT = /[A-Za-z_][A-Za-z0-9_]*=/y;

/** What ends a shell word. Quotes and `$` do not: `"a"b` and `x-$(date)` are one word each. */
const SHELL_BREAKS = new Set([' ', '\t', '\n', '|', '&', ';', '(', ')', '<', '>']);

/** A heredoc opener — `<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"` — with its terminator. */
const SHELL_HEREDOC = /<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|([^\s|&;()<>]+))/y;

/** A redirection — `>`, `>>`, `<`, `>&2`, `<&-`. */
const SHELL_REDIRECT = /[<>]+(?:&(?:[0-9]+|-))?/y;

/** A JSON number. */
const JSON_NUMBER = /-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

/**
 * Fence flag for a block the reader must adapt before running it (```` ```bash nocopy ````):
 * no copy button is offered for it.
 */
export const NOCOPY_FLAG = 'nocopy';

/**
 * Match a sticky pattern exactly at `i`.
 * @param {RegExp} re - a pattern with the `y` flag
 * @param {string} code
 * @param {number} i
 * @returns {?RegExpExecArray}
 */
function matchAt(re, code, i) {
    re.lastIndex = i;
    return re.exec(code);
}

/**
 * Wrap a token in its span, or return nothing for an empty token.
 * @param {string} kind - the class suffix (`cmd`, `opt`, …)
 * @param {string} text
 * @returns {string}
 */
function span(kind, text) {
    return text ? `<span class="hl-${kind}">${escapeHtml(text)}</span>` : '';
}

/**
 * Index just past the `$` expansion starting at `i`, or `i + 1` for a lone `$`.
 * `$(…)` is matched with its nesting counted, `${…}` up to its brace, `$NAME` over its
 * identifier, and `$?`-style specials over one character.
 * @param {string} code
 * @param {number} i
 * @returns {number}
 */
function shellExpansionEnd(code, i) {
    const n = code.length;
    const next = code[i + 1] ?? '';
    if (next === '(') {
        let depth = 0;
        for (let j = i + 1; j < n; j++) {
            if (code[j] === '(') depth += 1;
            else if (code[j] === ')') {
                depth -= 1;
                if (depth === 0) return j + 1;
            }
        }
        return n;
    }
    if (next === '{') {
        const close = code.indexOf('}', i + 2);
        return close === -1 ? n : close + 1;
    }
    if (/^[A-Za-z_]$/.test(next)) {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(code[j])) j += 1;
        return j;
    }
    if (next && '0123456789#?@*$!-'.includes(next)) return i + 2;
    return i + 1;
}

/**
 * Index just past the quoted string opening at `i` (to the end if it never closes). A
 * double-quoted string — and a JSON string — escapes with a backslash.
 * @param {string} code
 * @param {number} i
 * @returns {number}
 */
function quoteEnd(code, i) {
    const quote = code[i];
    const n = code.length;
    let j = i + 1;
    while (j < n) {
        if (quote === '"' && code[j] === '\\') {
            j += 2;
            continue;
        }
        if (code[j] === quote) return j + 1;
        j += 1;
    }
    return n;
}

/**
 * Colour a shell block: commands, options, strings, expansions, comments.
 *
 * - The first word of a command — at the start of a line, after `|`, `&`, `;` or `(` — is
 *   a command, and so is the word after `sudo`. A line ending in `\` continues the
 *   command, so the next line starts with an argument.
 * - A word starting with `-` is an option; it does not use up the command position. The
 *   value of a `sudo` option (`-u audiogravity`) does not either, nor does a leading
 *   assignment (`LANG=C`), which is an expansion.
 * - `'…'` and `"…"` are strings, `$…` an expansion, `#` at a word start a comment.
 * - The body of a heredoc (`<<'EOF'` … `EOF`) is a string.
 *
 * @param {string} code - the block's text
 * @returns {string} HTML with token spans
 */
export function highlightShell(code) {
    const out = [];
    const n = code.length;
    let i = 0;
    let atCmd = true;
    let afterSudo = false; // the command position was handed on by sudo, whose options take values
    let skipArg = false; // the next word is the value of such an option
    let heredocs = []; // [terminator, tabsStripped] awaiting the end of the line

    while (i < n) {
        const c = code[i];
        if (c === '\\' && code[i + 1] === '\n') {
            out.push('\\\n'); // continuation: the command goes on, the position is kept
            i += 2;
        } else if (c === '\n') {
            out.push('\n');
            i += 1;
            atCmd = true;
            afterSudo = false;
            skipArg = false;
            for (const [term, stripTabs] of heredocs) {
                while (i < n) {
                    const end = code.indexOf('\n', i);
                    const line = end === -1 ? code.slice(i) : code.slice(i, end);
                    i = end === -1 ? n : end + 1;
                    const tail = end === -1 ? '' : '\n';
                    if ((stripTabs ? line.replace(/^\t+/, '') : line) === term) {
                        out.push(escapeHtml(line) + tail);
                        break;
                    }
                    out.push(span('string', line) + tail);
                }
            }
            heredocs = [];
        } else if (c === ' ' || c === '\t') {
            out.push(c);
            i += 1;
        } else if (c === '#') {
            const nl = code.indexOf('\n', i);
            const end = nl === -1 ? n : nl;
            out.push(span('comment', code.slice(i, end)));
            i = end;
        } else if (code.startsWith('<<', i) && !code.startsWith('<<<', i)) {
            const m = matchAt(SHELL_HEREDOC, code, i);
            if (m) {
                heredocs.push([m[2] ?? m[3] ?? m[4], m[1] === '-']);
                out.push(escapeHtml(m[0]));
                i += m[0].length;
            } else {
                out.push(escapeHtml('<<'));
                i += 2;
            }
            atCmd = false;
        } else if (c === '<' || c === '>') {
            const m = matchAt(SHELL_REDIRECT, code, i);
            out.push(escapeHtml(m[0]));
            i += m[0].length;
            atCmd = false; // what follows a redirection is a file, not a command
        } else if ('|&;()'.includes(c)) {
            out.push(escapeHtml(c));
            i += 1;
            atCmd = c !== ')';
            afterSudo = false;
            skipArg = false;
        } else {
            const start = i;
            let kind = null;
            if (skipArg) kind = null;
            else if (c === '-') kind = 'opt';
            else if (atCmd && matchAt(SHELL_ASSIGNMENT, code, i)) kind = 'var';
            else if (atCmd) kind = 'cmd';
            let literal = '';
            const flush = () => {
                if (literal) out.push(kind ? span(kind, literal) : escapeHtml(literal));
                literal = '';
            };
            while (i < n && !SHELL_BREAKS.has(code[i])) {
                const ch = code[i];
                if (ch === '\\') {
                    if (code[i + 1] === '\n') break; // a continuation ends the word
                    literal += code.slice(i, i + 2);
                    i += 2;
                } else if (ch === "'" || ch === '"') {
                    flush();
                    const end = quoteEnd(code, i);
                    out.push(span('string', code.slice(i, end)));
                    i = end;
                } else if (ch === '$') {
                    const end = shellExpansionEnd(code, i);
                    if (end === i + 1) {
                        literal += ch;
                    } else {
                        flush();
                        out.push(span('var', code.slice(i, end)));
                    }
                    i = end;
                } else {
                    literal += ch;
                    i += 1;
                }
            }
            flush();
            const word = code.slice(start, i);
            if (skipArg) {
                skipArg = false; // the option's value: the command position is still open
            } else if (kind === 'opt') {
                skipArg = afterSudo && SUDO_ARG_OPTIONS.has(word);
            } else if (kind === 'cmd') {
                atCmd = afterSudo = SHELL_PREFIXES.has(word);
            } else if (kind === null) { // an argument; an assignment ('var') leaves the position open
                atCmd = afterSudo = false;
            }
        }
    }
    return out.join('');
}

/**
 * Colour a JSON block: keys, strings, numbers and the literals `true`/`false`/`null`.
 * @param {string} code - the block's text
 * @returns {string} HTML with token spans
 */
export function highlightJson(code) {
    const out = [];
    const n = code.length;
    let i = 0;
    while (i < n) {
        const c = code[i];
        if (c === '"') {
            const end = quoteEnd(code, i);
            let j = end;
            while (j < n && (code[j] === ' ' || code[j] === '\t')) j += 1;
            out.push(span(code[j] === ':' ? 'key' : 'string', code.slice(i, end)));
            i = end;
            continue;
        }
        const m = (c === '-' || (c >= '0' && c <= '9')) ? matchAt(JSON_NUMBER, code, i) : null;
        if (m) {
            out.push(span('num', m[0]));
            i += m[0].length;
            continue;
        }
        const word = ['true', 'false', 'null'].find((w) => code.startsWith(w, i));
        if (word) {
            out.push(span(word === 'null' ? 'null' : 'lit', word));
            i += word.length;
            continue;
        }
        out.push(escapeHtml(c));
        i += 1;
    }
    return out.join('');
}

/**
 * Colour a code block in one of the languages the manual uses.
 * @param {string} code - the block's text
 * @param {string} lang - the fence's language, e.g. `bash`
 * @returns {?string} highlighted HTML, or null for a language left plain
 */
export function highlightCode(code, lang) {
    if (SHELL_LANGS.has(lang)) return highlightShell(code);
    if (lang === 'json') return highlightJson(code);
    return null;
}

/**
 * Render a fenced block for `marked`: coloured when its language is known, and flagged
 * `data-copy="no"` when its info string says `nocopy` — which `marked`'s own renderer
 * drops, as it keeps the first word only. The counterpart of `highlight_fence` on the site.
 * @param {string} text - the block's text, as `marked` hands it (no trailing newline)
 * @param {string} [info] - the fence's info string, e.g. `bash nocopy`
 * @returns {string} the block's HTML
 */
export function renderCodeBlock(text, info = '') {
    const [lang = '', ...flags] = String(info ?? '').trim().split(/\s+/);
    const body = highlightCode(text, lang) ?? escapeHtml(text);
    // A language is a word; anything else in it could close the attribute.
    const safeLang = lang.replace(/[^\w+-]/g, '');
    const cls = safeLang ? ` class="language-${safeLang}"` : '';
    const flag = flags.includes(NOCOPY_FLAG) ? ' data-copy="no"' : '';
    return `<pre${flag}><code${cls}>${body}\n</code></pre>\n`;
}
