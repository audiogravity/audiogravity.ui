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
import { readStylesheet, cssRuleBody, cssRules, flat } from '../../test-utils.js';

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

describe('AgLibrarySourceCard — an input switched off says so', () => {
    // AirPlay or the UPnP bridge stopped read "Idle", the word of one waiting for a
    // stream, while a phone could not even see the box. One not installed is left
    // out by the core and never reaches the card.
    const input = (extra) => ({ id: 'src_shairport-sync', name: 'AirPlay', kind: 'input', status: '', ...extra });

    it('reads "Off" when its software is stopped, with an empty ring and a faded card', () => {
        // Told apart twice (chosen on mock-ups): the indicator's 'off' state draws the
        // ring, the header's 'off' class fades the icon and the name.
        const values = rendered(input({ running: false }));
        expect(values).toContain('Off');
        // Twice: once the indicator's state (the ring), once the header's class (the fade).
        expect(values.filter(v => v === 'off')).toHaveLength(2);
        expect(values).not.toContain('Idle');
        expect(values).not.toContain('down');
    });

    it.each([
        ['running', true],
        ['state unknown', null],
        ['a core that does not send it', undefined],
    ])('reads "Idle" when %s, with the filled grey dot and nothing faded', (_name, running) => {
        const values = rendered(input({ running }));
        expect(values).toContain('Idle');
        expect(values).toContain('down');
        expect(values).not.toContain('Off');
        expect(values).not.toContain('off');
    });

    it('reads "Active" while it plays, whatever an old reading says', () => {
        const values = rendered(input({ status: 'active', running: false }));
        expect(values).toContain('Active');
        expect(values).not.toContain('off');
    });

    it('never says "Off" of a catalogue', () => {
        // Only an input can be switched off from this screen's point of view.
        const values = rendered({ id: 'src_mpd', name: 'Local Library', kind: 'library', status: '', running: false });
        expect(values).not.toContain('Off');
        expect(values).not.toContain('off');
    });
});

describe('AgLibrarySourceCard — how "Off" is drawn', () => {
    const lib = readStylesheet('css', 'components', 'library-sources.css');
    const tile = readStylesheet('css', 'components', 'tile.css');
    const dots = readStylesheet('css', 'components', 'status-indicator.css');
    const declared = (body, property) =>
        body?.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1].trim();

    it('fades the icon and the name as an unavailable tile, the state left out', () => {
        const unavailable = cssRuleBody(tile, '.config-tile.unavailable > .service-body');
        for (const part of ['.lib-src-ic', '.lib-src-name']) {
            const body = cssRules(lib).find(r => r.selectors.includes(`.lib-src-card-hd.off ${part}`))?.body;
            expect(declared(body, 'opacity')).toBe(declared(unavailable, 'opacity'));
            expect(declared(body, 'filter')).toBe(declared(unavailable, 'filter'));
        }
        // The ring and the word must stay readable: nothing fades the indicator.
        expect(lib).not.toMatch(/\.lib-src-card-hd\.off[^{]*(ag-status-indicator|service-state)/);
    });

    it('draws an empty ring in the grey of the filled dot at rest', () => {
        const ring = cssRuleBody(dots, '.profile-status-dot.off');
        const rest = cssRuleBody(dots, '.profile-status.inactive');
        expect(declared(ring, 'background')).toBe('transparent');
        expect(declared(ring, 'box-shadow')).toContain(declared(rest, 'background'));
    });
});

describe('AgLibrarySourceCard — a Pro source on a Starter box', () => {
    const markup = flat;

    const card = (locked, node = { id: 'src_qobuz', name: 'Qobuz', kind: 'streaming', status: 'idle' }) => {
        const el = Object.create(AgLibrarySourceCard.prototype);
        Object.assign(el, { node, active: false, locked, zoneId: '', zoneDisplayName: '' });
        el.dispatchEvent = vi.fn();
        return el;
    };

    it('shows the Pro padlock in place of its state', () => {
        const drawn = markup(card(true).render());
        expect(drawn).toContain('<ag-pro-lock>');
        expect(drawn).not.toContain('<ag-status-indicator');
    });

    it('shows its state when it is not locked', () => {
        const drawn = markup(card(false).render());
        expect(drawn).toContain('<ag-status-indicator');
        expect(drawn).not.toContain('<ag-pro-lock>');
    });

    it('wears the Pro tint when locked, and only then', () => {
        // The tint itself is the brand colour's, pinned in js/pro-tint.test.js.
        expect(markup(card(true).render())).toMatch(/class="lib-src-card[^"]*\blib-src-card--locked\b/);
        expect(markup(card(false).render())).not.toContain('lib-src-card--locked');
    });

    it('opens the licence panel on a tap, and selects nothing', async () => {
        const tabs = document.createElement('ag-tabs');
        tabs.selectTab = vi.fn();
        document.body.appendChild(tabs);
        try {
            const el = card(true);
            await el._toggleExpand();
            expect(tabs.selectTab).toHaveBeenCalledWith('admin', { keepOpen: false });
            expect(el.dispatchEvent).not.toHaveBeenCalled();
        } finally {
            tabs.remove();
        }
    });

    it('does not unfold Roon\'s zones: Roon is Pro', async () => {
        const { getRoonZones } = await import('../../library-store.js');
        getRoonZones.mockClear();
        const el = card(true, { id: 'src_mono-sgen', name: 'Roon', kind: 'roon', status: 'idle' });
        await el._toggleExpand();
        expect(getRoonZones).not.toHaveBeenCalled();
        expect(markup(el.render())).not.toContain('lib-src-chevron');
    });
});
