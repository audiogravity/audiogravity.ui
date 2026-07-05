/**
 * Unit tests for ag-config-card.js — edit event and provisioning state.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../ag-icons.js', () => ({ iconDownload: '' }));
vi.mock('../atoms/ag-audio-output.js', () => ({ AgAudioOutput: class {} }));
vi.mock('../../auth.js', () => ({ isGuest: () => false }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn() }));

import { AgConfigCard } from './ag-config-card.js';

function makeCard() {
    const el = Object.create(AgConfigCard.prototype);
    el.service = { id: 'mpd', displayName: 'MPD', path: '/etc/mpd.conf' };
    el.dispatchEvent = vi.fn();
    return el;
}

describe('handleEdit', () => {
    it('dispatches a bubbling edit-config event with the service id', () => {
        const el = makeCard();
        el.handleEdit({ stopPropagation: vi.fn() });
        expect(el.dispatchEvent).toHaveBeenCalledTimes(1);
        const evt = el.dispatchEvent.mock.calls[0][0];
        expect(evt.type).toBe('edit-config');
        expect(evt.detail).toEqual({ serviceId: 'mpd' });
        expect(evt.bubbles).toBe(true);
        expect(evt.composed).toBe(true);
    });

    it('stops propagation so the tile click does not also fire', () => {
        const el = makeCard();
        const stop = vi.fn();
        el.handleEdit({ stopPropagation: stop });
        expect(stop).toHaveBeenCalled();
    });
});

describe('provisioning state defaults', () => {
    it('defaults provisionable and configured to false', () => {
        const el = new AgConfigCard();
        expect(el.provisionable).toBe(false);
        expect(el.configured).toBe(false);
    });
});
