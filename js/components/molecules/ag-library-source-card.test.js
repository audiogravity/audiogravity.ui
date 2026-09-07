/**
 * Unit tests for ag-library-source-card.
 *
 * What is pinned here is who names a source. The card used to prefer a local
 * table over the name the backend sends, and that override existed for one
 * entry: the core answered "MPD" — the daemon — for the music on the box, while
 * the interface showed "Local Library". The core names the source now, so the
 * card must show what it is given; reintroducing the override could only make
 * the two disagree again, silently.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    // The icon library builds its glyphs with the svg tag at import time.
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
// library-constants reaches the API to refresh the origin labels at startup.
vi.mock('../../api.js', () => ({ apiGet: vi.fn(async () => ({})) }));
vi.mock('../../library-store.js', () => ({ getRoonZones: vi.fn() }));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));
vi.mock('./ag-roon-status.js', () => ({}));

import { AgLibrarySourceCard } from './ag-library-source-card.js';

/** Render a card for one source descriptor and collect its template values. */
function rendered(node) {
    const el = Object.create(AgLibrarySourceCard.prototype);
    Object.assign(el, { node, active: false, zoneId: '', zoneDisplayName: '' });
    el._isRoon = () => false;
    const out = [];
    const walk = (tpl) => {
        if (!tpl || typeof tpl !== 'object') return;
        for (const v of tpl.values ?? []) {
            if (v && typeof v === 'object') walk(v);
            else if (v != null) out.push(v);
        }
    };
    walk(el.render());
    return out;
}

describe('AgLibrarySourceCard — who names the source', () => {
    it('shows the name the core sends', () => {
        expect(rendered({ id: 'src_mpd', name: 'Local Library', status: 'active' }))
            .toContain('Local Library');
    });

    it('does not substitute a name of its own for a known id', () => {
        // The exact shape of the old defect: were the local table still consulted,
        // this would render "Local Library" and hide what the backend answered.
        const values = rendered({ id: 'src_mpd', name: 'MPD', status: 'idle' });
        expect(values).toContain('MPD');
        expect(values).not.toContain('Local Library');
    });

    it('shows a name for a source the interface has never heard of', () => {
        // A source added backend-side must appear without an interface release —
        // the old table answered `undefined` for anything missing from it.
        expect(rendered({ id: 'src_newthing', name: 'New Thing', status: 'idle' }))
            .toContain('New Thing');
    });
});
