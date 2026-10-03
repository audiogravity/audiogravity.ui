/**
 * Unit tests for ag-config-editor.js.
 *
 * Covers:
 * - disconnectedCallback destroys the CodeMirror instance to prevent memory leaks
 *   (regression for the missing lifecycle cleanup fixed in this review)
 * - disconnectedCallback is safe when CodeMirror has not been initialised yet
 * - CodeMirror is loaded on demand: built once loaded, never for a view already left,
 *   once when two calls overlap — and a failed load refuses the save it would spoil
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The guided child pulls the API/toast stack (auth-gated at load); this suite only
// exercises the editor's own mode logic, so stub it out.
vi.mock('./ag-guided-config.js', () => ({}));

// CodeMirror is loaded on demand through this seam. By default it hands out a stand-in
// that records what it is asked to build; a test can make the load fail, or hold it.
const cm = vi.hoisted(() => ({
    fromTextArea: vi.fn(() => ({
        setSize: vi.fn(), on: vi.fn(), getValue: vi.fn(() => ''), setValue: vi.fn(),
        getWrapperElement: () => document.createElement('div'), toTextArea: vi.fn(),
    })),
}));
vi.mock('../../core/load-codemirror.js', () => ({ loadCodeMirror: vi.fn(async () => cm) }));

import { loadCodeMirror } from '../../core/load-codemirror.js';
import { AgConfigEditor } from './ag-config-editor.js';

// ag-config-editor uses light DOM (createRenderRoot returns this),
// so standard LitElement rendering works in jsdom.

describe('AgConfigEditor.disconnectedCallback — CodeMirror cleanup', () => {
    let el;

    beforeEach(() => {
        el = new AgConfigEditor();
        // Simulate a mounted CodeMirror instance
        el._cmInstance = null;
    });

    it('calls toTextArea() on the CodeMirror instance and nulls the reference', () => {
        const toTextArea = vi.fn();
        el._cmInstance = { toTextArea };

        el.disconnectedCallback();

        expect(toTextArea).toHaveBeenCalledOnce();
        expect(el._cmInstance).toBeNull();
    });

    it('does not throw when _cmInstance is null (never initialised)', () => {
        el._cmInstance = null;
        expect(() => el.disconnectedCallback()).not.toThrow();
    });

    it('does not call toTextArea after a second disconnectedCallback', () => {
        const toTextArea = vi.fn();
        el._cmInstance = { toTextArea };

        el.disconnectedCallback(); // first: destroys
        el.disconnectedCallback(); // second: already null, must not throw or call again

        expect(toTextArea).toHaveBeenCalledOnce();
    });
});

describe('AgConfigEditor — guided/structured/expert mode switching', () => {
    function makeEl(overrides = {}) {
        const el = new AgConfigEditor();
        Object.assign(el, overrides);
        return el;
    }

    it('_applyMode sets the mode and reverts unsaved changes', () => {
        const el = makeEl({ currentMode: 'form', isDirty: true, formData: { a: 1 }, _originalFormData: { a: 0 } });
        el._applyMode('guided');
        expect(el.currentMode).toBe('guided');
        expect(el.isDirty).toBe(false);
        expect(el.formData).toEqual({ a: 0 });
    });

    it('_setMode is a no-op when already in that mode', () => {
        const el = makeEl({ currentMode: 'guided' });
        const spy = vi.spyOn(el, '_applyMode');
        el._setMode('guided');
        expect(spy).not.toHaveBeenCalled();
    });

    it('_setMode applies directly when not dirty', () => {
        const el = makeEl({ currentMode: 'guided', isDirty: false });
        el._setMode('raw');
        expect(el.currentMode).toBe('raw');
    });

    it('_setMode confirms before applying when there are unsaved changes', async () => {
        window.showConfirm = vi.fn().mockResolvedValue(true);
        const el = makeEl({ currentMode: 'form', isDirty: true });
        el._setMode('raw');
        await Promise.resolve();
        await Promise.resolve();
        expect(window.showConfirm).toHaveBeenCalled();
        expect(el.currentMode).toBe('raw');
    });

    // The map holds the PREVIOUS value of each changed property, so a first render
    // carries `undefined` and a later one carries the service shown until now.
    it('willUpdate opens a provisionable service in guided mode', () => {
        const el = makeEl({ guided: true, currentMode: 'form', service: { id: 'mpd' } });
        el.willUpdate(new Map([['service', undefined]]));
        expect(el.currentMode).toBe('guided');
    });

    it('willUpdate opens a non-provisionable service in form mode', () => {
        const el = makeEl({
            guided: false, currentMode: 'guided', service: { id: 'mpd' },
            schema: { music_directory: { type: 'string' } },
        });
        el.willUpdate(new Map([['service', undefined]]));
        expect(el.currentMode).toBe('form');
    });

    it('willUpdate opens a service with no form in the raw editor', () => {
        const el = makeEl({ guided: false, currentMode: 'guided', service: { id: 'hqplayerd' }, schema: {} });
        el.willUpdate(new Map([['service', undefined]]));
        expect(el.currentMode).toBe('raw');
    });

    it('switching to another service returns to the default view', () => {
        const el = makeEl({ guided: true, currentMode: 'raw', service: { id: 'upmpdcli' } });
        el.willUpdate(new Map([['service', { id: 'mpd' }]]));
        expect(el.currentMode).toBe('guided');
    });

    // The bug: the page rebuilds a service entry as a NEW object on every
    // service-metrics push (up to once a second, to move the tile's status badge).
    // Judged on the property rather than on the id, that was indistinguishable from
    // opening another service — so Structured and Expert snapped back to Guided
    // within a second of being chosen, every time.
    it('a status refresh of the same service leaves the chosen view alone', () => {
        const el = makeEl({
            guided: true, currentMode: 'raw', service: { id: 'mpd', status: 'active' },
        });
        el.willUpdate(new Map([['service', { id: 'mpd', status: 'inactive' }]]));
        expect(el.currentMode).toBe('raw');
    });

    it('a status refresh does not disturb the structured view either', () => {
        const el = makeEl({
            guided: true, currentMode: 'form', service: { id: 'mpd', status: 'active' },
        });
        el.willUpdate(new Map([['service', { id: 'mpd', status: 'inactive' }]]));
        expect(el.currentMode).toBe('form');
    });

    it('repeated status refreshes never accumulate into a reset', () => {
        const el = makeEl({
            guided: true, currentMode: 'raw', service: { id: 'mpd', status: 'active' },
        });
        for (let i = 0; i < 10; i++) {
            el.service = { id: 'mpd', status: i % 2 ? 'active' : 'inactive' };
            el.willUpdate(new Map([['service', { id: 'mpd' }]]));
        }
        expect(el.currentMode).toBe('raw');
    });
});

describe('AgConfigEditor — originals capture on parent reload (guided-apply safety)', () => {
    it('re-captures originals when the parent reloads the config (both props change)', () => {
        const el = new AgConfigEditor();
        el.formData = { a: 1 }; el.rawContent = 'old';
        el.willUpdate(new Map([['formData', {}], ['rawContent', '']]));   // initial load
        expect(el._originalRawContent).toBe('old');
        // Parent reloads a fresh config (both change together, e.g. after a guided apply).
        el.formData = { a: 2 }; el.rawContent = 'new';
        el.willUpdate(new Map([['formData', { a: 1 }], ['rawContent', 'old']]));
        expect(el._originalFormData).toEqual({ a: 2 });
        expect(el._originalRawContent).toBe('new');
        expect(el.isDirty).toBe(false);
    });

    it('does not re-capture originals on a single-mode edit (only one prop changes)', () => {
        const el = new AgConfigEditor();
        el.formData = { a: 1 }; el.rawContent = 'x';
        el.willUpdate(new Map([['formData', {}], ['rawContent', '']]));   // load
        el.formData = { a: 2 };   // user edits the form
        el.willUpdate(new Map([['formData', { a: 1 }]]));   // only formData changed
        expect(el._originalFormData).toEqual({ a: 1 });   // baseline preserved
    });
});

describe('AgConfigEditor — a service with no form (HQPlayer Embedded)', () => {
    // Its file is edited in place, never rewritten from a form: the core declares
    // no field for it and refuses a structured save. A Structured view would show
    // an empty page whose Save can only fail.
    const HQPLAYER = { id: 'hqplayerd', displayName: 'HQPlayer Embedded', path: '/etc/hqplayer/hqplayerd.xml' };

    async function mount(props) {
        const el = document.createElement('ag-config-editor');
        Object.assign(el, { service: HQPLAYER, ...props });
        document.body.appendChild(el);
        await el.updateComplete;
        return el;
    }

    const tabs = (el) => [...el.querySelectorAll('.config-mode-tab')].map(b => b.textContent.trim());

    afterEach(() => document.body.replaceChildren());

    it('offers Guided and Expert, not Structured', async () => {
        const el = await mount({ guided: true, schema: {} });
        expect(tabs(el)).toEqual(['Guided', 'Expert']);
    });

    it('leaves Structured to a service that has a form', async () => {
        const el = await mount({
            guided: true, schema: { music_directory: { type: 'string' } },
            service: { id: 'mpd', displayName: 'MPD', path: '/etc/mpd.conf' },
        });
        expect(tabs(el)).toEqual(['Guided', 'Structured', 'Expert']);
    });

    it('without a guided view, opens in the raw editor with nothing to switch to', async () => {
        const el = await mount({ guided: false, schema: {} });
        expect(el.currentMode).toBe('raw');
        expect(el.querySelector('.config-mode-toggle')).toBeNull();
    });

    it('tells the guided view whether to offer Reset to default', async () => {
        const off = await mount({ guided: true, schema: {}, regenerable: false });
        expect(off.querySelector('ag-guided-config').regenerable).toBe(false);
        document.body.replaceChildren();
        const on = await mount({ guided: true, schema: {} });
        expect(on.querySelector('ag-guided-config').regenerable).toBe(true);
    });
});

describe('AgConfigEditor — the Expert editor is loaded on demand', () => {
    // It used to come from a CDN as a global, and the editor read the global or gave up.
    // It is a chunk of its own now: the editor waits for it, and the wait is where the
    // view can change under it.
    async function mountRaw(props = {}) {
        const el = document.createElement('ag-config-editor');
        Object.assign(el, {
            service: { id: 'hqplayerd', displayName: 'HQPlayer Embedded', path: '/etc/hqplayer/hqplayerd.xml' },
            guided: false, schema: {}, configFormat: 'xml', rawContent: '<xml/>', ...props,
        });
        document.body.appendChild(el);
        await el.updateComplete;
        return el;
    }

    /** Let every pending promise and timer callback run. */
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    /** What the Expert view's message area says, once rendered. */
    async function note(el) {
        await el.updateComplete;
        return el.querySelector('.config-raw-editor .validation-message').textContent.trim();
    }

    /** Make the next load wait until the returned function is called. */
    function holdNextLoad() {
        let release;
        vi.mocked(loadCodeMirror).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(cm); }));
        return () => release();
    }

    /** Make the next load wait, then fail when the returned function is called. */
    function failNextLoadLater() {
        let fail;
        vi.mocked(loadCodeMirror).mockImplementationOnce(() => new Promise((_, reject) => { fail = () => reject(new Error('offline')); }));
        return () => fail();
    }

    beforeEach(() => {
        // Editors mounted by the suites above built theirs through the same stand-in, and
        // a load held by a test that failed would otherwise serve the next one.
        vi.mocked(loadCodeMirror).mockReset().mockImplementation(async () => cm);
        cm.fromTextArea.mockClear();
    });

    afterEach(() => {
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });

    it('builds the editor on the textarea, in the file\'s mode, once the library has loaded', async () => {
        const el = await mountRaw();
        await settle();

        expect(loadCodeMirror).toHaveBeenCalled();
        expect(cm.fromTextArea).toHaveBeenCalledOnce();
        const [textarea, options] = cm.fromTextArea.mock.calls[0];
        expect(textarea.id).toBe('configEditorTextarea');
        expect(options.mode).toBe('xml');
        expect(el._cmInstance).not.toBeNull();
    });

    it('refuses to save when the library could not be loaded', async () => {
        // Without the editor nothing reads the textarea back: a save would send the file
        // as it was loaded, discard what was typed, and restart the service on top.
        vi.mocked(loadCodeMirror).mockRejectedValueOnce(new Error('offline'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.showToast = vi.fn();
        window.showConfirm = vi.fn();

        const el = await mountRaw();
        await settle();

        expect(el._cmInstance).toBeNull();
        expect(el._cm.state).toBe('failed');
        expect(await note(el)).toMatch(/could not be loaded/);
        el._handleSave();
        expect(window.showToast).toHaveBeenCalledWith('error', expect.any(String), expect.stringMatching(/could not be loaded/));
        expect(window.showConfirm).not.toHaveBeenCalled();
    });

    it('says the editor is loading while it loads', async () => {
        const release = holdNextLoad();
        const el = await mountRaw();
        await settle();

        expect(await note(el)).toBe('Loading the editor…');
        release();
        await settle();
        expect(await note(el)).not.toMatch(/Loading the editor/);
    });


    it('refuses to save while the library is still loading', async () => {
        // The bare textarea is on screen meanwhile, and typing in it is possible: a save
        // then would send the file as it was loaded — the review of 2026-10-02.
        const release = holdNextLoad();
        window.showToast = vi.fn();
        window.showConfirm = vi.fn();
        const el = await mountRaw();

        el._handleSave();

        expect(window.showToast).toHaveBeenCalledWith('error', expect.any(String), expect.stringMatching(/still loading/));
        expect(window.showConfirm).not.toHaveBeenCalled();
        release();
        await settle();
    });

    it('builds nothing for a view left while the library was loading', async () => {
        // A service with a form opens in it; Expert is chosen, then left before the load ends.
        const el = await mountRaw({ schema: { music_directory: { type: 'string' } } });
        expect(el.currentMode).toBe('form');
        const release = holdNextLoad();
        el.currentMode = 'raw';
        await el.updateComplete;
        expect(loadCodeMirror).toHaveBeenCalledOnce();
        el.currentMode = 'form';
        await el.updateComplete;

        release();
        await settle();

        expect(cm.fromTextArea).not.toHaveBeenCalled();
        expect(el._cmInstance).toBeNull();
    });

    it('builds nothing once the editor has left the page', async () => {
        const release = holdNextLoad();
        const el = await mountRaw();
        el.remove();

        release();
        await settle();

        expect(cm.fromTextArea).not.toHaveBeenCalled();
    });

    it('leaves a call made during a load to the load under way', async () => {
        const release = holdNextLoad();
        const el = await mountRaw();   // the first call waits on the held load
        await el._initCodeMirror();    // a second one must not start another
        expect(loadCodeMirror).toHaveBeenCalledOnce();
        expect(cm.fromTextArea).not.toHaveBeenCalled();

        release();
        await settle();

        expect(cm.fromTextArea).toHaveBeenCalledOnce();
    });

    it('shows the file read-only until the editor takes over', async () => {
        // Typed there, text would have been taken over by the editor unvalidated (review
        // of 2026-10-02), or refused at save time after a failure.
        const release = holdNextLoad();
        const el = await mountRaw();

        expect(el.querySelector('#configEditorTextarea').readOnly).toBe(true);
        release();
        await settle();
    });

    it('says a retry is loading, not that the previous attempt failed', async () => {
        vi.mocked(loadCodeMirror).mockRejectedValueOnce(new Error('offline'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.showToast = vi.fn();
        const el = await mountRaw({ schema: { music_directory: { type: 'string' } } });
        el.currentMode = 'raw';
        await el.updateComplete;
        await settle();
        expect(await note(el)).toMatch(/could not be loaded/);

        el.currentMode = 'form';
        await el.updateComplete;
        const release = holdNextLoad();
        el.currentMode = 'raw';
        await el.updateComplete;
        await settle();

        expect(await note(el)).toBe('Loading the editor…');
        el._handleSave();
        expect(window.showToast).toHaveBeenCalledWith('error', expect.any(String), expect.stringMatching(/still loading/));
        release();
        await settle();
    });

    it('tries again when Expert is opened again after a failure in another view', async () => {
        const fail = failNextLoadLater();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const el = await mountRaw({ schema: { music_directory: { type: 'string' } } });
        el.currentMode = 'raw';
        await el.updateComplete;
        el.currentMode = 'form';
        await el.updateComplete;
        fail();
        await settle();

        el.currentMode = 'raw';
        await el.updateComplete;
        await settle();

        expect(loadCodeMirror).toHaveBeenCalledTimes(2);
        expect(el._cmInstance).not.toBeNull();
    });

    it('builds the editor again when it comes back to the page in Expert mode', async () => {
        // disconnectedCallback tears CodeMirror down; updated() only rebuilds it on a
        // change of mode, so a moved element stayed a read-only preview for good.
        const el = await mountRaw();
        await settle();
        expect(cm.fromTextArea).toHaveBeenCalledOnce();

        el.remove();
        expect(el._cmInstance).toBeNull();
        expect(el._cm.state, 'an editor torn down is no longer ready').toBe('idle');
        document.body.appendChild(el);
        await settle();

        expect(cm.fromTextArea).toHaveBeenCalledTimes(2);
        expect(el._cmInstance).not.toBeNull();
    });

    it('says so when the editor fails to build, rather than loading for ever', async () => {
        cm.fromTextArea.mockImplementationOnce(() => { throw new Error('bad mode'); });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.showToast = vi.fn();
        const el = await mountRaw();
        await settle();

        expect(el._cm.state).toBe('failed');
        expect(await note(el)).toMatch(/could not be loaded/);
        el._handleSave();
        expect(window.showToast).toHaveBeenCalledWith('error', expect.any(String), expect.stringMatching(/could not be loaded/));
    });
});
