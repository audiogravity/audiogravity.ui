/**
 * Guard: the interface shows no tooltips.
 *
 * They were removed on purpose, every one (decided with the user on 2026-09-28): what
 * a button does is its label, or an aria-label for an icon alone, and what the user
 * needs to read is on the screen. A `title` attribute brings one back — on any
 * element, our own components included: a component with a `title` property read
 * it from the attribute of that name, and the browser showed it over the whole
 * component. They read `heading` now.
 *
 * Covers:
 * 1. no tag in the app sets a title attribute (a `.title=` property binding is fine)
 * 2. no script sets one
 * 3. the check tells an attribute from a property binding
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSources, openingTags } from './test-utils.js';

/** A title attribute: not `.title=` (a property), not part of a longer name. */
const TITLE_ATTRIBUTE = /(?<![.\w-])title=/;
/** Elements whose title is their accessible name, and no tooltip. */
const NAMED_BY_TITLE = /^<iframe\b/;

const files = appSources().map((file) => [file, readFileSync(file, 'utf8')]);

describe('no tooltip in the interface', () => {
    it('no tag sets a title attribute', () => {
        const found = files.flatMap(([file, text]) => openingTags(text)
            .filter((tag) => TITLE_ATTRIBUTE.test(tag) && !NAMED_BY_TITLE.test(tag))
            .map((tag) => `${file}: ${tag.split('\n')[0]}`));
        expect(found).toEqual([]);
    });

    it('no script sets one', () => {
        const found = files.filter(([, text]) => /setAttribute\(\s*['"]title['"]/.test(text)).map(([file]) => file);
        expect(found).toEqual([]);
    });
});

describe('the check', () => {
    it('tells an attribute from a property binding', () => {
        expect(TITLE_ATTRIBUTE.test('<ag-modal title="X">')).toBe(true);
        expect(TITLE_ATTRIBUTE.test('<ag-modal .title=${x}>')).toBe(false);
        expect(TITLE_ATTRIBUTE.test('<span data-title="x">')).toBe(false);
        expect(TITLE_ATTRIBUTE.test('<ag-modal heading="X">')).toBe(false);
    });
});
