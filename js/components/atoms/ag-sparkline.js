/**
 * @module AgSparkline
 * @description Atomic sparkline component using Lit SVG syntax.
 * Replaces old imperative SparklineChart class.
 */

import { LitElement, html, svg, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { isMeasured } from '../../core/metrics-window.js';

/** Headroom above the highest measurement on a zero-based scale, so its peak never touches the top. */
const HEADROOM = 1.15;
/** Height reserved above the chart when a caption is shown (the caption font is 10px). */
const CAPTION_BAND = 12;

/**
 * Place measurements on a fixed number of slots, newest in the last slot.
 *
 * The window then has a width of its own: three measurements take three slots on
 * the right instead of being stretched over the whole chart, which drew them as
 * though they covered the same time as a full window.
 *
 * @param {Array<number|null|undefined>} values - Oldest first; null/undefined = not measured.
 * @param {number} slots - Window capacity; 0 or less uses one slot per value.
 * @returns {{count: number, points: Array<{slot: number, value: number}>}} Measured points only.
 */
export function placeOnSlots(values, slots) {
    const list = Array.isArray(values) ? values : [];
    const count = slots > 0 ? slots : Math.max(list.length, 1);
    const kept = list.slice(-count);
    const offset = count - kept.length;
    const points = [];
    kept.forEach((value, i) => {
        if (isMeasured(value)) points.push({ slot: offset + i, value });
    });
    return { count, points };
}

/**
 * Split placed points wherever a slot has no measurement, so a missing value is a gap
 * and never a line drawn through (or a dive to zero).
 *
 * @param {Array<{slot: number, value: number}>} points - Output of placeOnSlots, in slot order.
 * @returns {Array<Array<{slot: number, value: number}>>} Runs of consecutive slots.
 */
export function measuredRuns(points) {
    const runs = [];
    for (const p of points) {
        const run = runs[runs.length - 1];
        if (run && p.slot === run[run.length - 1].slot + 1) run.push(p);
        else runs.push([p]);
    }
    return runs;
}

/**
 * Smooth path through points that never overshoots them (monotone cubic,
 * Fritsch–Carlson): a peak stays the measured peak, a flat stretch stays flat.
 *
 * @param {Array<[number, number]>} pts - [x, y] pairs, x increasing.
 * @returns {string} SVG path data.
 */
export function monotonePath(pts) {
    if (pts.length === 0) return '';
    if (pts.length < 3) return 'M ' + pts.map(p => p.join(',')).join(' L ');
    const n = pts.length;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) {
        dx[i] = pts[i + 1][0] - pts[i][0];
        m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
    }
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
        const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
        if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
        const h = dx[i] / 3;
        d += ` C ${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
    }
    return d;
}

/**
 * Sparkline Chart Web Component
 * @element ag-sparkline
 *
 * @attr {number} max-points - Max number of visible points (default: 60)
 * @attr {string} line-color - Custom line color hex/var
 * @attr {string} fill-color - Custom fill color hex/var
 * @attr {string} activity-level - High/Medium/Low preset colors (CSS class)
 * @attr {string} variant - 'line' (default, stretched curve with gradient), 'area'
 *   (thin smoothed line over a flat area, end dot) or 'bars' (one bar per measurement).
 *   'area' and 'bars' leave a gap where a value is null, and with auto-scale start
 *   their scale at zero; 'bars' draws the first series only. A measurement alone
 *   between two gaps is drawn as a point. The end dot ('area') and the full bar
 *   ('bars') mark the newest slot only when it holds a measurement: a stale value is
 *   not presented as the current one. Their colours are applied as CSS, so a var()
 *   in line-color / fill-color / second-line-color resolves without JS.
 * @attr {number} slots - Window capacity for 'area' and 'bars': values fill it from
 *   the right. 0 (default) spreads the values over the whole width.
 * @attr {string} caption-start - Short text drawn above the chart, left ('area'/'bars').
 * @attr {string} caption-end - Short text drawn above the chart, right ('area'/'bars').
 *
 * @dependency css/components/sparkline.css - SVG styling and activity classes
 * @dependency ResizeObserver - For automatic container sizing
 */
export class AgSparkline extends LitElement {
    static properties = {
        data: { type: Array },
        data2: { type: Array },
        maxPoints: { type: Number, attribute: 'max-points' },
        lineColor: { type: String, attribute: 'line-color' },
        fillColor: { type: String, attribute: 'fill-color' },
        secondLineColor: { type: String, attribute: 'second-line-color' },
        activityLevel: { type: String, attribute: 'activity-level' },
        lineWidth: { type: Number, attribute: 'line-width' },
        minValue: { type: Number, attribute: 'min-value' },
        maxValue: { type: Number, attribute: 'max-value' },
        autoScale: { type: Boolean, attribute: 'auto-scale' },
        showGrid: { type: Boolean, attribute: 'show-grid' },
        smooth: { type: Boolean },
        variant: { type: String },
        slots: { type: Number },
        captionStart: { type: String, attribute: 'caption-start' },
        captionEnd: { type: String, attribute: 'caption-end' },
        width: { type: Number, state: true },
        height: { type: Number, state: true }
    };

    constructor() {
        super();
        this.data = [];
        this.data2 = null;
        this.maxPoints = 60;
        // null = the variant's own default (2 for 'line', 1.25 for 'area').
        this.lineWidth = null;
        this.variant = 'line';
        this.slots = 0;
        this.captionStart = '';
        this.captionEnd = '';
        this.minValue = 0;
        this.maxValue = 100;
        this.autoScale = false;
        this.showGrid = false;
        this.smooth = true;
        this.activityLevel = '';
        this.secondLineColor = null;

        // Internal state
        this.width = 100;
        this.height = 40;
        this._gradientId = `spk-${Math.random().toString(36).substr(2, 6)}`;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Layout styles now handled by CSS (components/sparkline.css)
    }

    firstUpdated() {
        // Observe the component itself (which is inside the parent's container)
        if (this) {
            this._resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    this.width = entry.contentRect.width || 100;
                    this.height = entry.contentRect.height || 40;
                }
            });
            this._resizeObserver.observe(this);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
    }

    /**
     * Public API equivalent to old SparklineChart.addDataPoint
     */
    addDataPoint(value) {
        // Direct mutation + strict assignment to trigger Lit's data reactivity
        const newData = [...this.data, value];
        if (newData.length > this.maxPoints) {
            newData.shift();
        }
        this.data = newData;
    }

    _getEffectiveColors() {
        const bodyStyle = getComputedStyle(document.body);
        let effLine = this.lineColor;
        let effFill = this.fillColor;

        // Try to evaluate CSS variables manually (SVG <stop> tags often fail to parse them)
        const resolveVar = (val) => {
            if (val && val.includes('var(')) {
                const match = val.match(/var\((--[^,)]+)(?:,\s*([^)]+))?\)/);
                if (match) {
                    const resolved = bodyStyle.getPropertyValue(match[1]).trim();
                    return resolved || match[2] || val;
                }
            }
            return val;
        };

        effLine = resolveVar(effLine) || bodyStyle.getPropertyValue('--chart-cpu').trim() || '#000000';
        effFill = resolveVar(effFill) || bodyStyle.getPropertyValue('--chart-cpu-bg').trim() || 'rgba(85, 85, 85, 0.12)';

        return { line: effLine, fill: effFill };
    }

    _getScaleRange() {
        if (this.autoScale && this.data.length > 0) {
            const allData = this.data2?.length ? [...this.data, ...this.data2] : this.data;
            const min = Math.min(...allData);
            const max = Math.max(...allData);
            const range = max - min;

            const minScale = Math.max(max * 0.5, 1);
            const effectiveRange = Math.max(range, minScale);
            const padding = effectiveRange * 0.05;

            return {
                min: Math.max(0, min - padding),
                max: max + padding
            };
        }
        return { min: this.minValue, max: this.maxValue };
    }

    _calculatePoints(minVal, valueRange, dataset = this.data) {
        const padding = 4;
        const chartWidth = this.width - (padding * 2);
        const chartHeight = this.height - (padding * 2);
        const stepX = dataset.length > 1 ? chartWidth / (dataset.length - 1) : chartWidth;

        return dataset.map((value, index) => {
            const x = padding + (index * stepX);
            const normalizedValue = (value - minVal) / (valueRange || 1);
            const y = padding + chartHeight - (normalizedValue * chartHeight);
            return { x, y };
        });
    }

    _resolveColor(val) {
        if (!val?.includes('var(')) return val;
        const match = val.match(/var\((--[^,)]+)(?:,\s*([^)]+))?\)/);
        if (!match) return val;
        const resolved = getComputedStyle(document.body).getPropertyValue(match[1]).trim();
        return resolved || match[2] || val;
    }

    _generateLinePath(points) {
        if (points.length === 0) return '';
        if (points.length === 1) {
            return `M 0,${points[0].y} L ${this.width},${points[0].y}`;
        }

        if (this.smooth && points.length > 2) {
            let path = `M ${points[0].x},${points[0].y}`;
            for (let i = 0; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                path += ` Q ${points[i].x},${points[i].y} ${xc},${yc}`;
            }
            path += ` L ${points[points.length - 1].x},${points[points.length - 1].y}`;
            return path;
        } else {
            let path = `M ${points[0].x},${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                path += ` L ${points[i].x},${points[i].y}`;
            }
            return path;
        }
    }

    _generateFillPath(points, linePath) {
        if (points.length === 0) return '';
        if (points.length === 1) {
            const y = points[0].y;
            return `${linePath} L ${this.width},${this.height} L 0,${this.height} Z`;
        }
        const lastPoint = points[points.length - 1];
        const firstPoint = points[0];
        return `${linePath} L ${lastPoint.x},${this.height} L ${firstPoint.x},${this.height} Z`;
    }

    /**
     * Scale for the 'area' and 'bars' variants: from zero to just above the highest
     * measurement with auto-scale, else the declared min/max.
     * @param {number[]} values - Measured values only.
     * @returns {{lo: number, hi: number}}
     */
    _measuredScale(values) {
        if (!this.autoScale) return { lo: this.minValue, hi: this.maxValue };
        const max = values.length ? Math.max(...values) : 0;
        return { lo: 0, hi: max > 0 ? max * HEADROOM : 1 };
    }

    /**
     * Render the 'area' and 'bars' variants: only what was measured, on a fixed
     * window when `slots` is set, gaps kept, zero-based with auto-scale.
     * @returns {import('lit').TemplateResult}
     */
    _renderMeasured() {
        // Colours go to the CSS `fill` / `stroke` properties, where var() resolves, so
        // there is no JS resolution (a getComputedStyle per draw, on every sample) and a
        // theme change applies at once, not at the next sample.
        const line = this.lineColor || 'var(--chart-cpu)';
        const fill = this.fillColor || 'var(--chart-cpu-bg)';
        const secondLine = this.secondLineColor || line;
        const w = this.width, h = this.height;
        const withSecond = this.variant === 'area' && Array.isArray(this.data2);
        // Both series on one window: without `slots`, the longer one sets it, so a
        // shorter second series lines up under the newest values instead of the left.
        const count = this.slots > 0 ? this.slots
            : Math.max(this.data?.length || 0, withSecond ? this.data2.length : 0, 1);
        const first = placeOnSlots(this.data, count);
        const second = withSecond ? placeOnSlots(this.data2, count) : null;
        const { lo, hi } = this._measuredScale(first.points.concat(second ? second.points : []).map(p => p.value));
        const span = (hi - lo) || 1;
        const hasCaption = !!(this.captionStart || this.captionEnd);
        const slotW = w / count;
        const x = slot => (slot + 0.5) * slotW;
        const baseline = h - 0.5;
        // The newest slot holds a measurement: only then is there a current value to mark.
        const latest = first.points[first.points.length - 1];
        const current = latest && latest.slot === count - 1 ? latest : null;

        const captions = hasCaption ? svg`
            ${this.captionStart ? svg`<text class="sparkline-caption" x="0" y="9">${this.captionStart}</text>` : nothing}
            ${this.captionEnd ? svg`<text class="sparkline-caption" x="${w}" y="9" text-anchor="end">${this.captionEnd}</text>` : nothing}
        ` : nothing;

        let body;
        if (this.variant === 'bars') {
            const top = hasCaption ? CAPTION_BAND : 1, room = baseline - 0.5 - top;
            body = first.points.map(p => {
                const ratio = Math.min(1, Math.max(0, (p.value - lo) / span));
                if (ratio === 0) return nothing;
                const bh = Math.max(1, ratio * room);
                return svg`<rect class=${p === current ? 'sparkline-bar is-last' : 'sparkline-bar'}
                    x="${p.slot * slotW + 0.5}" y="${baseline - 0.5 - bh}"
                    width="${Math.max(1, slotW - 1)}" height="${bh}" style="fill: ${line}"></rect>`;
            });
        } else {
            // Room above the top for the end dot (radius 2) so a peak is not clipped.
            const top = (hasCaption ? CAPTION_BAND : 0) + 3, bottom = h - 1.5;
            const y = v => top + (bottom - top) * (1 - Math.min(1, Math.max(0, (v - lo) / span)));
            const toXY = run => run.map(p => [x(p.slot), y(p.value)]);
            const width = this.lineWidth ?? 1.25;
            const runs = measuredRuns(first.points);
            // A measurement alone between two gaps is still a measurement: a point.
            const point = (p, cls, color, r) => svg`<circle class=${cls} cx="${x(p.slot)}" cy="${y(p.value)}" r="${r}" style="fill: ${color}"></circle>`;
            body = svg`
                ${second ? measuredRuns(second.points).map(r => r.length === 1
                    ? point(r[0], 'sparkline-point-secondary', secondLine, 0.75)
                    : svg`<path class="sparkline-line-secondary" fill="none" stroke-width="1" stroke-linejoin="round"
                        vector-effect="non-scaling-stroke" style="stroke: ${secondLine}"
                        d="M ${toXY(r).map(p => p.join(',')).join(' L ')}"></path>`) : nothing}
                ${runs.map(r => {
                    if (r.length === 1) return r[0] === current ? nothing : point(r[0], 'sparkline-point', line, 1.25);
                    const pts = toXY(r), d = monotonePath(pts);
                    return svg`
                        <path class="sparkline-area" stroke="none" style="fill: ${fill}"
                            d="${d} L ${pts[pts.length - 1][0]},${h - 1} L ${pts[0][0]},${h - 1} Z"></path>
                        <path class="sparkline-line" fill="none" stroke-width="${width}" style="stroke: ${line}"
                            stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" d="${d}"></path>`;
                })}
                ${current ? point(current, 'sparkline-dot', line, 2) : nothing}
            `;
        }

        return html`
            <svg class="sparkline-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
                ${captions}
                <line class="sparkline-baseline" x1="0" x2="${w}" y1="${baseline}" y2="${baseline}"></line>
                ${body}
            </svg>
        `;
    }

    render() {
        if (this.variant === 'area' || this.variant === 'bars') return this._renderMeasured();
        const { line, fill } = this._getEffectiveColors();
        const range = this._getScaleRange();
        const valueRange = range.max - range.min;
        const points = this._calculatePoints(range.min, valueRange);

        let pathLine = '';
        let pathFill = '';
        if (this.data.length > 0) {
            pathLine = this._generateLinePath(points);
            pathFill = this._generateFillPath(points, pathLine);
        }

        // Second series (no fill, line only)
        let pathLine2 = '';
        if (this.data2?.length > 0) {
            const points2 = this._calculatePoints(range.min, valueRange, this.data2);
            pathLine2 = this._generateLinePath(points2);
        }

        const gridLines = [];
        if (this.showGrid) {
            const numLines = 4;
            for (let i = 0; i <= numLines; i++) {
                gridLines.push((this.height / numLines) * i);
            }
        }

        const lineClasses = {
            'sparkline-line': true,
            [`activity-${this.activityLevel}`]: !!this.activityLevel
        };

        const resolvedSecondColor = this.secondLineColor
            ? this._resolveColor(this.secondLineColor)
            : null;

        return html`
            <svg class="sparkline-svg" viewBox="0 0 ${this.width} ${this.height}" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <linearGradient id="${this._gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="${fill}" stop-opacity="1" />
                        <stop offset="100%" stop-color="${fill}" stop-opacity="0.1" />
                    </linearGradient>
                </defs>

                ${this.showGrid ? svg`
                    <g class="sparkline-grid">
                        ${gridLines.map(y => svg`
                            <line x1="0" y1="${y}" x2="${this.width}" y2="${y}" stroke="var(--chart-grid)" stroke-width="1" />
                        `)}
                    </g>
                ` : ''}

                <path class="sparkline-fill" fill="url(#${this._gradientId})" stroke="none" d="${pathFill}"></path>
                <path class=${classMap(lineClasses)} fill="none" stroke="${line}" stroke-width="${this.lineWidth ?? 2}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" d="${pathLine}"></path>
                ${pathLine2 ? svg`
                    <path class="sparkline-line" fill="none" stroke="${resolvedSecondColor || line}" stroke-width="${this.lineWidth ?? 2}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" d="${pathLine2}"></path>
                ` : ''}
            </svg>
        `;
    }
}

customElements.define('ag-sparkline', AgSparkline);
