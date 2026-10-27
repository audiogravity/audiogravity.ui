/**
 * Guards the private members a script uses: each one it calls — `this._x(…)`,
 * `this._x.bind(…)` — or hands to an event binding — `@click=${this._x}` — is defined in
 * that script, or in the class it extends from a module of the app.
 *
 * A method taken away while something still calls it fails only once that is reached. The
 * X that removes a Face ID / Touch ID key in Settings threw a TypeError for as long as
 * nobody pressed it: its method was removed as unused, on a search cut short (caught by
 * the code review of the toasts, 2026-10-27). A binding to a missing method fails without
 * a word — Lit drops a listener that is undefined.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appSources, withoutComments } from './test-utils.js';

/** How a script uses a private member, the name in the first group. */
const USED = [
    /\bthis\._(\w+)\s*\(/g,                     // this._x(…)
    /\bthis\._(\w+)\.(?:bind|call|apply)\(/g,   // this._x.bind(this)
    /@[\w.-]+=\$\{\s*this\._(\w+)\s*\}/g,       // @click=${this._x}
];

/**
 * How a script defines one. A line's own spaces only, `[ \t]`: `\s` runs on through the
 * line breaks of a blanked comment and back, which made the walk take seconds.
 */
const DEFINED = [
    /^[ \t]*(?:static[ \t]+)?(?:async[ \t]+)?(?:[gs]et[ \t]+)?\*?[ \t]*_(\w+)[ \t]*\(/gm,  // _x(…) { — a method
    /^[ \t]*(?:static[ \t]+)?_(\w+)[ \t]*=(?!=)/gm,                                     // _x = … — a field
    /\bthis\._(\w+)\s*(?:\?\?)?=(?!=)/g,                                                // this._x = …, ??=
];

/**
 * The names a text holds, by the given patterns.
 * @param {string} text
 * @param {RegExp[]} patterns
 * @returns {Set<string>}
 */
const names = (text, patterns) => new Set(patterns.flatMap((re) => [...text.matchAll(re)].map((m) => m[1])));

/**
 * The private members a script defines, with those of the classes it extends from the
 * app's own modules, followed through their imports.
 * @param {string} file - Path relative to the repository root.
 * @param {(file: string) => string} read - The code of a file, comments blanked.
 * @param {Set<string>} [seen]
 * @returns {Set<string>}
 */
function definedIn(file, read, seen = new Set()) {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const code = read(file);
    const defined = names(code, DEFINED);
    for (const [, base] of code.matchAll(/class\s+\w+\s+extends\s+(\w+)/g)) {
        const from = code.match(new RegExp(`import\\s*\\{[^}]*\\b${base}\\b[^}]*\\}\\s*from\\s*['"](\\.[^'"]+)['"]`));
        if (from) for (const name of definedIn(path.join(path.dirname(file), from[1]), read, seen)) defined.add(name);
    }
    return defined;
}

/**
 * Every private member a script uses and nothing defines, as "file: _name".
 * @param {string[]} files
 * @param {(file: string) => string} read
 * @returns {string[]}
 */
function undefinedMembers(files, read) {
    return files.flatMap((file) => {
        const defined = definedIn(file, read);
        return [...names(read(file), USED)].filter((name) => !defined.has(name)).map((name) => `${file}: _${name}`);
    });
}

describe('private members — each one a script uses is defined', () => {
    it('in every script of the app', () => {
        const scripts = appSources().filter((f) => f.endsWith('.js'));
        // 215 scripts when this guard was written; far fewer would mean the walk stopped.
        expect(scripts.length).toBeGreaterThan(150);
        // Read once each: a base class is read again for every class that extends it.
        const code = new Map();
        const read = (file) => {
            if (!code.has(file)) code.set(file, withoutComments(readFileSync(file, 'utf8')));
            return code.get(file);
        };
        expect(undefinedMembers(scripts, read)).toEqual([]);
    });

    it('reads a call, a bound method and a listener whose method is missing — and nothing in a comment', () => {
        const sources = {
            'js/a.js': `class A extends LitElement {
                _kept() {}
                render() { return html\`<button @click=\${this._gone}></button>\`; }
                connectedCallback() { this._kept(); this._removed(); this._h = this._unbound.bind(this); }
                /** Example: this._inProse() */
            }`,
        };
        expect(undefinedMembers(Object.keys(sources), (f) => withoutComments(sources[f])))
            .toEqual(['js/a.js: _removed', 'js/a.js: _unbound', 'js/a.js: _gone']);
    });

    it('counts what a class inherits from a module of the app, and its fields', () => {
        const sources = {
            'js/components/base.js': `export class Base extends LitElement {
                _shared() {}
            }`,
            'js/components/child.js': `import { Base } from './base.js';
                class Child extends Base {
                    _onKey = () => {};
                    constructor() { super(); this._timer = null; }
                    run() { this._shared(); this._onKey(); this._timer?.(); }
                }`,
        };
        expect(undefinedMembers(['js/components/child.js'], (f) => withoutComments(sources[f]))).toEqual([]);
    });
});
