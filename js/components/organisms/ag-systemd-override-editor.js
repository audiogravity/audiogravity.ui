/**
 * @module AgSystemdOverrideEditor
 * @description Organism component for editing Systemd Drop-in overrides.
 * Features: RT presets, OOMScoreAdjust, CPUWeight, diff preview before save.
 *
 * @element ag-systemd-override-editor
 *
 * @attr {boolean} is-open - Modal visibility state
 * @attr {Object} service - Service object containing properties to edit
 * @attr {boolean} isSaving - Loading state during API calls
 *
 * @dependency ag-modal
 * @dependency ag-config-diff
 * @dependency css/components/forms.css, css/components/modal.css
 *
 * @fires save - Dispatched after diff confirmation, with {properties, apply_immediately, service} detail
 * @fires cancel - Dispatched when modal requests to close
 */

import { LitElement, html } from 'lit';
import { showConfirm } from '../../ui-helpers.js';
import '../molecules/ag-config-diff.js';
import { iconMusicNote, iconUndo } from '../../ag-icons.js';
import './ag-modal.js';

/**
 * Map of IO scheduling class names to their systemd numeric values.
 * @type {Object<string, number>}
 */
const IO_CLASS_MAP = { none: 0, realtime: 1, 'best-effort': 2, idle: 3 };

/**
 * Audio-optimized RT preset values for low-latency audio services.
 */
const PRESET_AUDIO = {
    cpu_scheduling_policy: 'fifo',
    cpu_scheduling_priority: 80,
    nice: -10,
    io_scheduling_class: 'realtime',
    io_scheduling_priority: 0,
    limit_memlock: 'infinity',
    limit_rtprio: 99,
    oom_score_adjust: -500,
    cpu_weight: 1000
};

export class AgSystemdOverrideEditor extends LitElement {
    static properties = {
        isOpen: { type: Boolean, attribute: 'is-open' },
        service: { type: Object },
        isSaving: { type: Boolean }
    };

    constructor() {
        super();
        this.isOpen = false;
        this.service = null;
        this.isSaving = false;
    }

    createRenderRoot() { return this; }

    /**
     * Open the editor for the given service.
     * @param {Object} service
     */
    open(service) {
        this.service = service;
        this.isOpen = true;
    }

    close() {
        this.isOpen = false;
    }

    _handleClose() {
        if (this.isSaving) return;
        this.isOpen = false;
        this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    }

    /**
     * Apply a named preset by directly setting form field values in the DOM.
     * @param {'audio'|'reset'} preset
     */
    _applyPreset(preset) {
        const form = this.querySelector('#propertiesForm');
        if (!form) return;

        const set = (name, val) => {
            const el = form.elements[name];
            if (el) el.value = (val !== undefined && val !== null) ? String(val) : '';
        };
        const check = (name, val) => {
            const el = form.elements[name];
            if (el) el.checked = !!val;
        };

        if (preset === 'audio') {
            set('cpu_scheduling_policy', PRESET_AUDIO.cpu_scheduling_policy);
            set('cpu_scheduling_priority', PRESET_AUDIO.cpu_scheduling_priority);
            set('nice', PRESET_AUDIO.nice);
            set('io_scheduling_class', PRESET_AUDIO.io_scheduling_class);
            set('io_scheduling_priority', PRESET_AUDIO.io_scheduling_priority);
            set('limit_memlock', PRESET_AUDIO.limit_memlock);
            set('limit_rtprio', PRESET_AUDIO.limit_rtprio);
            set('oom_score_adjust', PRESET_AUDIO.oom_score_adjust);
            set('cpu_weight', PRESET_AUDIO.cpu_weight);
        } else if (preset === 'reset') {
            ['cpu_affinity', 'cpu_scheduling_policy', 'cpu_scheduling_priority', 'nice',
             'io_scheduling_class', 'io_scheduling_priority', 'limit_memlock', 'limit_rtprio',
             'memory_max', 'memory_high', 'tasks_max', 'limit_nofile', 'limit_nproc',
             'oom_score_adjust', 'cpu_weight'].forEach(name => set(name, ''));
            check('io_accounting', false);
            check('ip_accounting', false);
        }
    }

    /**
     * Generate the override.conf text for a given properties object.
     * Mirrors the backend _generate_override_content() logic.
     * @param {Object} props
     * @returns {string}
     */
    _generateOverrideContent(props) {
        const lines = ['[Service]'];
        const has = (v) => v !== undefined && v !== null && v !== '';

        if (has(props.cpu_affinity))            lines.push(`CPUAffinity=${props.cpu_affinity}`);
        if (has(props.cpu_scheduling_policy))   lines.push(`CPUSchedulingPolicy=${props.cpu_scheduling_policy}`);
        if (has(props.cpu_scheduling_priority)) lines.push(`CPUSchedulingPriority=${props.cpu_scheduling_priority}`);
        if (has(props.nice))                    lines.push(`Nice=${props.nice}`);
        if (has(props.io_scheduling_class)) {
            const num = IO_CLASS_MAP[props.io_scheduling_class] ?? props.io_scheduling_class;
            lines.push(`IOSchedulingClass=${num}`);
        }
        if (has(props.io_scheduling_priority))  lines.push(`IOSchedulingPriority=${props.io_scheduling_priority}`);
        if (has(props.limit_memlock))           lines.push(`LimitMEMLOCK=${props.limit_memlock}`);
        if (has(props.limit_rtprio))            lines.push(`LimitRTPRIO=${props.limit_rtprio}`);
        if (has(props.memory_max))              lines.push(`MemoryMax=${props.memory_max}`);
        if (has(props.memory_high))             lines.push(`MemoryHigh=${props.memory_high}`);
        if (has(props.tasks_max))               lines.push(`TasksMax=${props.tasks_max}`);
        if (has(props.limit_nofile))            lines.push(`LimitNOFILE=${props.limit_nofile}`);
        if (has(props.limit_nproc))             lines.push(`LimitNPROC=${props.limit_nproc}`);
        if (has(props.oom_score_adjust))        lines.push(`OOMScoreAdjust=${props.oom_score_adjust}`);
        if (has(props.cpu_weight))              lines.push(`CPUWeight=${props.cpu_weight}`);
        if (props.io_accounting != null)        lines.push(`IOAccounting=${props.io_accounting ? 'yes' : 'no'}`);
        if (props.ip_accounting != null)        lines.push(`IPAccounting=${props.ip_accounting ? 'yes' : 'no'}`);

        return lines.join('\n') + '\n';
    }

    /**
     * Collect form data, show diff preview, then dispatch save event on confirmation.
     * @returns {Promise<void>}
     */
    async _handleSave() {
        if (this.isSaving || !this.service) return;

        const form = this.querySelector('#propertiesForm');
        if (!form) return;
        const formData = new FormData(form);

        const properties = {};
        const addProperty = (name, value, converter = null) => {
            if (value !== '' && value !== null) {
                properties[name] = converter ? converter(value) : value;
            }
        };

        addProperty('cpu_affinity', formData.get('cpu_affinity'));
        addProperty('cpu_scheduling_policy', formData.get('cpu_scheduling_policy'));
        addProperty('cpu_scheduling_priority', formData.get('cpu_scheduling_priority'), parseInt);
        addProperty('nice', formData.get('nice'), parseInt);
        addProperty('io_scheduling_class', formData.get('io_scheduling_class'));
        addProperty('io_scheduling_priority', formData.get('io_scheduling_priority'), parseInt);
        addProperty('memory_max', formData.get('memory_max'));
        addProperty('memory_high', formData.get('memory_high'));
        addProperty('limit_memlock', formData.get('limit_memlock'));
        addProperty('tasks_max', formData.get('tasks_max'), parseInt);
        addProperty('limit_rtprio', formData.get('limit_rtprio'), parseInt);
        addProperty('limit_nofile', formData.get('limit_nofile'), parseInt);
        addProperty('limit_nproc', formData.get('limit_nproc'), parseInt);
        addProperty('oom_score_adjust', formData.get('oom_score_adjust'), parseInt);
        addProperty('cpu_weight', formData.get('cpu_weight'), parseInt);

        properties.io_accounting = formData.get('io_accounting') === 'on';
        properties.ip_accounting = formData.get('ip_accounting') === 'on';

        const apply_immediately = formData.get('apply_immediately') === 'on';

        const oldContent = this._generateOverrideContent(this.service.properties || {});
        const newContent = this._generateOverrideContent(properties);

        const confirmed = await showConfirm(
            'Confirm Override Changes',
            html`<ag-config-diff mode="raw" .oldText=${oldContent} .newText=${newContent}></ag-config-diff>`,
            { okLabel: 'Apply', cancelLabel: 'Cancel' }
        );
        if (!confirmed) return;

        this.dispatchEvent(new CustomEvent('save', {
            detail: { properties, apply_immediately, service: this.service },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (!this.service) return html``;

        const props = this.service.properties || {};
        const title = `Edit Properties: ${this.service.name}`;

        return html`
            <ag-modal
                ?show=${this.isOpen}
                @modal-close=${this._handleClose}
                size="premium"
                title="${title}"
                .bodyTemplate=${html`
                    <form id="propertiesForm">

                        <div class="form-section">
                            <h4>RT Presets</h4>
                            <div class="form-field" style="display:flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                                <button type="button" class="btn-action compact success"
                                        title="Apply Real-Time audio-optimised values (SCHED_FIFO 80, RTPRIO 99, MEMLOCK infinity…)"
                                        @click=${() => this._applyPreset('audio')}>
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconMusicNote}</svg> Audio Optimized
                                </button>
                                <button type="button" class="btn-action compact"
                                        title="Clear all fields (restore systemd defaults)"
                                        @click=${() => this._applyPreset('reset')}>
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUndo}</svg> Reset to Defaults
                                </button>
                            </div>
                            <p style="margin: var(--spacing-xs) 0 0; font-size: var(--font-size-xs); color: var(--text-muted);">
                                Presets fill the form — review values before saving.
                            </p>
                        </div>

                        <div class="form-section">
                            <h4>CPU & Scheduling</h4>

                            <div class="form-field">
                                <label>CPU Affinity <span class="help-text">(ex: "0,1" or "0-3")</span></label>
                                <input type="text" name="cpu_affinity" .value=${props.cpu_affinity || ''}
                                       placeholder="0,1">
                            </div>

                            <div class="form-field">
                                <label>CPU Scheduling Policy</label>
                                <select name="cpu_scheduling_policy" .value=${props.cpu_scheduling_policy || ''}>
                                    <option value="">Default</option>
                                    <option value="other">Other</option>
                                    <option value="batch">Batch</option>
                                    <option value="idle">Idle</option>
                                    <option value="fifo">FIFO (RT)</option>
                                    <option value="rr">Round Robin (RT)</option>
                                </select>
                            </div>

                            <div class="form-field">
                                <label>CPU Scheduling Priority <span class="help-text">(0-99 for RT)</span></label>
                                <input type="number" name="cpu_scheduling_priority"
                                       .value=${props.cpu_scheduling_priority != null ? props.cpu_scheduling_priority : ''}
                                       min="0" max="99" placeholder="0-99">
                            </div>

                            <div class="form-field">
                                <label>Nice <span class="help-text">(-20 to 19)</span></label>
                                <input type="number" name="nice"
                                       .value=${props.nice != null ? props.nice : ''}
                                       min="-20" max="19" placeholder="-20 to 19">
                            </div>

                            <div class="form-field">
                                <label>CPU Weight <span class="help-text">(cgroup v2 scheduler, 1-10000, default 100)</span></label>
                                <input type="number" name="cpu_weight"
                                       .value=${props.cpu_weight != null ? props.cpu_weight : ''}
                                       min="1" max="10000" placeholder="100">
                            </div>
                        </div>

                        <div class="form-section">
                            <h4>I/O Scheduling</h4>

                            <div class="form-field">
                                <label>I/O Scheduling Class</label>
                                <select name="io_scheduling_class" .value=${props.io_scheduling_class || ''}>
                                    <option value="">Default</option>
                                    <option value="none">None</option>
                                    <option value="realtime">Realtime</option>
                                    <option value="best-effort">Best Effort</option>
                                    <option value="idle">Idle</option>
                                </select>
                            </div>

                            <div class="form-field">
                                <label>I/O Scheduling Priority <span class="help-text">(0-7)</span></label>
                                <input type="number" name="io_scheduling_priority"
                                       .value=${props.io_scheduling_priority != null ? props.io_scheduling_priority : ''}
                                       min="0" max="7" placeholder="0-7">
                            </div>
                        </div>

                        <div class="form-section">
                            <h4>Memory Limits</h4>

                            <div class="form-field">
                                <label>Memory Max <span class="help-text">(ex: "2G", "512M", "infinity")</span></label>
                                <input type="text" name="memory_max" .value=${props.memory_max || ''}
                                       placeholder="2G or infinity">
                            </div>

                            <div class="form-field">
                                <label>Memory High <span class="help-text">(ex: "1G", "256M")</span></label>
                                <input type="text" name="memory_high" .value=${props.memory_high || ''}
                                       placeholder="1G">
                            </div>

                            <div class="form-field">
                                <label>MEMLOCK Limit <span class="help-text">(ex: "infinity", "unlimited")</span></label>
                                <input type="text" name="limit_memlock" .value=${props.limit_memlock || ''}
                                       placeholder="infinity">
                            </div>
                        </div>

                        <div class="form-section">
                            <h4>Other Limits</h4>
                            <div class="form-field">
                                <label>Tasks Max</label>
                                <input type="number" name="tasks_max"
                                       .value=${props.tasks_max != null ? props.tasks_max : ''}
                                       placeholder="unlimited">
                            </div>
                            <div class="form-field">
                                <label>RTPRIO Limit <span class="help-text">(0-99)</span></label>
                                <input type="number" name="limit_rtprio"
                                       .value=${props.limit_rtprio != null ? props.limit_rtprio : ''}
                                       min="0" max="99" placeholder="95">
                            </div>
                            <div class="form-field">
                                <label>NOFILE Limit <span class="help-text">(max open files)</span></label>
                                <input type="number" name="limit_nofile"
                                       .value=${props.limit_nofile != null ? props.limit_nofile : ''}
                                       placeholder="65536">
                            </div>
                            <div class="form-field">
                                <label>NPROC Limit <span class="help-text">(max processes)</span></label>
                                <input type="number" name="limit_nproc"
                                       .value=${props.limit_nproc != null ? props.limit_nproc : ''}
                                       placeholder="4096">
                            </div>
                            <div class="form-field">
                                <label>OOM Score Adjust <span class="help-text">(-1000 to 1000; negative = protected from OOM killer)</span></label>
                                <input type="number" name="oom_score_adjust"
                                       .value=${props.oom_score_adjust != null ? props.oom_score_adjust : ''}
                                       min="-1000" max="1000" placeholder="0">
                            </div>
                        </div>

                        <div class="form-section">
                            <h4>Accounting</h4>
                            <div class="form-field checkbox-field">
                                <label>
                                    <input type="checkbox" name="io_accounting" ?checked=${props.io_accounting}>
                                    Enable I/O Accounting <span class="help-text">(Track I/O statistics)</span>
                                </label>
                            </div>
                            <div class="form-field checkbox-field">
                                <label>
                                    <input type="checkbox" name="ip_accounting" ?checked=${props.ip_accounting}>
                                    Enable IP Accounting <span class="help-text">(Track network statistics)</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-field checkbox-field">
                            <label>
                                <input type="checkbox" name="apply_immediately" checked>
                                Apply changes immediately (reload service)
                            </label>
                        </div>
                    </form>
                `}
                .footerTemplate=${html`
                    <button class="btn-action" @click=${() => this._handleClose()} ?disabled=${this.isSaving}>Cancel</button>
                    <button class="btn-action success" @click=${() => this._handleSave()} ?disabled=${this.isSaving}>
                        ${this.isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                `}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-systemd-override-editor', AgSystemdOverrideEditor);
