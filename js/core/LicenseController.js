/**
 * @module LicenseController
 * @description Lit Reactive Controller that keeps a component's `_license` in step with
 * the box's licence, as the tab bar reads it (`license-status`, js/license-tiers.js).
 *
 * Five components kept their own copy of this — the licence read at construction, a
 * window listener added on connect and removed on disconnect — and one re-rendered
 * itself by hand because its field was not reactive (review, 2026-10-15). They hold a
 * controller instead:
 *
 *   this._licenseCtl = new LicenseController(this, (license, previous) => …);
 *   // the padlocks read this._license, as before:
 *   ?locked=${isLockedSource(source, this._license)}
 *
 * `_license` stays a field of the component, so what reads it — templates, tests that set
 * it — is unchanged; the controller writes it, then re-renders the component.
 */
import { currentLicense } from '../license-tiers.js';

export class LicenseController {
    /**
     * @param {import('lit').ReactiveControllerHost & object} host - The component. Its
     *   `_license` is set at once to the licence already read (null until then).
     * @param {(license: object|null, previous: object|null) => void} [onChange] - Called
     *   after each change, once `_license` holds the new answer: what the component does
     *   when the licence is read or changes.
     */
    constructor(host, onChange = null) {
        this.host = host;
        this._onChange = onChange;
        host._license = currentLicense();
        this.handleEvent = this.handleEvent.bind(this);
        // Optional: the unit tests stand LitElement in with a bare class.
        host.addController?.(this);
    }

    /** Follow the licence while the component is in the page. */
    hostConnected() {
        window.addEventListener('license-status', this.handleEvent);
    }

    /** Stop following it when the component leaves. */
    hostDisconnected() {
        window.removeEventListener('license-status', this.handleEvent);
    }

    /**
     * Take a new reading of the licence.
     *
     * @param {CustomEvent} e - `license-status`; detail = the /license/status answer, or
     *   null when it is forgotten.
     * @returns {*} What `onChange` returns — a promise when it is async, for whoever has
     *   to wait for what it does (a test); the window ignores it.
     */
    handleEvent(e) {
        const previous = this.host._license;
        this.host._license = e?.detail ?? null;
        const done = this._onChange?.(this.host._license, previous);
        this.host.requestUpdate?.();
        return done;
    }
}
