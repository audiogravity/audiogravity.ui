/**
 * Unit tests for ag-systemd-card.js — the CRITICAL tag, and the colour of the button
 * that removes an override.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    css: () => '',
    nothing: null,
}));
vi.mock('../../auth.js', () => ({ isGuest: () => false }));

import { AgSystemdCard } from './ag-systemd-card.js';
import { flat } from '../../test-utils.js';

/** Render a card for a service, overriding the defaults of an untuned NAA. */
function renderCard(overrides = {}) {
    const el = Object.create(AgSystemdCard.prototype);
    el.service = {
        id: 'naa', name: 'HQPlayer NAA', systemd_unit: 'networkaudiod.service',
        properties: {}, ...overrides,
    };
    return flat(el.render());
}

describe('critical service', () => {
    it('is tagged CRITICAL with a tint, the same tag as on the Services and Config cards', () => {
        expect(renderCard({ critical: true })).toContain('<span class="badge warning subtle">CRITICAL</span>');
    });

    it('is not tagged when the chain can do without it', () => {
        expect(renderCard()).not.toContain('CRITICAL');
    });
});

describe('removing an override', () => {
    it('is orange, like every button that deletes', () => {
        expect(renderCard({ has_override: true })).toMatch(/<button class="tile-action-btn warning"[^>]*>\s*Remove Override/);
    });
});
