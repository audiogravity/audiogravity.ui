/**
 * The pipeline's pop-ups render without throwing.
 *
 * Two of them did not. A colour pass renamed a handful of variables that were doing two
 * jobs at once — a stroke and a fill, a border and a label — and in this file the rename
 * landed on one side only: `_renderSteeringPopover` declared `dotColor` and interpolated
 * `${dotFill}`, `_renderNodeDetailPanel` declared `statusFill` and still read
 * `statusColor` in its box-shadow branch.
 *
 * Both are ReferenceErrors thrown out of render(). Neither is survivable in the way a
 * mistaken colour is: `this._steeringPopover` and `this._selectedNode` stay set, so every
 * subsequent render throws too — the whole component stops drawing until the page is
 * reloaded. Opening the steering pop-up, or clicking any active node, was enough.
 *
 * Nothing caught them. The suite mounts nothing, and these branches only run when a
 * pop-up is open; the code reads correctly, which is exactly what a rename that misses one
 * side looks like. So this file does the one thing that finds them: it calls the render
 * methods. Interpolations in a tagged template are evaluated before the tag function runs,
 * so a mocked `html` is enough to make an undefined name throw.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    css: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconMusicNote: '', iconCrosshair: '', iconZoomIn: '', iconZoomOut: '',
}));
vi.mock('../atoms/ag-pipeline-node.js', () => ({ renderPipelineNode: () => '' }));
vi.mock('../atoms/ag-pipeline-link.js', () => ({ renderPipelineLink: () => '' }));

const { AgAudioPipeline } = await import('./ag-audio-pipeline.js');

/**
 * A bare instance — no constructor, no lifecycle, no DOM.
 * @param {object} state
 * @returns {AgAudioPipeline}
 */
const el = (state) => Object.assign(Object.create(AgAudioPipeline.prototype), state);

/** A device node carrying one internal service, which is what the pop-up lists. */
const NODE = {
    id: 'dev1',
    name: 'DAC',
    status: 'active',
    type: 'device',
    manufacturer: 'Acme',
    model: 'X1',
    internal_services: [{ id: 'svc1', label: 'MPD', current_output: 'p1', flow_color: '#10b981' }],
};

describe('the steering pop-up renders', () => {
    const open = (overrides = {}) => el({
        pipeline: { nodes: [NODE] },
        _steeringPopover: {
            portId: 'p1', portLabel: 'Port 1', screenX: 100, screenY: 100,
            deviceId: 'dev1', loading: null, result: null, node: NODE, ...overrides,
        },
        _closeSteeringPopover() {},
        _steerService() {},
    });

    it('with a service on this port — the branch that threw', () => {
        // The dot is green here, which is the interpolation that was reading an undefined
        // name. It has to be a real call: reading the source would only prove the source.
        expect(() => open()._renderSteeringPopover()).not.toThrow();
    });

    it('with a service on another port', () => {
        const host = open();
        host.pipeline.nodes[0].internal_services[0].current_output = 'other';
        expect(() => host._renderSteeringPopover()).not.toThrow();
    });

    it('while a service is being steered', () => {
        expect(() => open({ loading: 'svc1' })._renderSteeringPopover()).not.toThrow();
    });

    it('with no service at all', () => {
        const host = open();
        host.pipeline.nodes[0].internal_services = [];
        expect(() => host._renderSteeringPopover()).not.toThrow();
    });

    it('when the node has gone from the pipeline since the pop-up opened', () => {
        // It falls back to the snapshot taken when it opened; that path has to hold too.
        const host = open();
        host.pipeline.nodes = [];
        expect(() => host._renderSteeringPopover()).not.toThrow();
    });
});

describe('the node detail panel renders', () => {
    const open = (node) => el({
        pipeline: { nodes: [node] },
        _selectedNode: node,
        _closeNodeDetail() {},
    });

    it('for an active node — the branch that threw', () => {
        // Active is the case that carries the box-shadow, and the box-shadow held the
        // undefined name. An inactive node never reached it, which is why clicking around
        // could look fine right up until it did not.
        expect(() => open(NODE)._renderNodeDetailPanel()).not.toThrow();
    });

    it('for an inactive node', () => {
        expect(() => open({ ...NODE, status: 'idle' })._renderNodeDetailPanel()).not.toThrow();
    });

    it('for a node with no manufacturer or model', () => {
        expect(() => open({ id: 'n', name: 'n', status: 'active', type: 'sink' })._renderNodeDetailPanel())
            .not.toThrow();
    });
});
