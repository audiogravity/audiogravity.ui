/**
 * @module AgLibraryScanIndicator
 * @description Transient "Indexing library…" indicator shown after a library
 * change (Apply / INITIALIZE). MPD's database scan runs in the background, so a
 * host calls `start()` after the change; this molecule then polls
 * GET /audio-stack/library-scan-status and shows a spinner while MPD is
 * indexing, hiding itself once the scan completes (or if it was too fast to
 * catch). Nothing is rendered when idle.
 *
 * Autonomous molecule (own API polling, light DOM), embedded by the config
 * hosts.
 *
 * @element ag-library-scan-indicator
 * @dependency js/api.js
 * @dependency js/ag-icons.js
 * @dependency css/audio-stack.css (ag-lsi-* block)
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { iconSpinner, iconCheck } from '../../ag-icons.js';

// Poll cadence and give-up thresholds.
const POLL_MS = 1500;
// Consecutive idle polls before concluding the scan was too fast to catch.
const MAX_IDLE_POLLS = 3;
// Absolute safety cap (~10 min) so a stuck scan never polls forever.
const MAX_POLLS = 400;

export class AgLibraryScanIndicator extends LitElement {
    static properties = {
        _state: { state: true }, // 'idle' | 'indexing' | 'done'
    };

    constructor() {
        super();
        this._state = 'idle';
        this._timer = null;
        this._seenScanning = false;
        this._idlePolls = 0;
        this._polls = 0;
    }

    createRenderRoot() {
        return this; // Light DOM (global theme + audio-stack.css)
    }

    connectedCallback() {
        super.connectedCallback();
        // A scan may already be running — e.g. the user left the config tab and
        // came back mid-index, which destroys and recreates this element. One
        // passive probe re-engages the indicator so switching tabs never loses
        // an in-flight scan. MPD is the source of truth, not this instance.
        this._resume();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stop();
    }

    /**
     * Passive re-attach probe: query the scan status once and, only if MPD is
     * indexing right now, engage the polling loop. Unlike `start()` this makes
     * no optimistic assumption — an idle MPD leaves the indicator hidden and
     * schedules no further work (a single cheap GET per mount).
     */
    async _resume() {
        let scanning = false;
        try {
            ({ scanning } = await apiGet('/audio-stack/library-scan-status'));
        } catch {
            return; // endpoint unreachable → stay idle
        }
        if (scanning && !this._timer && this._state !== 'done') {
            this._seenScanning = true;
            this._idlePolls = 0;
            this._polls = 0;
            this._state = 'indexing';
            this._timer = setTimeout(() => this._poll(), POLL_MS);
        }
    }

    /** Begin watching MPD's database scan after a library change. */
    start() {
        this._stop();
        this._state = 'indexing';   // optimistic: a scan was just requested
        this._seenScanning = false;
        this._idlePolls = 0;
        this._polls = 0;
        this._poll();
    }

    /** Stop polling and clear any pending timer. */
    _stop() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }

    /** One poll of the scan status; schedules the next unless finished. */
    async _poll() {
        this._polls += 1;
        let scanning = false;
        try {
            ({ scanning } = await apiGet('/audio-stack/library-scan-status'));
        } catch {
            // Treat a transient failure as "not scanning" — the give-up logic
            // below still resolves the indicator instead of spinning forever.
        }

        if (scanning) {
            this._seenScanning = true;
            this._idlePolls = 0;
            this._state = 'indexing';
        } else if (this._seenScanning) {
            this._finish();          // saw a scan, now idle → it completed
            return;
        } else if (++this._idlePolls >= MAX_IDLE_POLLS) {
            this._finish();          // never caught a scan → too fast / nothing to do
            return;
        }

        if (this._polls >= MAX_POLLS) { this._stop(); this._state = 'idle'; return; }
        this._timer = setTimeout(() => this._poll(), POLL_MS);
    }

    /** Scan finished: briefly show "ready", then hide. */
    _finish() {
        this._stop();
        // Only flash "ready" if a scan was actually observed.
        if (this._seenScanning) {
            this._state = 'done';
            this._timer = setTimeout(() => { this._state = 'idle'; }, 2500);
        } else {
            this._state = 'idle';
        }
    }

    render() {
        if (this._state === 'idle') return nothing;
        const done = this._state === 'done';
        return html`
            <div class="ag-lsi ${done ? 'done' : ''}" role="status">
                <svg class="${done ? '' : 'ag-spin'}" viewBox="0 0 24 24" width="1em" height="1em"
                     fill="none" stroke="currentColor" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round">${done ? iconCheck : iconSpinner}</svg>
                <span>${done ? 'Library indexed' : 'Indexing library… (this can take a while on a large NAS)'}</span>
            </div>`;
    }
}

customElements.define('ag-library-scan-indicator', AgLibraryScanIndicator);
