import { LitElement, html, css, svg } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { iconMusicNote, iconCrosshair, iconZoomIn, iconZoomOut } from '../../ag-icons.js';
import { renderPipelineNode } from '../atoms/ag-pipeline-node.js';
import { renderPipelineLink } from '../atoms/ag-pipeline-link.js';


/**
 * @module AgAudioPipeline
 * @description Organism component for the audio pipeline visualization.
 * Orchestrates the rendering of nodes and links using functional SVG templates.
 * Supports zoom, pan, manual node dragging, and symmetric port alignment.
 * 
 * @property {Object} pipeline - The pipeline data containing nodes and links.
 * @property {boolean} showAnalogSources - Whether to show analog-only source devices.
 * @property {boolean} showControllers - Whether to show controller devices (iPhone, tablet).
 * @property {number} zoom - Current zoom level (default: 0.8).
 * @property {number} offsetX - X offset for panning.
 * @property {number} offsetY - Y offset for panning.
 * @property {Object} nodePositions - Manual positions for nodes (id -> {x, y}).
 * @property {boolean} showLegend - Whether the legend overlay is visible.
 */
export class AgAudioPipeline extends LitElement {
    static properties = {
        pipeline: { type: Object },
        showAnalogSources: { type: Boolean },
        showControllers: { type: Boolean },
        zoom: { type: Number },
        offsetX: { type: Number },
        offsetY: { type: Number },
        nodePositions: { type: Object },
        showLegend: { type: Boolean },
        showMinimap: { type: Boolean },  // NEW: Toggle minimap visibility
        _isVisible: { type: Boolean, state: true },
        _controlsCollapsed: { type: Boolean, state: true },
        _steeringPopover: { type: Object, state: true },
        showNetworkLinks: { type: Boolean },
        _networkPopover: { type: Object, state: true },
        _selectedNode: { type: Object, state: true },
        _linkBubble: { type: Object, state: true }
    };

    constructor() {
        super();
        this.pipeline = { nodes: [], links: [] };
        this.showAnalogSources = false;
        this.showControllers = false;
        this.zoom = 0.8;
        this.offsetX = 0;
        this.offsetY = 0;
        this.nodePositions = {}; // Stores manual x, y for nodes
        this.showLegend = false;
        this.showMinimap = true;  // NEW: Show minimap by default
        this._isVisible = true;  // OPTIMIZATION: Assume visible initially
        this._steeringPopover = null;  // { portId, deviceId, portLabel, screenX, screenY, node, loading, result }

        this.isDragging = false;
        this.draggingNodeId = null;
        this.dragOffset = { x: 0, y: 0 };
        this._minimapDragging = false;
        this._controlsCollapsed = false;
        this.showNetworkLinks = false;
        this._networkPopover = null;
        this._selectedNode = null;
        this._linkBubble = null;
        this.lastPosition = { x: 0, y: 0 };
        this._mouseDownPos = { x: 0, y: 0 };
        this._mouseDownTarget = null;

        // Throttled bound handler — max 1 re-render/500ms même si le backend envoie plus vite
        const handler = this._handleUpdate.bind(this);
        let _lastCall = 0;
        this._boundHandleUpdate = (e) => {
            const now = Date.now();
            if (now - _lastCall >= 500) {
                _lastCall = now;
                handler(e);
            }
        };

        // OPTIMIZATION: Intersection Observer for animation pause
        this._observer = null;
    }

    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            overflow: hidden;
            user-select: none;
        }

        .pipeline-container {
            position: relative;
            width: 100%;
            height: 100%;
            min-height: 600px;
            background: var(--bg-primary);
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
        }

        .pipeline-container:active {
            cursor: grabbing;
        }

        [data-node-id] { cursor: pointer; }
        [data-link-id]:not([data-link-id=""]) { cursor: pointer; }

        /* Link animations — defined once here, not per-link in ag-pipeline-link.js */
        .link-path.active {
            animation: flow var(--flow-speed, 1s) linear infinite;
        }
        .link-path.active.software {
            stroke-dasharray: 6 6;
        }
        @keyframes flow {
            from { stroke-dashoffset: 24; }
            to { stroke-dashoffset: 0; }
        }

        .svg-canvas {
            width: 100%;
            height: 100%;
            touch-action: none;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--spacing-xl);
            text-align: center;
            color: var(--text-tertiary);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: var(--spacing-md);
            opacity: 0.3;
        }

        .empty-state h3 {
            margin: 0;
            color: var(--text-secondary);
        }

        .controls {
            position: absolute;
            top: var(--spacing-sm);
            right: var(--spacing-sm);
            z-index: 10;
            display: flex;
            flex-direction: column;
            gap: var(--spacing-xs);
            background: var(--bg-secondary);
            backdrop-filter: blur(8px);
            padding: var(--spacing-xs);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow-lg);
        }

        .controls-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 20px;
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            padding: 0;
            align-self: flex-end;
        }

        .controls-toggle:hover {
            color: var(--accent-primary);
        }

        .controls.collapsed .control-group {
            display: none;
        }

        .control-group {
            display: flex;
            align-items: center;
            gap: var(--spacing-xs);
            padding: 4px;
        }

        .zoom-btn {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-primary);
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            transition: all 0.2s;
        }

        .zoom-btn:hover {
            background: var(--bg-tertiary);
            border-color: var(--accent-primary);
        }

        .zoom-value {
            font-size: 10px;
            color: var(--text-secondary);
            min-width: 35px;
            text-align: center;
            font-family: monospace;
        }

        .toggle-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-secondary);
            margin-right: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 34px;
            height: 18px;
            vertical-align: middle;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--bg-tertiary);
            transition: all var(--transition-normal);
            border-radius: 20px;
            border: 1px solid var(--border-color);
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
        }

        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 12px;
            width: 12px;
            left: 2px;
            bottom: 2px;
            background-color: var(--text-tertiary);
            transition: all var(--transition-normal);
            border-radius: 50%;
            box-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }

        input:checked + .toggle-slider {
            background-color: var(--accent-primary-alpha);
            border-color: var(--accent-primary);
        }

        input:checked + .toggle-slider:before {
            transform: translateX(16px);
            background-color: var(--accent-primary);
            box-shadow: 0 0 8px var(--accent-primary);
        }

        /* Legend Styles */
        .legend-overlay {
            position: absolute;
            bottom: var(--spacing-sm);
            left: var(--spacing-sm);
            z-index: 10;
            background: var(--bg-secondary);
            backdrop-filter: blur(12px);
            padding: var(--spacing-md);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow-xl);
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .legend-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--spacing-sm);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: var(--spacing-xs);
        }

        .legend-header h4 {
            margin: 0;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-primary);
        }

        .close-legend {
            cursor: pointer;
            color: var(--text-tertiary);
            font-size: 14px;
        }

        .legend-section {
            margin-bottom: var(--spacing-md);
        }

        .legend-section:last-child {
            margin-bottom: 0;
        }

        .legend-section-title {
            font-size: 10px;
            font-weight: bold;
            color: var(--text-tertiary);
            margin-bottom: var(--spacing-xs);
            text-transform: uppercase;
        }

        .legend-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .legend-color-line {
            width: 20px;
            height: 3px;
            border-radius: 2px;
        }

        .legend-color-line.dashed {
            border-top: 2px dashed;
            height: 0;
            background: none !important;
        }

        /* Minimap styles */
        .minimap {
            position: absolute;
            bottom: var(--spacing-sm);
            right: var(--spacing-sm);
            width: 160px;  /* Réduit de 200px → 160px (-20%) */
            height: 120px; /* Réduit de 150px → 120px (-20%) */
            background: var(--bg-secondary);
            backdrop-filter: blur(8px);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            z-index: 10;
            overflow: hidden;
        }

        .minimap-canvas {
            width: 100%;
            height: 100%;
        }

        .minimap-viewport {
            fill: var(--accent-primary);
            fill-opacity: 0.1;
            stroke: var(--accent-primary);
            stroke-width: 2;
            cursor: pointer;
        }

        .minimap-viewport:hover {
            fill-opacity: 0.2;
        }

        .minimap-node {
            fill: var(--text-secondary);
            opacity: 0.5;
        }

        .minimap-link {
            stroke: var(--text-tertiary);
            stroke-width: 1;
            opacity: 0.3;
        }

        /* Steering popover */
        .steering-backdrop {
            position: fixed;
            inset: 0;
            z-index: 99;
        }

        .steering-popover {
            position: fixed;
            z-index: 100;
            min-width: 220px;
            background: var(--bg-secondary);
            border: 1px solid #6366f1;
            border-radius: var(--radius-md);
            box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.2);
            overflow: hidden;
            font-family: var(--font-family);
        }

        .steering-popover-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(99,102,241,0.12);
            border-bottom: 1px solid rgba(99,102,241,0.2);
            font-size: 11px;
            font-weight: 700;
            color: #a5b4fc;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }

        .steering-popover-header button {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            padding: 0 2px;
        }

        .steering-popover-header button:hover {
            color: var(--text-primary);
        }

        .steering-popover-body {
            padding: 6px 0;
        }

        .steering-service-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            font-size: 12px;
        }

        .steering-service-row:hover {
            background: rgba(255,255,255,0.04);
        }

        .steering-svc-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .steering-svc-label {
            flex: 1;
            color: var(--text-primary);
            font-size: 12px;
        }

        .steering-svc-btn {
            background: rgba(99,102,241,0.15);
            border: 1px solid rgba(99,102,241,0.4);
            border-radius: 4px;
            color: #a5b4fc;
            font-size: 10px;
            font-weight: 600;
            padding: 3px 8px;
            cursor: pointer;
            white-space: nowrap;
        }

        .steering-svc-btn:hover {
            background: rgba(99,102,241,0.3);
            border-color: #6366f1;
            color: #e0e7ff;
        }

        .steering-svc-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .steering-svc-loading {
            font-size: 10px;
            color: var(--text-tertiary);
            font-style: italic;
        }

        .steering-result {
            margin: 4px 12px 6px;
            padding: 5px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
        }

        .steering-result.success {
            background: rgba(16,185,129,0.12);
            border: 1px solid rgba(16,185,129,0.3);
            color: #6ee7b7;
        }

        .steering-result.error {
            background: rgba(239,68,68,0.12);
            border: 1px solid rgba(239,68,68,0.3);
            color: #fca5a5;
        }

        .network-popover {
            position: absolute;
            z-index: 100;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            padding: 10px 12px;
            min-width: 180px;
            font-size: 11px;
            pointer-events: auto;
        }

        .network-popover-title {
            font-size: 10px;
            font-weight: 700;
            color: var(--accent-primary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            padding-bottom: 5px;
            border-bottom: 1px solid var(--border-color);
        }

        .network-popover-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 2px 0;
            color: var(--text-secondary);
        }

        .network-popover-row span:first-child {
            color: var(--text-tertiary);
            font-size: 10px;
        }

        .network-popover-row span:last-child {
            font-family: var(--font-mono, monospace);
            font-size: 10px;
            color: var(--text-primary);
        }

        /* Node detail panel */
        .node-detail-panel {
            position: absolute;
            top: 0;
            left: 0;
            width: 270px;
            height: 100%;
            background: var(--bg-secondary);
            border-left: 1px solid var(--border-color);
            backdrop-filter: blur(12px);
            z-index: 20;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            overflow-x: hidden;
            animation: slideInRight 0.18s ease-out;
            box-shadow: 8px 0 24px rgba(0,0,0,0.35);
        }

        @keyframes slideInRight {
            from { transform: translateX(-100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        .ndp-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-tertiary);
            flex-shrink: 0;
        }

        .ndp-name {
            flex: 1;
            font-size: 12px;
            font-weight: 700;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .ndp-close {
            background: none;
            border: none;
            color: var(--text-tertiary);
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 0 2px;
            flex-shrink: 0;
        }

        .ndp-close:hover { color: var(--text-primary); }

        .ndp-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .ndp-section {
            padding: 9px 12px;
            border-bottom: 1px solid var(--border-color);
        }

        .ndp-section:last-child { border-bottom: none; }

        .ndp-section-title {
            font-size: 9px;
            font-weight: 700;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 7px;
        }

        .ndp-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2px 0;
            gap: 8px;
        }

        .ndp-label {
            color: var(--text-tertiary);
            font-size: 10px;
            flex-shrink: 0;
        }

        .ndp-value {
            color: var(--text-primary);
            font-family: var(--font-mono, monospace);
            font-size: 10px;
            text-align: right;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .ndp-port-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 0;
            font-size: 11px;
        }

        .ndp-port-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .ndp-svc-item {
            padding: 4px 0;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }

        .ndp-svc-item:last-child { border-bottom: none; }

        .ndp-svc-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .ndp-svc-track {
            margin-top: 2px;
            padding-left: 14px;
            font-size: 10px;
            color: var(--text-secondary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Link bubble */
        .link-bubble {
            position: fixed;
            z-index: 100;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            padding: 10px 13px;
            min-width: 200px;
            font-size: 11px;
            pointer-events: auto;
        }

        .link-bubble-title {
            font-size: 10px;
            font-weight: 700;
            color: var(--accent-primary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            padding-bottom: 5px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .link-bubble-title button {
            background: none;
            border: none;
            color: var(--text-tertiary);
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            padding: 0 2px;
        }

        .link-bubble-title button:hover { color: var(--text-primary); }

        .link-bubble-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 2px 0;
        }

        .link-bubble-row span:first-child {
            color: var(--text-tertiary);
            font-size: 10px;
        }

        .link-bubble-row span:last-child {
            font-family: var(--font-mono, monospace);
            font-size: 10px;
            color: var(--text-primary);
        }
    `;

    _handleMouseDown(e) {
        // Always record for click detection in mouseup
        this._mouseDownPos = { x: e.clientX, y: e.clientY };
        this._mouseDownTarget = e.target;

        if (e.target.closest('.controls')) return;
        if (e.target.closest('.steering-popover') || e.target.closest('.steering-backdrop')) return;
        if (e.target.closest('.network-popover')) return;
        if (e.target.closest('.node-detail-panel') || e.target.closest('.link-bubble')) return;
        if (this._networkPopover) { this._networkPopover = null; return; }
        if (this._linkBubble) { this._linkBubble = null; return; }

        // Check if clicking a steerable port button — open steering popover
        const steerTarget = e.target.closest('[data-steerable="true"]');
        if (steerTarget && e.button === 0) {
            const portId = steerTarget.getAttribute('data-port-id');
            const deviceId = steerTarget.getAttribute('data-device-id');
            this._openSteeringPopover(portId, deviceId, e.clientX, e.clientY);
            return;
        }

        // Check if we're clicking a node
        const nodeGroup = e.target.closest('[data-node-id]');
        if (nodeGroup && e.button === 0) {
            this.draggingNodeId = nodeGroup.getAttribute('data-node-id');
            
            // Calculate mouse position in SVG coordinates
            const svgPos = this._getSVGCoordinates(e.clientX, e.clientY);
            const nodePos = this.nodePositions[this.draggingNodeId] || this._getDefaultNodePosition(this.draggingNodeId);
            
            this.dragOffset = {
                x: svgPos.x - nodePos.x,
                y: svgPos.y - nodePos.y
            };
            return;
        }

        if (e.button === 0) {
            this.isDragging = true;
            this.lastPosition = { x: e.clientX, y: e.clientY };
        }
    }

    _handleMouseMove(e) {
        if (this.draggingNodeId) {
            const svgPos = this._getSVGCoordinates(e.clientX, e.clientY);
            this.nodePositions = {
                ...this.nodePositions,
                [this.draggingNodeId]: {
                    x: svgPos.x - this.dragOffset.x,
                    y: svgPos.y - this.dragOffset.y
                }
            };
            return;
        }

        if (!this.isDragging) return;
        
        const dx = e.clientX - this.lastPosition.x;
        const dy = e.clientY - this.lastPosition.y;
        
        this.offsetX += dx;
        this.offsetY += dy;
        
        this.lastPosition = { x: e.clientX, y: e.clientY };
    }

    _handleMouseUp(e) {
        if (e?.type === 'mouseup') {
            const dx = e.clientX - this._mouseDownPos.x;
            const dy = e.clientY - this._mouseDownPos.y;
            if (Math.sqrt(dx * dx + dy * dy) < 6) {
                this._handleClick(e);
            }
        }
        this.isDragging = false;
        this.draggingNodeId = null;
    }

    _handleClick(e) {
        const target = this._mouseDownTarget;
        if (!target) return;

        // Link click (check before node — link hit area may overlap node)
        const linkEl = target.closest('[data-link-id]');
        if (linkEl) {
            const linkId = linkEl.getAttribute('data-link-id');
            if (linkId) {
                this._openLinkBubble(linkId, e.clientX, e.clientY);
                return;
            }
        }

        // Node click (not on steerable port button)
        if (!target.closest('[data-steerable="true"]')) {
            const nodeEl = target.closest('[data-node-id]');
            if (nodeEl) {
                const nodeId = nodeEl.getAttribute('data-node-id');
                this._toggleNodeDetail(nodeId);
                return;
            }
        }

        // Click on empty canvas — close everything
        this._selectedNode = null;
        this._linkBubble = null;
    }

    // Convert screen coordinates to SVG coordinates
    _getSVGCoordinates(clientX, clientY) {
        const svg = this.renderRoot.querySelector('.svg-canvas');
        const rect = svg.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this.offsetX) / this.zoom,
            y: (clientY - rect.top - this.offsetY) / this.zoom
        };
    }

    // Helper to get auto-calculated position if no manual position exists
    _getDefaultNodePosition(nodeId) {
        return this._currentAutoPositions ? this._currentAutoPositions[nodeId] || { x: 0, y: 0 } : { x: 0, y: 0 };
    }

    _handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this._applyZoom(delta);
    }

    _applyZoom(factor) {
        const newZoom = Math.min(Math.max(0.05, this.zoom * factor), 5);
        this.zoom = newZoom;
    }

    _zoomIn() { this._applyZoom(1.1); }
    _zoomOut() { this._applyZoom(0.9); }
    _resetView() {
        this.zoom = 0.8;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    _zoomToFit() {
        const nodes = this._visibleNodes;
        if (!nodes || nodes.length === 0) return;

        const canvasWidth = 2200;
        const canvasHeight = 600;
        const padding = 60;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const n of nodes) {
            let hw, hh;
            if (n.type === 'device') {
                hw = 110;
                hh = (this._deviceDims?.[n.id]?.deviceHeight ?? 150) / 2;
            } else {
                hw = 35;
                hh = 35;
            }
            minX = Math.min(minX, n.x - hw);
            minY = Math.min(minY, n.y - hh);
            maxX = Math.max(maxX, n.x + hw);
            maxY = Math.max(maxY, n.y + hh);
        }

        minX -= padding; minY -= padding;
        maxX += padding; maxY += padding;

        const newZoom = Math.min(
            Math.max(0.05, Math.min(canvasWidth / (maxX - minX), canvasHeight / (maxY - minY))),
            5
        );

        this.zoom = newZoom;
        this.offsetX = canvasWidth / 2 - ((minX + maxX) / 2) * newZoom;
        this.offsetY = canvasHeight / 2 - ((minY + maxY) / 2) * newZoom;
    }

    _resetLayout() {
        this.nodePositions = {};
    }

    // ── Steering ──────────────────────────────────────────────────────────────

    _openSteeringPopover(portId, deviceId, screenX, screenY) {
        const node = (this.pipeline.nodes || []).find(n => n.id === deviceId);
        const portLabel = (node?.outputs || []).find(p => p.id === portId)?.label || portId;
        this._steeringPopover = { portId, deviceId, portLabel, screenX, screenY, node, loading: null, result: null };
    }

    _closeSteeringPopover() {
        this._steeringPopover = null;
    }

    async _callSteeringSwitch(serviceId, outputId) {
        this._steeringPopover = { ...this._steeringPopover, loading: serviceId, result: null };
        try {
            await apiPost('/steering/switch-output', { service: serviceId, output: outputId }, false);
            this._steeringPopover = {
                ...this._steeringPopover,
                loading: null,
                result: { success: true, message: `${serviceId} → ${outputId} OK` }
            };
        } catch (err) {
            this._steeringPopover = {
                ...this._steeringPopover,
                loading: null,
                result: { success: false, message: err.detail || err.message || 'Error' }
            };
        }
    }

    _renderSteeringPopover() {
        const { portId, portLabel, screenX, screenY, deviceId, loading, result } = this._steeringPopover;
        // Toujours utiliser les données fraîches du pipeline pour que les dots se mettent à jour
        const node = (this.pipeline?.nodes || []).find(n => n.id === deviceId) || this._steeringPopover.node;
        const services = node?.internal_services || [];
        // Clamp position so the popover stays visible
        const popX = Math.min(screenX + 14, window.innerWidth - 240);
        const popY = Math.max(screenY - 8, 10);

        return html`
            <div class="steering-backdrop" @mousedown=${this._closeSteeringPopover.bind(this)}></div>
            <div class="steering-popover" style="left: ${popX}px; top: ${popY}px;">
                <div class="steering-popover-header">
                    <span>Steer → ${portLabel}</span>
                    <button @click=${this._closeSteeringPopover.bind(this)}>×</button>
                </div>
                <div class="steering-popover-body">
                    ${services.length === 0 ? html`
                        <div class="steering-service-row" style="color: var(--text-tertiary); font-size: 11px;">No services</div>
                    ` : services.map(svc => {
                        const isLoading = loading === svc.id;
                        // Green dot = service is configured for THIS specific output port
                        const isOnThisPort = svc.current_output === portId;
                        const dotColor = isOnThisPort ? (svc.flow_color || '#10b981') : '#4b5563';
                        return html`
                            <div class="steering-service-row">
                                <div class="steering-svc-dot" style="background: ${dotColor};"></div>
                                <span class="steering-svc-label">${svc.label}</span>
                                ${isLoading
                                    ? html`<span class="steering-svc-loading">steering…</span>`
                                    : html`<button class="steering-svc-btn"
                                                ?disabled=${loading !== null}
                                                @click=${() => this._callSteeringSwitch(svc.id, portId)}>
                                                Steer →
                                            </button>`
                                }
                            </div>
                        `;
                    })}
                    ${result ? html`
                        <div class="steering-result ${result.success ? 'success' : 'error'}">
                            ${result.success ? '✓' : '✗'} ${result.message}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    _renderNetworkPopover() {
        const { ni, nodeName, x, y } = this._networkPopover;
        const popX = Math.min(x + 14, window.innerWidth - 220);
        const popY = Math.max(y - 8, 10);
        const fmt = v => (v != null && v !== '') ? String(v) : '--';
        const isWifi = (ni.connector || '').toLowerCase() === 'antenna';
        return html`
            <div class="network-popover" style="left: ${popX}px; top: ${popY}px;"
                @click=${(e) => e.stopPropagation()}>
                <div class="network-popover-title">${nodeName} — ${ni.label}</div>
                <div class="network-popover-row"><span>IP</span><span>${fmt(ni.ip_address)}</span></div>
                <div class="network-popover-row"><span>MAC</span><span>${fmt(ni.mac_address)}</span></div>
                <div class="network-popover-row"><span>Speed</span><span>${ni.speed_mbps != null ? ni.speed_mbps + ' Mbps' : '--'}</span></div>
                ${isWifi ? html`
                    <div class="network-popover-row"><span>SSID</span><span>${fmt(ni.wifi_ssid)}</span></div>
                    <div class="network-popover-row"><span>RSSI</span><span>${ni.wifi_rssi != null ? ni.wifi_rssi + ' dBm' : '--'}</span></div>
                ` : ''}
            </div>
        `;
    }

    // ── Node detail panel ─────────────────────────────────────────────────────

    _toggleNodeDetail(nodeId) {
        if (this._selectedNode?.id === nodeId) {
            this._selectedNode = null;
        } else {
            this._selectedNode = (this.pipeline.nodes || []).find(n => n.id === nodeId) || null;
        }
        this._linkBubble = null;
    }

    _renderNodeDetailPanel() {
        // Always use fresh pipeline data
        const node = (this.pipeline?.nodes || []).find(n => n.id === this._selectedNode.id) || this._selectedNode;
        const statusColor = node.status === 'active' ? 'var(--color-success)' : 'var(--text-tertiary)';
        const subtitle = node.type === 'device'
            ? `${node.manufacturer || ''} ${node.model || ''}`.trim()
            : node.type;

        return html`
            <div class="node-detail-panel" @mousedown=${(e) => e.stopPropagation()}>
                <div class="ndp-header">
                    <div class="ndp-dot" style="background: ${statusColor}; ${node.status === 'active' ? 'box-shadow: 0 0 4px ' + statusColor + ';' : ''}"></div>
                    <span class="ndp-name" title="${node.name}">${node.name}</span>
                    <button class="ndp-close" @click=${() => { this._selectedNode = null; }}>×</button>
                </div>
                ${subtitle ? html`<div class="ndp-section" style="padding: 5px 12px; font-size: 10px; color: var(--text-tertiary);">${subtitle}</div>` : ''}
                ${node.type === 'device' ? this._renderDeviceDetail(node) : this._renderServiceDetail(node)}
            </div>
        `;
    }

    _renderDeviceDetail(node) {
        const services = node.internal_services || [];
        const inputs = node.inputs || [];
        const outputs = node.outputs || [];
        const snp = (node.metadata || {}).service_now_playing || {};
        const networkIfaces = node.network_interfaces || [];
        const fmt = v => (v != null && v !== '') ? String(v) : '--';

        return html`
            ${services.length > 0 ? html`
                <div class="ndp-section">
                    <div class="ndp-section-title">Services</div>
                    ${services.map(svc => {
                        const np = snp[svc.id];
                        const dotColor = svc.status === 'active' ? (svc.flow_color || 'var(--color-success)') : 'var(--text-tertiary)';
                        const fmtInfo = np ? (np.format || (np.sample_bits && np.sample_rate ? `${np.sample_bits}bit/${(np.sample_rate/1000).toFixed(0)}kHz` : null)) : null;
                        return html`
                            <div class="ndp-svc-item">
                                <div class="ndp-svc-header">
                                    <div class="ndp-dot" style="background: ${dotColor};"></div>
                                    <span>${svc.label}</span>
                                    ${svc.protocol ? html`<span style="color: var(--text-tertiary); font-size: 9px; font-weight: 400;">· ${svc.protocol}</span>` : ''}
                                </div>
                                ${np?.title ? html`
                                    <div class="ndp-svc-track">${np.title}${np.artist ? ` — ${np.artist}` : ''}
                                        ${fmtInfo ? html`<span style="color: var(--color-success);"> · ${fmtInfo}</span>` : ''}
                                    </div>
                                ` : ''}
                                ${svc.current_output ? html`
                                    <div class="ndp-svc-track" style="color: var(--text-tertiary);">→ ${svc.current_output}</div>
                                ` : ''}
                            </div>
                        `;
                    })}
                </div>
            ` : ''}

            ${(inputs.length > 0 || outputs.length > 0) ? html`
                <div class="ndp-section">
                    <div class="ndp-section-title">Ports</div>
                    ${inputs.length > 0 ? html`
                        <div style="font-size: 9px; color: var(--text-tertiary); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Inputs</div>
                        ${inputs.map(port => html`
                            <div class="ndp-port-item">
                                <div class="ndp-port-dot" style="background: ${port.active ? 'var(--color-success)' : 'var(--text-tertiary)'};"></div>
                                <span style="color: var(--text-tertiary); font-size: 9px; text-transform: uppercase; width: 44px; flex-shrink: 0;">${port.connector || ''}</span>
                                <span style="flex: 1; color: var(--text-primary); font-size: 11px;">${port.label}</span>
                                ${port.services?.length ? html`<span style="font-size: 9px; color: var(--text-tertiary);">${port.services.join(', ')}</span>` : ''}
                            </div>
                        `)}
                    ` : ''}
                    ${outputs.length > 0 ? html`
                        <div style="font-size: 9px; color: var(--text-tertiary); margin: ${inputs.length ? 6 : 0}px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">Outputs</div>
                        ${outputs.map(port => html`
                            <div class="ndp-port-item">
                                <div class="ndp-port-dot" style="background: ${port.active ? (port.flow_color || 'var(--color-success)') : 'var(--text-tertiary)'};"></div>
                                <span style="color: var(--text-tertiary); font-size: 9px; text-transform: uppercase; width: 44px; flex-shrink: 0;">${port.connector || ''}</span>
                                <span style="flex: 1; color: var(--text-primary); font-size: 11px;">${port.label}</span>
                                ${port.services?.length ? html`<span style="font-size: 9px; color: var(--text-tertiary);">${port.services.join(', ')}</span>` : ''}
                            </div>
                        `)}
                    ` : ''}
                </div>
            ` : ''}

            ${networkIfaces.length > 0 ? html`
                <div class="ndp-section">
                    <div class="ndp-section-title">Network</div>
                    ${networkIfaces.map((ni, idx) => {
                        const isWifi = (ni.connector || '').toLowerCase() === 'antenna';
                        return html`
                            <div style="${idx > 0 ? 'margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04);' : ''}">
                                <div style="font-size: 10px; font-weight: 600; color: ${ni.active ? 'var(--color-success)' : 'var(--text-secondary)'}; margin-bottom: 3px;">
                                    ${ni.label}${ni.active ? '' : ' ·inactive'}
                                </div>
                                <div class="ndp-row"><span class="ndp-label">IP</span><span class="ndp-value">${fmt(ni.ip_address)}</span></div>
                                <div class="ndp-row"><span class="ndp-label">MAC</span><span class="ndp-value">${fmt(ni.mac_address)}</span></div>
                                ${ni.speed_mbps != null ? html`<div class="ndp-row"><span class="ndp-label">Speed</span><span class="ndp-value">${ni.speed_mbps} Mbps</span></div>` : ''}
                                ${isWifi && ni.wifi_ssid ? html`<div class="ndp-row"><span class="ndp-label">SSID</span><span class="ndp-value">${ni.wifi_ssid}</span></div>` : ''}
                                ${isWifi && ni.wifi_rssi != null ? html`<div class="ndp-row"><span class="ndp-label">RSSI</span><span class="ndp-value">${ni.wifi_rssi} dBm</span></div>` : ''}
                            </div>
                        `;
                    })}
                </div>
            ` : ''}

            ${node.metadata?.now_playing?.title ? html`
                <div class="ndp-section">
                    <div class="ndp-section-title">Now Playing</div>
                    <div style="font-size: 11px; color: var(--text-primary); margin-bottom: 2px;">${node.metadata.now_playing.title}</div>
                    ${node.metadata.now_playing.artist ? html`<div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">${node.metadata.now_playing.artist}</div>` : ''}
                    ${node.metadata.now_playing.format ? html`<div style="font-size: 9px; color: var(--color-success); margin-top: 3px;">${node.metadata.now_playing.format}</div>` : ''}
                </div>
            ` : ''}
        `;
    }

    _renderServiceDetail(node) {
        const meta = node.metadata || {};
        const statusColors = { 'Playing': 'var(--color-success)', 'Paused': 'var(--color-warning)', 'Stopped': 'var(--text-tertiary)' };
        const statusColor = statusColors[meta.playback_status] || 'var(--text-tertiary)';

        return html`
            <div class="ndp-section">
                ${meta.playback_status ? html`
                    <div class="ndp-row">
                        <span class="ndp-label">Status</span>
                        <span style="color: ${statusColor}; font-size: 10px; font-weight: 600;">${meta.playback_status}</span>
                    </div>
                ` : ''}
                ${node.volume != null ? html`
                    <div class="ndp-row"><span class="ndp-label">Volume</span><span class="ndp-value">${node.volume}%</span></div>
                ` : ''}
            </div>
            ${meta.title ? html`
                <div class="ndp-section">
                    <div class="ndp-section-title">Now Playing</div>
                    <div style="font-size: 11px; color: var(--text-primary); margin-bottom: 2px;">${meta.title}</div>
                    ${meta.artist ? html`<div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">${meta.artist}</div>` : ''}
                    ${meta.album ? html`<div style="font-size: 10px; color: var(--text-tertiary); margin-bottom: 4px;">${meta.album}</div>` : ''}
                    ${meta.source_format ? html`<div style="font-size: 9px; color: var(--color-success);">${meta.source_format}</div>` : ''}
                </div>
            ` : ''}
        `;
    }

    // ── Link bubble ───────────────────────────────────────────────────────────

    _openLinkBubble(linkId, screenX, screenY) {
        const parts = linkId.split('__');
        if (parts.length < 3) return;
        const [sourceId, targetId, linkType] = parts;
        const link = (this.pipeline.links || []).find(l =>
            l.source_id === sourceId && l.target_id === targetId && l.link_type === linkType
        );
        if (!link) return;
        let sourceNode = (this.pipeline.nodes || []).find(n => n.id === sourceId);
        if (link.link_type === 'physical' && link.service_name) {
            const feedingSvc = (this.pipeline.nodes || []).find(n => n.type === 'service' && n.name === link.service_name);
            if (feedingSvc) sourceNode = feedingSvc;
        }
        this._linkBubble = { link, sourceNode, screenX, screenY };
        this._selectedNode = null;
    }

    _renderLinkBubble() {
        const { link, sourceNode, screenX, screenY } = this._linkBubble;
        const popX = Math.min(screenX + 14, window.innerWidth - 240);
        const popY = Math.max(screenY - 8, 10);

        const sampleRate = sourceNode?.format?.sample_rate || sourceNode?.metadata?.sample_rate;
        const sampleBits = sourceNode?.format?.sample_bits || sourceNode?.metadata?.sample_bits;
        const formatStr = (sampleRate && sampleBits)
            ? `${sampleBits}bit / ${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)}kHz`
            : null;

        const typeLabel = { alsa: 'ALSA', physical: 'Physical', software: 'Software', internal: 'Internal', network: 'Network', control: 'Control' };
        const title = `${typeLabel[link.link_type] || link.link_type}${link.connector ? ' · ' + link.connector.toUpperCase() : ''}`;

        let latencyColor = 'var(--histogram-excellent)';
        if (link.latency_us >= 500) latencyColor = 'var(--histogram-critical)';
        else if (link.latency_us >= 200) latencyColor = 'var(--histogram-average)';
        else if (link.latency_us >= 50) latencyColor = 'var(--histogram-good)';

        let bufferColor = 'var(--color-success)';
        if (link.buffer_fill_percent >= 90) bufferColor = 'var(--color-error)';
        else if (link.buffer_fill_percent >= 80) bufferColor = 'var(--color-warning)';

        return html`
            <div class="link-bubble" style="left: ${popX}px; top: ${popY}px;"
                @mousedown=${(e) => e.stopPropagation()}>
                <div class="link-bubble-title">
                    <span>${title}</span>
                    <button @click=${() => { this._linkBubble = null; }}>×</button>
                </div>
                ${link.service_name ? html`<div class="link-bubble-row"><span>Service</span><span>${link.service_name}</span></div>` : ''}
                <div class="link-bubble-row"><span>Status</span><span style="color: ${link.active ? 'var(--color-success)' : 'var(--text-tertiary)'};">${link.active ? 'Active' : 'Inactive'}</span></div>
                ${link.active && link.is_bit_perfect ? html`<div class="link-bubble-row"><span>Quality</span><span style="color: var(--color-success);">BIT-PERFECT</span></div>` : ''}
                ${formatStr ? html`<div class="link-bubble-row"><span>Format</span><span style="color: var(--color-success);">${formatStr}</span></div>` : ''}
                ${link.resampling_info ? html`<div class="link-bubble-row"><span>Resampling</span><span style="color: var(--color-error);">${link.resampling_info}</span></div>` : ''}
                ${link.latency_us != null ? html`<div class="link-bubble-row"><span>Latency</span><span style="color: ${latencyColor};">${link.latency_us.toFixed(0)}µs</span></div>` : ''}
                ${link.buffer_fill_percent != null ? html`<div class="link-bubble-row"><span>Buffer</span><span style="color: ${bufferColor};">${link.buffer_fill_percent.toFixed(0)}%</span></div>` : ''}
            </div>
        `;
    }

    // ── Legend / Minimap ───────────────────────────────────────────────────────

    _toggleLegend() {
        this.showLegend = !this.showLegend;
    }

    _toggleMinimap() {
        this.showMinimap = !this.showMinimap;
    }

    _toggleControlsCollapsed() {
        this._controlsCollapsed = !this._controlsCollapsed;
    }

    _toggleNetworkLinks() {
        this.showNetworkLinks = !this.showNetworkLinks;
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('audio-pipeline-update', this._boundHandleUpdate);
        this._fetchInitialState();

        // OPTIMIZATION: Setup Intersection Observer to pause animations when not visible
        this._observer = new IntersectionObserver(([entry]) => {
            this._isVisible = entry.isIntersecting;
            if (!this._isVisible) {
                console.log('[Pipeline] Component hidden - animations paused');
            } else {
                console.log('[Pipeline] Component visible - animations active');
            }
        }, {
            threshold: 0.1  // Trigger when at least 10% visible
        });
        this._observer.observe(this);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('audio-pipeline-update', this._boundHandleUpdate);

        // OPTIMIZATION: Cleanup observer
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }

    _handleUpdate(e) {
        const oldPipeline = this.pipeline;
        const newPipeline = e.detail;
        this.pipeline = newPipeline;

        // Change detection for history
        if (oldPipeline && newPipeline && oldPipeline.nodes && newPipeline.nodes) {
            import('../../history.js').then(m => {
                const oldNodes = oldPipeline.nodes;
                const newNodes = newPipeline.nodes;

                newNodes.forEach(node => {
                    const oldNode = oldNodes.find(on => on.id === node.id);
                    if (!oldNode) {
                        m.addToHistory('audio_pipeline', `Source '${node.name}' started playback`, true);
                    } else if (node.metadata?.title && node.metadata?.title !== oldNode.metadata?.title) {
                        m.addToHistory('audio_pipeline', `Now playing on '${node.name}': ${node.metadata.artist || 'Unknown'} - ${node.metadata.title}`, true);
                    }
                });

                oldNodes.forEach(node => {
                    if (!newNodes.some(nn => nn.id === node.id)) {
                        m.addToHistory('audio_pipeline', `Source '${node.name}' stopped playback`, true);
                    }
                });
            }).catch(err => console.error('History import failed:', err));
        }
    }

    async _fetchInitialState() {
        try {
            const data = await apiGet('/audio_pipeline/current');
            if (data) {
                this.pipeline = data;
                
                // Also record initial active sources in history if any
                if (data.nodes && data.nodes.length > 0) {
                    import('../../history.js').then(m => {
                        data.nodes.filter(n => n.type === 'source').forEach(node => {
                            m.addToHistory('audio_pipeline', `Source '${node.name}' is already active`, true);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Failed to fetch initial pipeline state:', error);
        }
    }

    render() {
        if (!this.pipeline || !this.pipeline.nodes || this.pipeline.nodes.length === 0) {
            return html`
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.3;">
                        ${iconMusicNote}
                    </svg>
                    <h3>Pipeline Inactive</h3>
                    <p>No audio sources detected at the moment.</p>
                </div>
            `;
        }

        // Shallow-clone nodes so layout mutations (x, y, width, height) never
        // touch the original pipeline data owned by this.pipeline.
        let nodes = (this.pipeline.nodes || []).map(n => ({ ...n }));
        let links = this.pipeline.links || [];

        // Filter out inactive PHYSICAL sources if toggle is off
        // Physical sources = turntable, tuner, CD player (NOT the streamer or services)
        if (!this.showAnalogSources) {
            const inactivePhysicalSourceIds = new Set(
                nodes
                    .filter(n => {
                        // Only filter physical input devices (turntable, tuner, CD)
                        // Exclude streamer (it has outputs, not just inputs)
                        if (n.type === 'device' && n.device_type === 'source' && n.status === 'inactive') {
                            // Check if this is a true physical INPUT source (no outputs to DAC/amp)
                            // Streamer has outputs (usb, digital), physical sources only have output to amp
                            const outputs = n.outputs || [];
                            const hasDigitalOutputs = outputs.some(p =>
                                ['usb', 'digital', 'toslink', 'optical'].includes(p.connector?.toLowerCase())
                            );
                            // If it has digital outputs, it's the streamer -> keep it
                            return !hasDigitalOutputs;
                        }
                        return false;
                    })
                    .map(n => n.id)
            );

            // Remove inactive physical source nodes only
            nodes = nodes.filter(n => !inactivePhysicalSourceIds.has(n.id));

            // Remove links connected to inactive physical sources
            links = links.filter(l => !inactivePhysicalSourceIds.has(l.source_id) && !inactivePhysicalSourceIds.has(l.target_id));
        }

        // Filter out controller devices (iPhone, tablet) if toggle is off
        if (!this.showControllers) {
            const controllerIds = new Set(
                nodes.filter(n => n.type === 'device' && n.device_type === 'controller').map(n => n.id)
            );
            nodes = nodes.filter(n => !controllerIds.has(n.id));
            links = links.filter(l => !controllerIds.has(l.source_id) && !controllerIds.has(l.target_id));
        }

        // New layout for DEVICE-based topology
        // Services (MPD, AirPlay, etc.) are now displayed inside the streamer node
        // as internal_services — hide them as standalone nodes.
        const serviceNodeIds = new Set(
            nodes.filter(n => n.type === 'service' || n.type === 'source').map(n => n.id)
        );
        // Build set of internal service IDs per device ("device_id:svc_id")
        const internalServicePortIds = new Set();
        nodes.forEach(n => {
            (n.internal_services || []).forEach(svc => internalServicePortIds.add(`${n.id}:${svc.id}`));
        });

        // Hide software links (services are shown as internal_services inside device nodes)
        links = links.filter(l => l.link_type !== 'software');

        // Single-pass node indexing (replaces 12 sequential .filter() calls)
        const processors = [];
        const alsaOutputs = [];
        const devices = [];
        const devicesByType = {
            controller: [], server: [], storage: [], streamer: [],
            source: [], converter: [], amplifier: [], output: [], endpoint: [],
        };
        for (const n of nodes) {
            if (n.type === 'processing') processors.push(n);
            else if (n.type === 'alsa_output') alsaOutputs.push(n);
            else if (n.type === 'device') {
                devices.push(n);
                if (n.device_type in devicesByType) devicesByType[n.device_type].push(n);
            }
        }

        const canvasWidth = 2200;
        const canvasHeight = 600;

        const positions = {};

        const calculateY = (index, total, height, topPad = 0) => {
            const spacing = (height - topPad) / (total + 1);
            return topPad + spacing * (index + 1);
        };

        // Helper to get auto-calculated position if no manual position exists
        this._currentAutoPositions = positions;

        // Position processors (hidden unless explicitly present)
        processors.forEach((n, i) => {
            const autoPos = { x: 200, y: calculateY(i, processors.length, canvasHeight) };
            const manualPos = this.nodePositions[n.id];
            n.x = manualPos ? manualPos.x : autoPos.x;
            n.y = manualPos ? manualPos.y : autoPos.y;
            positions[n.id] = { x: n.x, y: n.y };
            n.width = 120;
            n.height = 40;
        });

        // Position ALSA outputs (normally hidden since services are internal)
        alsaOutputs.forEach((n, i) => {
            const autoPos = { x: 200, y: calculateY(i, alsaOutputs.length, canvasHeight) };
            const manualPos = this.nodePositions[n.id];
            n.x = manualPos ? manualPos.x : autoPos.x;
            n.y = manualPos ? manualPos.y : autoPos.y;
            positions[n.id] = { x: n.x, y: n.y };
            n.width = 60;
            n.height = 60;
        });

        // Column X positions for each device type
        const deviceColumnX = {
            controller: 180,
            server:     420,
            storage:    420,   // same column as server, stacked vertically
            streamer:   680,
            source:     680,   // physical sources share column with streamer (stacked)
            converter:  1060,
            amplifier:  1440,
            output:     1820,
            endpoint:   2100,
        };

        // Group types that share the same X column to avoid overlap
        const columnGroups = {};
        Object.entries(devicesByType).forEach(([dtype, devicesOfType]) => {
            if (devicesOfType.length === 0) return;
            const colX = deviceColumnX[dtype] || 680;
            if (!columnGroups[colX]) columnGroups[colX] = [];
            devicesOfType.forEach(n => columnGroups[colX].push(n));
        });

        Object.entries(columnGroups).forEach(([colX, devicesInCol]) => {
            devicesInCol.forEach((n, i) => {
                const autoPos = { x: Number(colX), y: calculateY(i, devicesInCol.length, canvasHeight) };
                const manualPos = this.nodePositions[n.id];
                n.x = manualPos ? manualPos.x : autoPos.x;
                n.y = manualPos ? manualPos.y : autoPos.y;
                positions[n.id] = { x: n.x, y: n.y };
            });
        });

        // Pre-build lookup structures for link rendering (computed once, not per-link)
        const nodesById = Object.fromEntries(nodes.map(n => [n.id, n]));
        const _hdr = 45, _portH = 28, _baseSvcH = 20, _trackH = 16;
        const deviceDims = {};
        for (const n of nodes) {
            if (n.type !== 'device') continue;
            const svcs = n.internal_services || [];
            const snp = (n.metadata || {}).service_now_playing || {};
            const servicesSectionHeight = svcs.length > 0
                ? svcs.reduce((h, svc) => h + _baseSvcH + (snp[svc.id]?.title ? _trackH : 0), 16)
                : 0;
            const networkSectionHeight = (n.network_interfaces || []).length > 0 ? 26 : 0;
            const nowPlayingSectionHeight = (n.device_type === 'server' && n.metadata?.now_playing?.title) ? 46 : 0;
            const maxPorts = Math.max((n.inputs || []).length, (n.outputs || []).length, 1);
            deviceDims[n.id] = {
                deviceHeight: _hdr + servicesSectionHeight + nowPlayingSectionHeight + maxPorts * _portH + networkSectionHeight + 10,
                servicesSectionHeight,
                nowPlayingSectionHeight,
            };
        }

        // Cache for _zoomToFit()
        this._deviceDims = deviceDims;
        this._visibleNodes = nodes.filter(n => !serviceNodeIds.has(n.id));

        return html`
            <div class="pipeline-container" 
                @mousedown=${this._handleMouseDown} 
                @mousemove=${this._handleMouseMove} 
                @mouseup=${this._handleMouseUp}
                @mouseleave=${this._handleMouseUp}
                @wheel=${this._handleWheel}>
                
                <!-- Controls -->
                <div class="controls ${this._controlsCollapsed ? 'collapsed' : ''}">
                    <button class="controls-toggle" @click=${this._toggleControlsCollapsed} title="${this._controlsCollapsed ? 'Expand controls' : 'Collapse controls'}">${this._controlsCollapsed ? '›' : '‹'}</button>
                    <div class="control-group">
                        <button class="zoom-btn" @click=${this._zoomIn} title="Zoom In"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconZoomIn}</svg></button>
                        <span class="zoom-value">${Math.round(this.zoom * 100)}%</span>
                        <button class="zoom-btn" @click=${this._zoomOut} title="Zoom Out"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconZoomOut}</svg></button>
                        <button class="zoom-btn" @click=${this._zoomToFit} title="Zoom to fit" style="font-size: 8px; font-weight: 700;">FIT</button>
                        <button class="zoom-btn" @click=${this._resetView} title="Reset Zoom/Pan">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconCrosshair}</svg>
                        </button>
                    </div>

                    <div class="control-group" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px; flex-wrap: wrap; gap: 2px;">
                        <button class="zoom-btn" @click=${this._resetLayout} title="Reset Layout" style="flex: 1 1 calc(50% - 1px); font-size: 7px;">RESET</button>
                        <button class="zoom-btn" @click=${this._toggleLegend} title="Legend" style="flex: 1 1 calc(50% - 1px); font-size: 7px; background: var(--accent-primary-alpha); color: var(--accent-primary);">LEGEND</button>
                        <button class="zoom-btn" @click=${this._toggleMinimap} title="Minimap" style="flex: 1 1 calc(50% - 1px); font-size: 7px; background: ${this.showMinimap ? 'var(--accent-primary-alpha)' : 'var(--bg-tertiary)'}; color: ${this.showMinimap ? 'var(--accent-primary)' : 'var(--text-primary)'};">MINIMAP</button>
                        <button class="zoom-btn" @click=${this._toggleNetworkLinks} title="Network links" style="flex: 1 1 calc(50% - 1px); font-size: 7px; background: ${this.showNetworkLinks ? 'var(--accent-primary-alpha)' : 'var(--bg-tertiary)'}; color: ${this.showNetworkLinks ? 'var(--accent-primary)' : 'var(--text-primary)'};">NETWORK</button>
                    </div>

                    <div class="control-group" style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 8px;">
                        <span class="toggle-label">Analog sources</span>
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                .checked=${this.showAnalogSources}
                                @change=${(e) => { this.showAnalogSources = e.target.checked; }}
                            />
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="control-group">
                        <span class="toggle-label">Controllers</span>
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                .checked=${this.showControllers}
                                @change=${(e) => { this.showControllers = e.target.checked; }}
                            />
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>

                <svg class="svg-canvas" viewBox="0 0 ${canvasWidth} ${canvasHeight}" preserveAspectRatio="xMidYMid meet"
                    @network-interface-click=${(e) => {
                        const { ni, nodeId, nodeName, screenX, screenY } = e.detail;
                        this._networkPopover = { ni, nodeId, nodeName, x: screenX, y: screenY };
                    }}
                    @click=${(e) => { if (!e.target.closest('[data-ni]')) this._networkPopover = null; }}>
                    <g transform="translate(${this.offsetX}, ${this.offsetY}) scale(${this.zoom})">
                        <!-- Network links (behind audio links) -->
                        ${this.showNetworkLinks ? (() => {
                            const netNodes = nodes.filter(n => (n.network_interfaces || []).length > 0);
                            const result = [];
                            for (let i = 0; i < netNodes.length; i++) {
                                for (let j = i + 1; j < netNodes.length; j++) {
                                    const pa = positions[netNodes[i].id];
                                    const pb = positions[netNodes[j].id];
                                    if (!pa || !pb) continue;
                                    const aActive = (netNodes[i].network_interfaces || []).some(n => n.active);
                                    const bActive = (netNodes[j].network_interfaces || []).some(n => n.active);
                                    const bothActive = aActive && bActive;
                                    result.push(svg`<line
                                        x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"
                                        stroke="${bothActive ? 'rgba(14,165,233,0.45)' : 'rgba(100,116,139,0.25)'}"
                                        stroke-width="${bothActive ? 1.5 : 1}"
                                        stroke-dasharray="5,4"
                                    />`);
                                }
                            }
                            return result;
                        })() : ''}

                        <!-- Links - render inactive first, then active (for proper z-ordering) -->
                        ${links
                            .sort((a, b) => {
                                // Sort: inactive first, active last (so active appears on top)
                                if (a.active === b.active) return 0;
                                return a.active ? 1 : -1;
                            })
                            .map(link => {
                            const start = positions[link.source_id];
                            const end = positions[link.target_id];
                            if (!start || !end) return null;

                            const sourceNode = nodesById[link.source_id];
                            const targetNode = nodesById[link.target_id];

                            // Calculate link end points - handle ports for devices
                            const getPortPosition = (node, portId, isSource) => {
                                if (node.type === 'device') {
                                    // Device with ports - must match ag-pipeline-node.js exactly
                                    const { deviceHeight, servicesSectionHeight, nowPlayingSectionHeight } = deviceDims[node.id];

                                    const ports = isSource ? (node.outputs || []) : (node.inputs || []);
                                    // Use search for specific port OR fallback for software links
                                    let portIndex = ports.findIndex(p => String(p.id) === String(portId));

                                    if (portIndex === -1 && !isSource && (link.link_type === 'software' || link.link_type === 'alsa')) {
                                        // Fallback: point software streams to the first available/active input
                                        portIndex = ports.findIndex(p => p.active);
                                        if (portIndex === -1 && ports.length > 0) {
                                            portIndex = 0;
                                        }
                                    }

                                    if (portIndex === -1) {
                                        // Still not found, use center of the device
                                        return { x: isSource ? 110 : -110, y: 0 };
                                    }

                                    const totalPortsHeight = ports.length * _portH;
                                    const bodyHeight = deviceHeight - _hdr - servicesSectionHeight - nowPlayingSectionHeight - 10;
                                    const startY = _hdr + servicesSectionHeight + nowPlayingSectionHeight + 5 + (bodyHeight - totalPortsHeight) / 2;
                                    const portY_absolute = startY + portIndex * _portH + (_portH / 2);

                                    const portY = portY_absolute - (deviceHeight / 2);
                                    const portX = isSource ? 110 : -110;

                                    return { x: portX, y: portY };
                                } else if (node.type === 'service' || node.type === 'source') {
                                    // Dynamic badge width from ag-pipeline-node.js
                                    const metadata = node.metadata || {};
                                    const trackText = metadata.artist ? `${metadata.artist} - ${metadata.title}` : metadata.title || '';
                                    const maxTextLength = Math.max(node.name.length, trackText.length, (metadata.source_format || '').length);
                                    const badgeWidth = Math.min(350, Math.max(180, maxTextLength * 7 + 60));
                                    return { x: isSource ? badgeWidth / 2 : -badgeWidth / 2, y: 0 };
                                } else if (node.type === 'alsa_output' || node.type === 'output') {
                                    return { x: isSource ? 30 : -30, y: 0 }; // Circle radius
                                } else {
                                    return { x: isSource ? 25 : -25, y: 0 }; // Default
                                }
                            };

                            const sourcePortPos = getPortPosition(sourceNode, link.source_port, true);
                            const targetPortPos = getPortPosition(targetNode, link.target_port, false);

                            // For physical links from streamer, find the service feeding this port
                            let effectiveSourceNode = sourceNode;
                            if (link.link_type === 'physical' && link.service_name) {
                                // Find the service by name (from link enrichment)
                                const feedingService = nodes.find(n =>
                                    n.type === 'service' && n.name === link.service_name
                                );
                                if (feedingService) {
                                    effectiveSourceNode = feedingService;
                                }
                            }

                            const linkData = {
                                sourceX: start.x + sourcePortPos.x,
                                sourceY: start.y + sourcePortPos.y,
                                targetX: end.x + targetPortPos.x,
                                targetY: end.y + targetPortPos.y,
                                active: link.active,
                                bitPerfect: link.is_bit_perfect,
                                resamplingInfo: link.resampling_info,
                                link_type: link.link_type,
                                connector: link.connector,
                                flow_color: link.flow_color,
                                service_name: link.service_name,
                                latency_us: link.latency_us,
                                buffer_fill_percent: link.buffer_fill_percent,
                                // OPTIMIZATION: Pass visibility state for animation control
                                animationsEnabled: this._isVisible,
                                link_id: `${link.source_id}__${link.target_id}__${link.link_type}`
                            };

                            return renderPipelineLink(linkData, effectiveSourceNode);
                        })}

                        <!-- Nodes (service nodes hidden — displayed inside streamer as internal_services) -->
                        ${nodes.filter(n => !serviceNodeIds.has(n.id)).map(node => renderPipelineNode(node))}

                        <!-- Selection highlight overlay -->
                        ${this._selectedNode ? (() => {
                            const sn = nodes.find(n => n.id === this._selectedNode.id);
                            if (!sn) return null;
                            if (sn.type === 'device') {
                                const dims = deviceDims[sn.id];
                                if (!dims) return null;
                                return svg`<rect
                                    x="${sn.x - 113}" y="${sn.y - dims.deviceHeight / 2 - 3}"
                                    width="226" height="${dims.deviceHeight + 6}"
                                    rx="11" fill="none"
                                    stroke="var(--accent-primary)" stroke-width="2"
                                    style="opacity: 0.55; pointer-events: none;"
                                />`;
                            }
                            return svg`<circle cx="${sn.x}" cy="${sn.y}" r="36"
                                fill="none" stroke="var(--accent-primary)" stroke-width="2"
                                style="opacity: 0.55; pointer-events: none;"
                            />`;
                        })() : ''}
                    </g>
                </svg>

                ${this.showLegend ? html`
                    <div class="legend-overlay">
                        <div class="legend-header">
                            <h4>Pipeline Legend</h4>
                            <span class="close-legend" @click=${this._toggleLegend}>&times;</span>
                        </div>

                        <div class="legend-section">
                            <div class="legend-section-title">Links — Type</div>
                            <div class="legend-grid">
                                <div class="legend-item" style="grid-column: span 2;">
                                    <div class="legend-color-line" style="background: var(--color-success); box-shadow: 0 0 5px var(--color-success);"></div>
                                    <span>Audio — bit-perfect · badge: <strong style="color: var(--color-success); font-size: 7px;">BIT-PERFECT · 24bit / 96kHz</strong></span>
                                </div>
                                <div class="legend-item" style="grid-column: span 2;">
                                    <div class="legend-color-line" style="background: repeating-linear-gradient(90deg, var(--color-success) 0px, var(--color-success) 8px, transparent 8px, transparent 12px);"></div>
                                    <span>Audio — network / streaming (Roon, AirPlay…)</span>
                                </div>
                                <div class="legend-item" style="grid-column: span 2;">
                                    <div class="legend-color-line" style="background: repeating-linear-gradient(90deg, var(--color-warning) 0px, var(--color-warning) 5px, transparent 5px, transparent 8px);"></div>
                                    <span>Control — controller → service (dashed amber)</span>
                                </div>
                                <div class="legend-item" style="grid-column: span 2;">
                                    <div class="legend-color-line" style="background: repeating-linear-gradient(90deg, var(--text-tertiary) 0px, var(--text-tertiary) 3px, transparent 3px, transparent 6px);"></div>
                                    <span>Inactive link</span>
                                </div>
                                <div class="legend-item" style="grid-column: span 2;">
                                    <div style="width: 20px; height: 10px; background: linear-gradient(90deg, var(--color-info), var(--color-warning), #8b5cf6); border-radius: 2px;"></div>
                                    <span>Link color = active service (Roon · AirPlay · MPD…)</span>
                                </div>
                            </div>
                        </div>

                        <div class="legend-section">
                            <div class="legend-section-title">Links — Physical Connector</div>
                            <div class="legend-grid">
                                <div class="legend-item">
                                    <div class="legend-color-line" style="background: #22d3ee;"></div>
                                    <span>Optical / Toslink</span>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color-line" style="background: var(--color-info);"></div>
                                    <span>USB</span>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color-line" style="background: #a855f7;"></div>
                                    <span>XLR (Balanced)</span>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color-line" style="background: var(--color-success);"></div>
                                    <span>Ethernet / RJ45</span>
                                </div>
                                <div class="legend-item" style="grid-column: span 2;">
                                    <div class="legend-color-line" style="background: var(--text-secondary);"></div>
                                    <span>Analog (RCA, DIN, banana, speaker wire)</span>
                                </div>
                            </div>
                        </div>

                        <div class="legend-section">
                            <div class="legend-section-title">Device Nodes</div>
                            <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.6;">
                                • <strong>Colored border</strong> — device active<br>
                                • <strong>Service dot</strong> — green = running · gray = stopped<br>
                                • <strong>Port circle</strong> — colored = active port · gray = inactive<br>
                                • <strong>Network footer</strong> — active interface highlighted (click for details)<br>
                                • <strong>Control link label</strong> — name of the service being driven
                            </div>
                        </div>

                        <div class="legend-section">
                            <div class="legend-section-title">Active Link Badges</div>
                            <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.6;">
                                • <strong style="color: var(--color-success);">32bit / 96kHz</strong> — sample format on the link<br>
                                • <strong style="color: var(--histogram-excellent);">XXXµs</strong> — ALSA latency<br>
                                &nbsp;&nbsp;Green &lt;50µs · Blue 50–200µs · Yellow 200–500µs · Red ≥500µs<br>
                                • <strong style="color: var(--color-success);">XX%</strong> — buffer fill (warning ≥80% · critical ≥90%)<br>
                                • Animated particles — real-time audio flow, speed ∝ sample rate
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Minimap -->
                ${this.showMinimap && nodes.length > 0 ? this._renderMinimap(nodes.filter(n => !serviceNodeIds.has(n.id)), links, canvasWidth, canvasHeight) : ''}

                <!-- Steering popover -->
                ${this._steeringPopover ? this._renderSteeringPopover() : ''}

                <!-- Network interface popover -->
                ${this._networkPopover ? this._renderNetworkPopover() : ''}

                <!-- Node detail panel -->
                ${this._selectedNode ? this._renderNodeDetailPanel() : ''}

                <!-- Link detail bubble -->
                ${this._linkBubble ? this._renderLinkBubble() : ''}
            </div>
        `;
    }

    _renderMinimap(nodes, links, canvasWidth, canvasHeight) {
        // Minimap dimensions (réduit de 20%)
        const minimapWidth = 160;  // 200 → 160
        const minimapHeight = 120; // 150 → 120

        // Calculate scale to fit entire canvas in minimap
        const scaleX = minimapWidth / canvasWidth;
        const scaleY = minimapHeight / canvasHeight;

        // Calculate viewport rectangle in minimap coordinates
        // Viewport dimensions in canvas coordinates
        const viewportWidth = canvasWidth / this.zoom;
        const viewportHeight = canvasHeight / this.zoom;

        // Viewport position (center of view, adjusted by offset)
        const viewportX = (canvasWidth / 2) - (this.offsetX / this.zoom) - (viewportWidth / 2);
        const viewportY = (canvasHeight / 2) - (this.offsetY / this.zoom) - (viewportHeight / 2);

        // Scale to minimap
        const mmViewX = viewportX * scaleX;
        const mmViewY = viewportY * scaleY;
        const mmViewW = viewportWidth * scaleX;
        const mmViewH = viewportHeight * scaleY;

        return html`
            <div class="minimap"
                @mousedown=${this._handleMinimapMouseDown}
                @mousemove=${this._handleMinimapMouseMove}
                @mouseup=${this._handleMinimapMouseUp}
                @mouseleave=${this._handleMinimapMouseUp}>
                <svg class="minimap-canvas" viewBox="0 0 ${minimapWidth} ${minimapHeight}" preserveAspectRatio="xMidYMid meet">
                    <!-- Links -->
                    ${links.map(link => {
                        const sourceNode = nodes.find(n => n.id === link.source_id);
                        const targetNode = nodes.find(n => n.id === link.target_id);
                        if (!sourceNode || !targetNode) return null;

                        return svg`
                            <line
                                class="minimap-link"
                                x1="${sourceNode.x * scaleX}"
                                y1="${sourceNode.y * scaleY}"
                                x2="${targetNode.x * scaleX}"
                                y2="${targetNode.y * scaleY}"
                            />
                        `;
                    })}

                    <!-- Nodes -->
                    ${nodes.map(node => svg`
                        <rect
                            class="minimap-node"
                            x="${(node.x - 10) * scaleX}"
                            y="${(node.y - 10) * scaleY}"
                            width="${20 * scaleX}"
                            height="${20 * scaleY}"
                            rx="2"
                        />
                    `)}

                    <!-- Viewport indicator -->
                    <rect
                        class="minimap-viewport"
                        x="${Math.max(0, Math.min(mmViewX, minimapWidth))}"
                        y="${Math.max(0, Math.min(mmViewY, minimapHeight))}"
                        width="${Math.min(mmViewW, minimapWidth)}"
                        height="${Math.min(mmViewH, minimapHeight)}"
                        rx="2"
                    />
                </svg>
            </div>
        `;
    }

    _minimapPanTo(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top) / rect.height;
        const canvasWidth = 2200, canvasHeight = 600;
        this.offsetX = (canvasWidth / 2 - normX * canvasWidth) * this.zoom;
        this.offsetY = (canvasHeight / 2 - normY * canvasHeight) * this.zoom;
    }

    _handleMinimapMouseDown(e) {
        this._minimapDragging = true;
        this._minimapPanTo(e);
        e.preventDefault();
    }

    _handleMinimapMouseMove(e) {
        if (!this._minimapDragging) return;
        this._minimapPanTo(e);
    }

    _handleMinimapMouseUp() {
        this._minimapDragging = false;
    }
}

customElements.define('ag-audio-pipeline', AgAudioPipeline);
