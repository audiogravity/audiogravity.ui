import { html } from 'lit';
import './ag-theme-toggle.js';

export default {
    title: 'Atoms/ThemeToggle',
    component: 'ag-theme-toggle',
};

/**
 * The button as the login card shows it. It reads the appearance off <html>, so in
 * Storybook it follows whatever the preview is set to and flips it on click — the icon
 * always names where pressing it takes you, never where you are.
 */
export const Default = () => html`<ag-theme-toggle></ag-theme-toggle>`;

/** In its corner of a surface, which is how it is placed on the sign-in card. */
export const InACardCorner = () => html`
  <div style="position:relative;width:280px;height:120px;border:1px solid var(--border-color);
              border-radius:var(--radius-lg);background:var(--bg-secondary)">
    <ag-theme-toggle style="position:absolute;top:8px;right:8px"></ag-theme-toggle>
  </div>
`;
