import { LitElement, html } from 'lit';

/**
 * Config Diff Molecule
 *
 * Renders a unified diff preview panel for configuration changes.
 * Supports two modes:
 * - `raw`: line-by-line unified diff computed via LCS algorithm
 * - `form`: table of changed fields with before/after values
 *
 * @element ag-config-diff
 *
 * @property {string} mode - Display mode: 'raw' or 'form'
 * @property {string} oldText - Original raw file content (raw mode)
 * @property {string} newText - Current raw file content (raw mode)
 * @property {Object} schema - Field schema map keyed by field name (form mode)
 * @property {Object} formData - Current form values (form mode)
 * @property {Object} originalFormData - Original form values for comparison (form mode)
 *
 * @dependency css/config.css - Uses .config-diff-panel, .diff-line, .config-diff-table classes
 */
export class AgConfigDiff extends LitElement {
    static properties = {
        mode: { type: String },
        oldText: { type: String },
        newText: { type: String },
        schema: { type: Object },
        formData: { type: Object },
        originalFormData: { type: Object }
    };

    constructor() {
        super();
        this.mode = 'raw';
        this.oldText = '';
        this.newText = '';
        this.schema = null;
        this.formData = {};
        this.originalFormData = {};
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    /**
     * Compute a line-by-line unified diff via LCS.
     * Returns null if either input exceeds 500 lines.
     * @param {string} oldText
     * @param {string} newText
     * @returns {Array<{type:'context'|'add'|'remove', line:string}>|null}
     */
    _computeLineDiff(oldText, newText) {
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');
        if (oldLines.length > 500 || newLines.length > 500) return null;

        const m = oldLines.length;
        const n = newLines.length;
        const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = oldLines[i - 1] === newLines[j - 1]
                    ? dp[i - 1][j - 1] + 1
                    : Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }

        const result = [];
        let i = m, j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                result.push({ type: 'context', line: oldLines[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                result.push({ type: 'add', line: newLines[j - 1] });
                j--;
            } else {
                result.push({ type: 'remove', line: oldLines[i - 1] });
                i--;
            }
        }
        return result.reverse();
    }

    /**
     * Extract changed hunks with ±context lines from a flat diff array.
     * Overlapping ranges are merged into a single hunk.
     * @param {Array} diff
     * @param {number} [context=3]
     * @returns {Array<Array>}
     */
    _extractHunks(diff, context = 3) {
        const changed = diff.reduce((acc, l, i) => { if (l.type !== 'context') acc.push(i); return acc; }, []);
        if (!changed.length) return [];

        const ranges = [];
        let start = Math.max(0, changed[0] - context);
        let end = Math.min(diff.length - 1, changed[0] + context);

        for (let k = 1; k < changed.length; k++) {
            const ns = Math.max(0, changed[k] - context);
            if (ns <= end + 1) {
                end = Math.min(diff.length - 1, changed[k] + context);
            } else {
                ranges.push([start, end]);
                start = ns;
                end = Math.min(diff.length - 1, changed[k] + context);
            }
        }
        ranges.push([start, end]);
        return ranges.map(([s, e]) => diff.slice(s, e + 1));
    }

    /**
     * Compute form-mode diff: returns entries for fields whose value changed.
     * @returns {Array<{label:string, old:string, new:string}>}
     */
    _computeFormDiff() {
        if (!this.schema) return [];
        const fmt = v => v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
        return Object.entries(this.schema)
            .filter(([key]) => JSON.stringify(this.formData[key]) !== JSON.stringify(this.originalFormData[key]))
            .map(([key, fieldSchema]) => ({
                label: fieldSchema.label || key,
                old: fmt(this.originalFormData[key]),
                new: fmt(this.formData[key])
            }));
    }

    /** @returns {import('lit').TemplateResult} */
    _renderRawDiff() {
        const diff = this._computeLineDiff(this.oldText, this.newText);

        if (!diff) return html`
            <div class="config-diff-panel">
                <p class="diff-message">File too large for inline diff preview.</p>
            </div>`;

        const adds = diff.filter(l => l.type === 'add').length;
        const removes = diff.filter(l => l.type === 'remove').length;

        if (adds === 0 && removes === 0) return html`
            <div class="config-diff-panel">
                <p class="diff-message">No changes detected.</p>
            </div>`;

        const hunks = this._extractHunks(diff);
        return html`
            <div class="config-diff-panel">
                <div class="config-diff-header">
                    <span class="config-diff-title">Changes Preview</span>
                    <span class="diff-stats">
                        <span class="diff-stat-add">+${adds}</span>
                        <span class="diff-stat-remove">−${removes}</span>
                    </span>
                </div>
                <div class="config-diff-body">
                    ${hunks.map((hunk, hi) => html`
                        ${hi > 0 ? html`<div class="diff-hunk-sep">···</div>` : ''}
                        ${hunk.map(l => html`
                            <div class="diff-line diff-line--${l.type}">
                                <span class="diff-line-prefix">${l.type === 'add' ? '+' : l.type === 'remove' ? '−' : ' '}</span>
                                <code class="diff-line-code">${l.line}</code>
                            </div>
                        `)}
                    `)}
                </div>
            </div>`;
    }

    /** @returns {import('lit').TemplateResult} */
    _renderFormDiff() {
        const changes = this._computeFormDiff();

        if (!changes.length) return html`
            <div class="config-diff-panel">
                <p class="diff-message">No changes detected.</p>
            </div>`;

        return html`
            <div class="config-diff-panel">
                <div class="config-diff-header">
                    <span class="config-diff-title">Changes Preview</span>
                    <span class="diff-stats">${changes.length} field${changes.length > 1 ? 's' : ''} modified</span>
                </div>
                <table class="config-diff-table">
                    <thead>
                        <tr>
                            <th>Field</th>
                            <th>Before</th>
                            <th>After</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${changes.map(c => html`
                            <tr>
                                <td class="diff-field-name">${c.label}</td>
                                <td class="diff-old">${c.old}</td>
                                <td class="diff-new">${c.new}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>`;
    }

    render() {
        return this.mode === 'raw' ? this._renderRawDiff() : this._renderFormDiff();
    }
}

customElements.define('ag-config-diff', AgConfigDiff);
