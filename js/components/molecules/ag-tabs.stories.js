import { html } from 'lit';
import './ag-tabs.js';
import { injectLibStyles } from '../organisms/ag-library-page.js';

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
// The column is a phone's: Storybook runs on a computer, which always gets the bar,
// so the stories of the column set it — and set it open.
export const Vertical = () => {
    return html`
      <div style="position: relative; height: 300px; overflow: hidden;">
        <ag-tabs
            .tabs="${TABS}"
            .activeTab="profiles"
            ._vertical="${true}"
            ._sidebarHidden="${false}">
        </ag-tabs>
        <div style="margin-left: 160px; padding: 20px; color: var(--text-primary);">
          Content area (sidebar overlays on mobile)
        </div>
      </div>
    `;
};

/* ── Vertical, with the library's tab bar under Library ───────── */
const TABS_WITH_LIBRARY = [
    ...TABS,
    { id: 'admin',   label: 'Admin',   hidden: false, badgeCount: null },
    { id: 'library', label: 'Library', hidden: false, badgeCount: null },
];

/**
 * The column carries the library page's own tab bar under its Library entry. Its
 * styles come with the library's (LIB_STYLES), hence injectLibStyles().
 *
 * The bar shows once a tap on Library has unfolded it; a story sets it unfolded.
 *
 * @param {{tab: string, tabs: (Array<string>|null)}} nav - What the page would announce.
 * @param {boolean} [unfolded=true] - Whether Library's bar is unfolded.
 * @returns {HTMLElement} The column, open, with Library shown.
 */
const columnWithLibrary = (nav, unfolded = true) => {
    injectLibStyles();
    const tabs = document.createElement('ag-tabs');
    tabs._vertical = true;
    tabs._sidebarHidden = false;
    tabs.tabs = TABS_WITH_LIBRARY;
    tabs.activeTab = 'library';
    tabs._libNav = nav;
    tabs._licenseStatus = 'lifetime';
    // Storybook's fetch answers no licence, which locks Library — and a locked Library
    // carries no bar. The story keeps the licence it was given.
    tabs._fetchLicenseStatus = async () => {};
    tabs._libOpen = unfolded;
    return tabs;
};

// As the column opens: Library folded, its chevron saying a tap unfolds it.
export const VerticalWithLibraryFolded = () => html`
  <div style="position: relative; height: 560px; overflow: hidden;">
    ${columnWithLibrary({ tab: 'queue', tabs: null }, false)}
  </div>
`;

// Every source but the radio: the five tabs, the one shown highlighted.
export const VerticalWithLibrary = () => html`
  <div style="position: relative; height: 560px; overflow: hidden;">
    ${columnWithLibrary({ tab: 'queue', tabs: null })}
  </div>
`;

// The radio offers three: Browse and Search lead nowhere for stations.
export const VerticalWithLibraryRadio = () => html`
  <div style="position: relative; height: 560px; overflow: hidden;">
    ${columnWithLibrary({ tab: 'radio', tabs: ['queue', 'library', 'radio'] })}
  </div>
`;

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
