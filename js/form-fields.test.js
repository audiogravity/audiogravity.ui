/**
 * Guard: every field the user types into draws alike — one height, one font, one size.
 *
 * Measured in Chromium on 2026-10-11, the app's typed fields came in a dozen looks: 19 to
 * 42px tall, text at 11 or 12px, Inter or monospace, padding from 0 to 14px. The user and
 * systemd windows had no style at all (the browser's own field, 19 to 20px). Every typed
 * field is now a .form-control (css/components/forms.css): Inter at --font-size-sm,
 * --spacing-sm padding, a 1px border, --radius-sm corners — 29px tall. A component's own
 * class on the field only lays it out. Lists, checkboxes, code editors and the sign-in
 * page are out of scope (user's choice, 2026-10-11).
 *
 * Covers:
 * 1. every typed field carries .form-control, unless it sits in a wrapper whose stylesheet
 *    draws it the same way (.config-field; .form-group on the sign-in page), or it is one
 *    of the named exceptions (the library search's borderless input, the code editors)
 * 2. a class that sits beside .form-control on a field sets no size, font, padding,
 *    border or fill of its own — one named exception, the web password shown in clear
 * 3. no rule reaching a field through its container (`.x input`, which outweighs
 *    .form-control) sets its look, save the named ones
 * 4. the look drawn outside .form-control — .config-field, the library search bar — uses
 *    .form-control's own padding, border, corners and text size
 * 5. every list or field in a .form-field carries .form-control
 * 6. the scan reads what the app writes, and reads it right
 *
 * Read from the sources: jsdom lays nothing out, so the look itself was measured in
 * Chromium, not here. The wrappers are read from the divs opened and not yet closed
 * before a field; a div opened in one template and closed in another would mislead it,
 * and a field built by a helper of its own is seen outside the div it ends up in. That
 * is why the one exception among lists — the HIGHRESAUDIO search filters' three, in the
 * fields' row — is held by ag-hra-search-filters.test.js, which renders the form.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSources, classesOf, cssRules, filesUnder, openingTags, readStylesheet } from './test-utils.js';

/** Input types that take no typing and keep the browser's control. */
const NOT_TEXT = /\btype=(["'])(checkbox|radio|range|hidden|file|color|button|submit|reset|image)\1/;

/** A class given as an attribute, by an expression or by a property. */
const HAS_CLASS = /\s(class|\.className|className)=/;

/** Wrappers whose stylesheet draws every field in them as .form-control draws it. */
const DRAWING_WRAPPERS = ['config-field', 'form-group'];

/** Typed fields that do not carry .form-control, and why. */
const NOT_FORM_CONTROL = {
    // Borderless inside .lib-search-bar, which carries the field's box (checked below).
    'lib-search-input': 'the library search bar draws the box',
    // CodeMirror replaces it: a code editor, not a field.
    'config-editor': 'code editor',
};

/** Classes that may change a .form-control's look, and why. */
const LOOK_EXCEPTIONS = {
    // A password shown in clear, to be noted down: read character by character, so
    // monospace (UI guidelines rule 3) — its size and box stay .form-control's.
    'ag-pid-password': ['font-family'],
};

/** Declarations that make a field's look: what a layout class must leave to .form-control. */
const LOOK = /^(font|font-size|font-family|font-weight|line-height|padding(-[a-z-]+)?|border(-[a-z-]+)?|height|min-height|block-size|background(-color)?)$/;

/**
 * The text fields and lists of a source, each with its classes (null when it has none)
 * and the classes of the divs it sits in.
 *
 * @param {string} text - A component's source, or an HTML page.
 * @returns {{tag: string, name: string, classes: ?string[], wrappers: string[]}[]}
 */
function textFields(text) {
    const events = [];
    let at = 0;
    for (const tag of openingTags(text)) {
        const index = text.indexOf(tag, at);
        at = index + 1;
        events.push({ index, tag });
    }
    for (const close of text.matchAll(/<\/div\s*>/g)) events.push({ index: close.index });
    events.sort((a, b) => a.index - b.index);

    const open = [];
    const fields = [];
    for (const { tag } of events) {
        if (!tag) { open.pop(); continue; }
        if (/^<div\b/.test(tag)) { open.push(classesOf(tag)); continue; }
        const name = tag.match(/^<(input|select|textarea)\b/)?.[1];
        if (!name || NOT_TEXT.test(tag)) continue;
        fields.push({
            tag: tag.replace(/\s+/g, ' ').slice(0, 70),
            name,
            classes: HAS_CLASS.test(tag) ? classesOf(tag) : null,
            wrappers: open.flat(),
        });
    }
    return fields;
}

/** The declarations of a rule body, as [property, value] pairs. */
const declarations = (body) => body.split(';').map((d) => d.split(':')).filter(([p, v]) => p?.trim() && v !== undefined)
    .map(([p, ...v]) => [p.trim(), v.join(':').trim()]);

/**
 * The last compound of a selector: the element the rule styles. Split on the combinators
 * outside any brackets or quotes, so `:nth-child(2n+1)`, `:not(.a .b)` and `[class~="x"]`
 * stay whole.
 *
 * @param {string} selector - One selector, as selectorList returns it.
 * @returns {string}
 */
function lastCompound(selector) {
    let depth = 0;
    let from = 0;
    for (let i = 0; i < selector.length; i++) {
        const c = selector[i];
        if (c === '"' || c === '\'') {
            i++;
            while (i < selector.length && selector[i] !== c) i += selector[i] === '\\' ? 2 : 1;
        } else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (!depth && /[\s>+~]/.test(c)) from = i + 1;
    }
    return selector.slice(from);
}

/**
 * Rules that reach a typed field through its container and set part of its look, each
 * with why it may: such a rule (0,1,1) outweighs .form-control (0,1,0).
 */
const CONTAINER_RULES = [
    [/^\.config-field /, 'draws the field as .form-control does (checked below)'],
    [/^\.form-group /, 'the sign-in page, which keeps its own look'],
    [/^\.switch /, 'the checkbox under a toggle switch, not a typed field'],
    [/^\.config-item /, 'sets Inter, the font .form-control sets'],
    [/^(input|textarea):focus-visible$/, 'the focus ring\'s corners, --radius-sm like .form-control'],
];

const FIELDS = [...appSources(), ...filesUnder('public', /\.html$/)].flatMap((file) =>
    textFields(readFileSync(file, 'utf8')).map((field) => ({ file, ...field })));
const TYPED = FIELDS.filter((f) => f.name !== 'select');
const SHEETS = filesUnder('css', /\.css$/).map((file) => ({ file, rules: cssRules(readFileSync(file, 'utf8')) }));
const FORM_CONTROL = Object.fromEntries(declarations(
    cssRules(readStylesheet('css', 'components', 'forms.css')).find((r) => r.selectors.includes('.form-control')).body));

describe('typed fields', () => {
    it('carry .form-control, or sit in a wrapper that draws them alike', () => {
        const odd = TYPED.filter((f) => !f.classes?.includes('form-control')
            && !f.wrappers.some((cls) => DRAWING_WRAPPERS.includes(cls))
            && !f.classes?.some((cls) => cls in NOT_FORM_CONTROL));
        expect(odd).toEqual([]);
    });

    it('take no size, font, padding, border or fill from the class beside .form-control', () => {
        const controls = FIELDS.filter((f) => f.classes?.includes('form-control')).map((f) => new Set(f.classes));
        const drift = [];
        const besides = new Set();
        for (const { file, rules } of SHEETS) {
            for (const { selectors, body } of rules) {
                for (const compound of selectors.map(lastCompound)) {
                    if (compound.includes('::')) continue;
                    // The classes the rule requires of the element itself, outside :not() and the like.
                    const own = [...compound.replace(/\([^)]*\)/g, '').matchAll(/\.([\w-]+)/g)].map((m) => m[1])
                        .filter((cls) => !cls.startsWith('form-control'));
                    if (!own.length || !controls.some((set) => own.every((cls) => set.has(cls)))) continue;
                    own.forEach((cls) => besides.add(cls));
                    for (const [prop] of declarations(body)) {
                        if (LOOK.test(prop) && !own.some((cls) => LOOK_EXCEPTIONS[cls]?.includes(prop))) {
                            drift.push(`${file}: ${compound} { ${prop} }`);
                        }
                    }
                }
            }
        }
        // Proves the check reads the layout classes: without it, finding none would pass.
        expect([...besides].sort()).toEqual(expect.arrayContaining(['ag-prov-input', 'config-input', 'lib-inline-input', 'passkey-name-input']));
        expect(drift).toEqual([]);
    });

    it('drawn outside .form-control, use its padding, border, corners and text size', () => {
        const ruleOf = (sheet, selector) => Object.fromEntries(declarations(
            cssRules(readStylesheet(...sheet)).find((r) => r.selectors.includes(selector)).body));
        const same = ['padding', 'border', 'border-radius', 'font-size'];
        const pick = (decls, props) => Object.fromEntries(props.map((p) => [p, decls[p]]));
        expect(pick(ruleOf(['css', 'config.css'], '.config-field input'), same)).toEqual(pick(FORM_CONTROL, same));
        const bar = ['padding', 'border', 'border-radius'];
        expect(pick(ruleOf(['css', 'components', 'library-search.css'], '.lib-search-bar'), bar)).toEqual(pick(FORM_CONTROL, bar));
        expect(ruleOf(['css', 'components', 'library-search.css'], '.lib-search-input')['font-size']).toBe(FORM_CONTROL['font-size']);
    });

    it('are not restyled by a rule that reaches them through their container', () => {
        const reached = [];
        for (const { file, rules } of SHEETS) {
            for (const { selectors, body } of rules) {
                for (const selector of selectors) {
                    const last = lastCompound(selector);
                    if (!/^(input|textarea)(?![\w-])/.test(last) || last.includes('::')) continue;
                    if (/type=["']?(checkbox|radio|range)/.test(last)) continue;
                    // A bare element rule (input, textarea) weighs less than .form-control.
                    if (!/[.:#[]/.test(selector)) continue;
                    const look = declarations(body).map(([prop]) => prop).filter((prop) => LOOK.test(prop));
                    if (look.length) reached.push({ rule: `${file}: ${selector} { ${look.join(', ')} }`, selector });
                }
            }
        }
        // Proves the check reads those rules: the .config-field one is known to be there.
        expect(reached.map((r) => r.selector)).toContain('.config-field input');
        expect(reached.filter((r) => !CONTAINER_RULES.some(([re]) => re.test(r.selector))).map((r) => r.rule)).toEqual([]);
    });

    it('find their drawing wrappers loaded throughout the app', () => {
        const main = readStylesheet('css', 'main.css');
        for (const [sheet, selector] of [['config.css', '.config-field input'], ['login.css', '.form-group input']]) {
            expect(main, sheet).toContain(`@import '${sheet}';`);
            expect(cssRules(readStylesheet('css', sheet)).flatMap((r) => r.selectors), sheet).toContain(selector);
        }
    });
});

describe('fields of a .form-field', () => {
    it('carry .form-control, lists included', () => {
        const plain = FIELDS.filter((f) => f.wrappers.includes('form-field') && !f.classes?.includes('form-control'));
        expect(plain).toEqual([]);
    });
});

describe('the scan', () => {
    it('reads the fields where the app writes them', () => {
        // Proves the scan reads the sources: without it, an empty list would pass the tests above.
        const count = (file, test) => FIELDS.filter((f) => f.file.endsWith(file) && test(f)).length;
        const control = (f) => f.classes?.includes('form-control');
        expect(count('ag-user-modal.js', (f) => f.wrappers.includes('form-field'))).toBe(4);
        expect(count('ag-systemd-override-editor.js', (f) => f.wrappers.includes('form-field'))).toBe(15);
        expect(count('ag-library-radio.js', control)).toBe(5);
        expect(count('ag-network-mount-form.js', control)).toBe(5);
        expect(count('ag-network-test.js', control)).toBe(6);
        expect(count('ag-latency-test.js', (f) => f.classes === null && f.wrappers.includes('config-field'))).toBe(6);
        expect(count('login.html', (f) => f.classes === null && f.wrappers.includes('form-group'))).toBe(2);
    });

    it('sees a wrapper through a nested div, and not after it closes', () => {
        const [inside, after] = textFields('<div class="form-field"><div class="row"><input type="text"></div></div><input>');
        expect(inside.wrappers).toEqual(['form-field', 'row']);
        expect(after.wrappers).toEqual([]);
    });

    it('reads a type and a class in either quote', () => {
        const fields = textFields(`<input type='checkbox'><input type="radio"><input class='form-control'><select class="a b"></select>`);
        expect(fields.map((f) => f.classes)).toEqual([['form-control'], ['a', 'b']]);
    });

    it('counts a class set by an expression or a property as a class', () => {
        const fields = textFields('<input class=${classMap({ a: true })}><textarea .className=${x}></textarea><input type="text">');
        expect(fields.map((f) => f.classes)).toEqual([[], [], null]);
    });

    it('reads the element a rule styles, not its ancestors', () => {
        expect(lastCompound('.lib-hqp-discover > .lib-inline-row .lib-inline-input:focus')).toBe('.lib-inline-input:focus');
        expect(lastCompound('.x :is(.a, .b) .lib-inline-input')).toBe('.lib-inline-input');
        expect(lastCompound('.lib-inline-input:not(.a .b)')).toBe('.lib-inline-input:not(.a .b)');
        expect(lastCompound('.row .lib-inline-input:nth-child(2n+1)')).toBe('.lib-inline-input:nth-child(2n+1)');
        expect(lastCompound('.row ~ input[class~="x y"]')).toBe('input[class~="x y"]');
    });
});
