/**
 * @module CodeMirrorController
 * @description Lit Reactive Controller that loads CodeMirror for an editor component on
 * demand and keeps where that stands — for the two editors that use it, the Expert
 * configuration editor (ag-config-editor) and the JSON editor (ag-json-config-modal).
 *
 * The library is a chunk of its own (js/core/load-codemirror.js), so an editor waits for
 * it, can be left while it does, and can find it missing. That part lives here, once, so
 * both editors behave and speak alike: `state` is 'idle' (no editor built, or the view no
 * longer wants one), 'loading', 'ready' or 'failed', and the host re-renders at each
 * change.
 *
 * Usage:
 * this._cm = new CodeMirrorController(this);
 * const editor = await this._cm.build((CodeMirror) => CodeMirror.fromTextArea(textarea, options));
 */
import { loadCodeMirror } from './load-codemirror.js';

/** What an editor says when CodeMirror could not be loaded or built. */
export const EDITOR_LOAD_FAILED =
    'The editor could not be loaded. Reload the page to try again.';

export class CodeMirrorController {
    /**
     * @param {import('lit').ReactiveControllerHost} host - The editor component.
     */
    constructor(host) {
        this.host = host;
        /** @type {'idle'|'loading'|'ready'|'failed'} */
        this.state = 'idle';
        host.addController(this);
    }

    /**
     * Load CodeMirror and build an editor with it, one build at a time.
     *
     * A call made while a build is under way returns null at once and leaves it to that
     * one. Whatever goes wrong — the chunk not arriving, or the editor failing to build —
     * ends in 'failed', never in an unhandled rejection.
     *
     * @param {function(Function): (?Object|Promise<?Object>)} create - Builds the editor
     *   from the CodeMirror constructor and returns it, or null when the view no longer
     *   wants one (left, closed, switched away).
     * @returns {Promise<?Object>} The editor, or null.
     */
    async build(create) {
        if (this.state === 'loading') return null;
        this._set('loading');
        try {
            const editor = await create(await loadCodeMirror());
            this._set(editor ? 'ready' : 'idle');
            return editor || null;
        } catch (error) {
            console.error('[CodeMirror] the editor could not be loaded', error);
            this._set('failed');
            return null;
        }
    }

    /** The host tore its editor down: the next build starts afresh. */
    reset() {
        this._set('idle');
    }

    /** @param {'idle'|'loading'|'ready'|'failed'} state */
    _set(state) {
        if (state === this.state) return;
        this.state = state;
        // After the update under way, not during it: build() starts from a host's
        // updated(), and an update asked for there makes Lit schedule one more
        // (lit.dev/msg/change-in-update).
        queueMicrotask(() => this.host.requestUpdate());
    }
}
