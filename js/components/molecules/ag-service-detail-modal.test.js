/**
 * Unit tests for ag-service-detail-modal.js — the figures it prints.
 *
 * The modal opens from a card, so the two must agree: where the card shows a
 * dash because nobody measured a figure, the modal cannot print 0. It used to,
 * and the reader clicking a dash was answered with a zero.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: Symbol('nothing'),
}));
vi.mock('./ag-modal.js', () => ({}));

import { AgServiceDetailModal } from './ag-service-detail-modal.js';
import { flat } from '../../test-utils.js';


function modalFor(metrics) {
    const el = Object.create(AgServiceDetailModal.prototype);
    el.service = { name: 'mpd', display_name: 'MPD', state: 'active', metrics };
    el.history = [];
    return el;
}

describe('a figure nobody measured', () => {
    it('is a dash for memory, not a zero', () => {
        const out = flat(modalFor({ cpu_percent: 1, memory_mb: null, tasks: 3 })._renderBody());
        expect(out).toContain('—');
        expect(out).not.toContain('0 MB');
    });

    it('is a dash for the network rates too', () => {
        const el = modalFor({ network_rx_rate: null, network_tx_rate: null });
        expect(el._fmt(null)).toBe('—');
        expect(el._fmt(undefined)).toBe('—');
    });
});

describe('a figure that is genuinely zero', () => {
    it('stays a zero — a stopped service reads nothing, and says so', () => {
        const el = modalFor({ memory_mb: 0, network_rx_rate: 0 });
        expect(el._fmt(0)).toBe('0 B/s');
        expect(flat(el._renderBody())).toContain('0 MB');
    });

    it('prints real figures unchanged', () => {
        const el = modalFor({ cpu_percent: 2.5, memory_mb: 42, network_rx_rate: 1.5 });
        expect(flat(el._renderBody())).toContain('42 MB');
        expect(el._fmt(1.5)).toBe('1.50 MB/s');
    });
});
