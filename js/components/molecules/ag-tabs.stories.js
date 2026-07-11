import { html } from 'lit';
import './ag-tabs.js';

export default {
    title: 'Molecules/Tabs',
    component: 'ag-tabs',
    argTypes: {
        activeTab: { control: 'text' }
    },
};

const TABS = [
    { id: 'services',  label: 'Services',  hidden: false, badgeCount: null },
    { id: 'profiles',  label: 'Profiles',  hidden: false, badgeCount: null },
    { id: 'pipeline',  label: 'Pipeline',  hidden: false, badgeCount: null },
    { id: 'system',    label: 'System',    hidden: false, badgeCount: null },
];

const TABS_WITH_BADGE = TABS.map((t, i) =>
    i === 0 ? { ...t, badgeCount: '3', badgeType: 'warning' } : t
);

/* ── Horizontal (default) ─────────────────────────────────────── */
export const Horizontal = () => html`
  <div style="padding: 20px;">
    <ag-tabs
        .tabs="${TABS}"
        .activeTab="services"
        @tab-changed="${(e) => console.log('Tab changed to:', e.detail.active)}">
    </ag-tabs>
  </div>
`;

/* ── Vertical sidebar ─────────────────────────────────────────── */
export const Vertical = () => {
    // Force vertical mode via localStorage before rendering
    localStorage.setItem('tabs-orientation', 'vertical');
    return html`
      <div style="position: relative; height: 300px; overflow: hidden;">
        <ag-tabs
            .tabs="${TABS}"
            .activeTab="profiles">
        </ag-tabs>
        <div style="margin-left: 160px; padding: 20px; color: var(--text-primary);">
          Content area (sidebar overlays on mobile)
        </div>
      </div>
    `;
};

/* ── With badge ───────────────────────────────────────────────── */
export const WithBadge = () => html`
  <div style="padding: 20px;">
    <ag-tabs
        .tabs="${TABS_WITH_BADGE}"
        .activeTab="services"
        @tab-changed="${(e) => console.log('Tab changed to:', e.detail.active)}">
    </ag-tabs>
  </div>
`;

/* ── Update available (Admin tab indicator) ───────────────────── */
const TABS_WITH_ADMIN = [
    ...TABS,
    { id: 'admin', label: 'Admin', hidden: false, badgeCount: null },
];

// The download indicator on the Admin tab is driven by _updateAvailable, which
// ag-tabs normally sets from the update-badge window event (ag-update-banner).
export const UpdateAvailable = () => html`
  <div style="padding: 20px;">
    <ag-tabs
        .tabs="${TABS_WITH_ADMIN}"
        .activeTab="services"
        ._updateAvailable="${true}">
    </ag-tabs>
  </div>
`;

// Mandatory updates use the warning colour instead of the accent.
export const UpdateAvailableMandatory = () => html`
  <div style="padding: 20px;">
    <ag-tabs
        .tabs="${TABS_WITH_ADMIN}"
        .activeTab="services"
        ._updateAvailable="${true}"
        ._updateMandatory="${true}">
    </ag-tabs>
  </div>
`;
