import { html } from 'lit';
import './ag-orientation-gate.js';

export default {
    title: 'Organisms/OrientationGate',
    component: 'ag-orientation-gate',
};

/**
 * In the app the gate is hidden and only revealed by CSS when an installed PWA is
 * shown in landscape on a phone/tablet with the portrait lock enabled. This story
 * forces it visible (inline, non-fixed) so the prompt can be previewed.
 */
export const Preview = () => html`
    <style>
        .sb-gate-preview .orientation-gate {
            display: flex !important;
            position: static !important;
            min-height: 340px;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
        }
    </style>
    <div class="sb-gate-preview">
        <ag-orientation-gate></ag-orientation-gate>
    </div>
`;
