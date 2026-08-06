import { html } from 'lit';
import './ag-license-badge.js';

export default {
    title: 'Atoms/LicenseBadge',
    component: 'ag-license-badge',
    argTypes: {
        status: {
            control: 'select',
            options: ['trial', 'lifetime', 'starter', 'expired', 'version_expired', 'tampered', 'no_license'],
        },
        daysRemaining: { control: 'number' },
        expiresAt: { control: 'text' },
        pill: { control: 'boolean' },
    },
};

const Template = (args) => html`
  <ag-license-badge
    status="${args.status}"
    days-remaining="${args.daysRemaining ?? ''}"
    expires-at="${args.expiresAt ?? ''}"
    ?pill="${args.pill}">
  </ag-license-badge>
`;

export const Trial = Template.bind({});
Trial.args = { status: 'trial', daysRemaining: 22, pill: true };

export const Lifetime = Template.bind({});
Lifetime.args = { status: 'lifetime', daysRemaining: null, pill: true };

/** Same status and the same unlocked features, but bought with a term — so the label must
 *  not read "Lifetime" beside a panel saying "active until 31/12/2026". */
export const LicensedWithTerm = Template.bind({});
LicensedWithTerm.args = { status: 'lifetime', expiresAt: '2026-12-31', pill: true };

/** A time-limited licence that reached its end date. Until the component learned this
 *  status, this very story rendered "No license" — it fell through to the default. */
export const Expired = Template.bind({});
Expired.args = { status: 'expired', daysRemaining: 0, pill: false };

export const Starter = Template.bind({});
Starter.args = { status: 'starter', pill: false };

/** Still valid in time, bought for an earlier major version — not the same as Expired. */
export const VersionExpired = Template.bind({});
VersionExpired.args = { status: 'version_expired', pill: false };

export const Tampered = Template.bind({});
Tampered.args = { status: 'tampered', pill: false };
