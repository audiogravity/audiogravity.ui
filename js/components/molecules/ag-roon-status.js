/**
 * @module AgRoonStatus
 * @description Says where the Roon setup stands, and what is left to do about it.
 *
 * Connecting a box to Roon ends with a step that happens entirely inside Roon —
 * enabling the extension in Settings → Extensions. The box cannot see the owner
 * do it, and until this component existed it said nothing at all: the source card
 * showed "No zones available" and left them there. The one person who got through
 * it read the box's journal over SSH to find out what was expected of them.
 *
 * Each state names the situation and, when the next move is the owner's, what it
 * is. The extension's name comes from the box rather than being written here, so
 * the two can never drift apart.
 *
 * @element ag-roon-status
 */
import { LitElement, html, nothing } from 'lit';
import { getRoonStatus } from '../../library-store.js';

/**
 * What each state means, and what the owner should do about it.
 * `action` is null when there is nothing for them to do.
 */
const STATES = {
    unknown: {
        tone: 'idle',
        // Not only "nothing attempted yet": the box also lands here after a
        // failure whose cause it could not name. Rendering nothing left the
        // expanded card completely blank — strictly worse than the "No zones
        // available" this component replaced.
        title: 'Roon is not connected',
        action: null,
        retry: true,
    },
    checking: {
        tone: 'idle',
        title: 'Checking Roon…',
        action: null,
    },
    no_endpoint: {
        tone: 'idle',
        title: 'Roon Bridge is not running on this box',
        action: 'Install it from Audio Software, then start it.',
        retry: true,
    },
    core_not_found: {
        tone: 'idle',
        title: 'No Roon Core is answering',
        action: 'Check that Roon Core is running on your network.',
        retry: true,
    },
    waiting_authorization: {
        tone: 'waiting',
        title: 'Waiting for your authorization in Roon',
        // Completed with the extension name the box reports.
        action: null,
        retry: true,
        retryLabel: 'I have enabled it',
    },
    connected: {
        tone: 'ok',
        title: 'Connected to your Roon Core',
        action: null,
    },
};

export class AgRoonStatus extends LitElement {
    static properties = {
        _status:  { state: true },
        _loading: { state: true },
    };

    /**
     * How long to wait before looking again while the box is still trying. The
     * box answers 'checking' immediately rather than holding the request for the
     * length of a connection attempt, so something has to come back for the
     * answer — otherwise the card stays on 'Checking' for good.
     */
    static RECHECK_MS = 3000;

    /**
     * How many times to look again on our own before leaving it to the owner.
     * The box answers 'checking' for as long as it has no client built, which a
     * failed build makes permanent — an unbounded automatic poll would then hit
     * the box every three seconds for the life of the page.
     */
    static MAX_RECHECKS = 4;

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._status  = null;
        this._loading = false;
        this._recheck = null;
        this._rechecksLeft = AgRoonStatus.MAX_RECHECKS;
    }

    connectedCallback() {
        super.connectedCallback();
        this.refresh();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearTimeout(this._recheck);
        this._recheck = null;
    }

    /**
     * Fetch the current state.
     *
     * @param {object} [opts]
     * @param {boolean} [opts.force] - Bypass the store's cache. Used when the
     *        owner asks again, having just acted inside Roon.
     * @returns {Promise<void>}
     */
    async refresh({ force = false, manual = false } = {}) {
        if (manual) this._rechecksLeft = AgRoonStatus.MAX_RECHECKS;
        this._loading = true;
        let answer = null;
        try {
            answer = await getRoonStatus({ force });
        } catch (_) {
            // A box that cannot answer is not a Roon problem. Keep whatever was
            // last known rather than blanking the panel: the router turns any
            // backend hiccup into a 500, and one of those used to wipe a good
            // state permanently, until the card was collapsed and reopened.
        } finally {
            this._loading = false;
        }

        // The request outlives the element when the card is collapsed mid-flight.
        // Without this, the answer would arm a timer that disconnectedCallback
        // has already run past — one orphan poller per expand/collapse cycle.
        if (this.isConnected === false) return;

        if (answer) this._status = answer;

        clearTimeout(this._recheck);
        this._recheck = null;
        if (answer?.state === 'checking' && this._rechecksLeft > 0) {
            this._rechecksLeft -= 1;
            this._recheck = setTimeout(
                () => this.refresh({ force: true }),
                AgRoonStatus.RECHECK_MS,
            );
        }

        // Zones only exist once the session does, and the card fetched them
        // before there were any. Tell it, so it does not sit on an empty list
        // cached for a minute while this panel says "Connected — 2 zones".
        if (answer?.state === 'connected') {
            this.dispatchEvent(new CustomEvent('roon-connected', { bubbles: true }));
        }
    }

    render() {
        if (this._loading && !this._status) {
            return html`<div class="lib-roon-state loading">Checking Roon…</div>`;
        }
        if (!this._status) return nothing;

        const { state, zones, extension_name: extensionName } = this._status;
        const known = STATES[state];
        // 'unknown' — nothing has been attempted yet — and any state this build
        // does not know about say nothing rather than invent a diagnosis.
        if (!known) return nothing;

        const action = state === 'waiting_authorization'
            ? html`Open Roon → <strong>Settings → Extensions</strong> and enable
                   <strong>${extensionName}</strong>.`
            : known.action;

        const detail = state === 'connected'
            ? html`<span class="lib-roon-state-count">
                       ${zones} ${zones === 1 ? 'zone' : 'zones'}
                   </span>`
            : nothing;

        return html`
            <div class="lib-roon-state ${known.tone}">
                <div class="lib-roon-state-row">
                    <span class="lib-roon-state-title">${known.title}</span>
                    ${detail}
                </div>
                ${action ? html`<p class="lib-roon-state-action">${action}</p>` : nothing}
                ${known.retry ? html`
                    <button class="action-btn compact"
                            ?disabled=${this._loading}
                            @click=${() => this.refresh({ force: true, manual: true })}>
                        ${this._loading ? 'Checking…' : (known.retryLabel ?? 'Check again')}
                    </button>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-roon-status', AgRoonStatus);
