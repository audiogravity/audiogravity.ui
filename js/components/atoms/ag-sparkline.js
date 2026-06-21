/**
 * @module AgSparkline
 * @description Atomic sparkline component using Lit SVG syntax.
 * Replaces old imperative SparklineChart class.
 */

import { LitElement, html, svg } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * Sparkline Chart Web Component
 * @element ag-sparkline
 *
 * @attr {number} max-points - Max number of visible points (default: 60)
 * @attr {string} line-color - Custom line color hex/var
 * @attr {string} fill-color - Custom fill color hex/var
 * @attr {string} activity-level - High/Medium/Low preset colors (CSS class)
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
        width: { type: Number, state: true },
        height: { type: Number, state: true }
    };

    constructor() {
        super();
        this.data = [];
        this.data2 = null;
        this.maxPoints = 60;
        this.lineWidth = 2;
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

    render() {
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
                            <line x1="0" y1="${y}" x2="${this.width}" y2="${y}" stroke="var(--chart-grid, rgba(0,0,0,0.08))" stroke-width="1" />
                        `)}
                    </g>
                ` : ''}

                <path class="sparkline-fill" fill="url(#${this._gradientId})" stroke="none" d="${pathFill}"></path>
                <path class=${classMap(lineClasses)} fill="none" stroke="${line}" stroke-width="${this.lineWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" d="${pathLine}"></path>
                ${pathLine2 ? svg`
                    <path class="sparkline-line" fill="none" stroke="${resolvedSecondColor || line}" stroke-width="${this.lineWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" d="${pathLine2}"></path>
                ` : ''}
            </svg>
        `;
    }
}

customElements.define('ag-sparkline', AgSparkline);
