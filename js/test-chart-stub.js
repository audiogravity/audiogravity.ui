/**
 * A stand-in for Chart.js in unit tests: jsdom has no canvas. It draws nothing and keeps
 * every chart it is given, with its configuration, for the test to read.
 *
 * In a test:
 *     vi.mock('chart.js/auto', () => import('../../test-chart-stub.js'));
 *     import { drawnCharts } from '../../test-chart-stub.js';
 *
 * One file, so that the tests of every chart read the same stand-in (rule 9 — DRY): two
 * copies had already drifted apart (code review, 2026-10-26).
 */

/** Every chart drawn since the module was loaded, oldest first. */
export const drawnCharts = [];

/** Takes Chart's place: records what it is given. */
export default class ChartStub {
    /** Chart.defaults, which the components set (Chart.defaults.color). */
    static defaults = {};

    /**
     * @param {HTMLCanvasElement|object} canvas - What the component draws on.
     * @param {object} config - The chart's configuration: type, data, options.
     */
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        this.data = config.data;
        this.options = config.options;
        drawnCharts.push(this);
    }

    /** Chart.update(): nothing to draw. */
    update() {}

    /** Chart.destroy(): nothing to free. */
    destroy() {}
}
