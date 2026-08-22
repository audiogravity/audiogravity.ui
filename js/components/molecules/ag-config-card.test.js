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
import { flat } from '../../test-utils.js';

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


/** Render a tile for a service, overriding the defaults of a healthy mpd. */
function renderCard(overrides = {}) {
    const el = Object.create(AgConfigCard.prototype);
    el.service = {
        id: 'mpd',
        displayName: 'MPD',
        path: '/etc/mpd.conf',
        status: 'active',
        fileMtime: '2026-08-20T10:00:00Z',
        backupCount: 2,
        isInstalled: true,
        ...overrides,
    };
    el.provisionable = true;
    el.configured = true;
    return flat(el.render());
}

/**
 * Index just past the closing tag of .service-body in a rendered tile.
 *
 * Counts tag depth rather than looking for the next `</div>`: the body holds
 * inner divs, so the first closing tag is not its own, and anything checked
 * against it would pass while sitting inside the body.
 *
 * @param {string} out - Flattened tile markup.
 * @returns {number} Index of the body's own closing tag, or -1.
 */
function endOfBody(out) {
    // Anchored on the opening tag, not on the class name: starting mid-tag makes
    // the walk count the body's children only, and the first balanced pair is
    // then an inner div — which is how this helper's own first version reported
    // the body as ending before it did.
    const body = out.indexOf('<div class="service-body"');
    if (body === -1) return -1;
    let depth = 0;
    for (const m of out.slice(body).matchAll(/<div\b|<\/div>/g)) {
        depth += m[0] === '</div>' ? -1 : 1;
        if (depth === 0) return body + m.index;
    }
    return -1;
}

/** A removed package, conffile and backups gone with it — the ordinary case. */
const GONE = { isInstalled: false, fileExists: false, fileMtime: null, backupCount: 0, audioOutput: null };

/** The class that drives the greyed-out CSS, as written on the tile itself. */
const TILE_UNAVAILABLE = /class="config-tile[^"]*\bunavailable\b/;

describe('missing package', () => {
    it('greys the tile out, like the Services and Profiles tabs do', () => {
        // Matched on the tile's own class list: a bare toContain('unavailable')
        // is also satisfied by the hint's config-unavailable-hint class, so it
        // would stay green with the CSS-driving class removed.
        expect(renderCard(GONE)).toMatch(TILE_UNAVAILABLE);
        expect(renderCard()).not.toMatch(TILE_UNAVAILABLE);
    });

    it('says the package is absent rather than leaving the tile blank', () => {
        const out = renderCard(GONE);
        expect(out).toContain('UNAVAILABLE');
        expect(out).toContain('Package not installed');
    });

    it('points at the tab where the package is installed', () => {
        expect(renderCard(GONE)).toContain('#audio-software');
    });

    it('keeps the explanation out of the faded part of the tile', () => {
        // The fade lives on .service-body, so the hint must not be inside it —
        // under it the text measures 2.16:1 against 4.5:1 for AA.
        const out = renderCard(GONE);
        const bodyEnd = endOfBody(out);
        expect(bodyEnd).toBeGreaterThan(-1);
        expect(out.indexOf('config-unavailable-hint')).toBeGreaterThan(bodyEnd);
    });

    it('drops the badges that would describe a service that is not there', () => {
        const out = renderCard(GONE);
        expect(out).not.toContain('RUNNING');
        expect(out).not.toContain('CONFIGURED');
    });

    it('disables editing and downloading a file that is not there', () => {
        // Asserted on the true form only: `flat` renders false as the empty
        // string, so "?disabled=false" never appears and a not.toContain on it
        // would stay green with the binding deleted outright.
        const out = renderCard(GONE);
        expect(out.match(/\?disabled=true/g)).toHaveLength(2);
        expect(renderCard()).not.toContain('?disabled=true');
    });

    it('keeps the tile usable when the backend did not say either way', () => {
        // Undefined means "could not tell", never "your software is gone".
        const out = renderCard({ isInstalled: undefined });
        expect(out).not.toContain('UNAVAILABLE');
        expect(out).toContain('RUNNING');
    });
});

describe('package removed but its configuration file left behind', () => {
    // `apt remove` without --purge keeps the conffile. The badge follows the
    // package; the buttons follow the file.
    const LEFTOVER = { isInstalled: false };

    it('still says the package is gone', () => {
        expect(renderCard(LEFTOVER)).toContain('UNAVAILABLE');
    });

    it('does not claim the file does not exist', () => {
        const out = renderCard(LEFTOVER);
        expect(out).toContain('only its configuration file is left behind');
        expect(out).not.toContain('does not exist yet');
    });

    it('keeps the file downloadable — it is on the box, whatever became of the package', () => {
        const out = renderCard(LEFTOVER);
        expect(out).toContain('Download config file');
        expect(out).toContain('backups available');
        expect(out).toContain('Modified');
    });

    it('still refuses to configure software that is not there', () => {
        // Saving writes the file and then restarts the service; the restart
        // cannot succeed for an absent package, so offering the editor would
        // invite an action whose second half always fails.
        const out = renderCard(LEFTOVER);
        expect(out.match(/\?disabled=true/g)).toHaveLength(1);
        expect(out).toContain('Package not installed');
    });

    it('does not fade the buttons it deliberately left working', () => {
        // .config-tile.unavailable fades .service-body only, so the footer must
        // sit outside it: an ancestor's opacity cannot be undone by a child, and
        // the sole route to a backup would read at the same 2.16:1 as a dead
        // control — tooltips included.
        const out = renderCard(LEFTOVER);
        const bodyEnd = endOfBody(out);
        expect(bodyEnd).toBeGreaterThan(-1);
        expect(out.indexOf('class="service-footer"')).toBeGreaterThan(bodyEnd);
    });
});

describe('installed service whose configuration file is missing', () => {
    // A conffile deleted by hand, or a package that ships none. The editor is
    // built to create it, so the route to it must stay open.
    const NO_FILE = { fileExists: false, fileMtime: null, backupCount: 0 };

    it('does not mark the tile unavailable', () => {
        expect(renderCard(NO_FILE)).not.toMatch(TILE_UNAVAILABLE);
        expect(renderCard(NO_FILE)).not.toContain('UNAVAILABLE');
    });

    it('still reports what systemd says about the service', () => {
        expect(renderCard(NO_FILE)).toContain('RUNNING');
    });

    it('leaves the editor open so the file can be created', () => {
        // Only the download is refused: there is nothing yet to take off the box.
        const out = renderCard(NO_FILE);
        expect(out.match(/\?disabled=true/g)).toHaveLength(1);
        expect(out).toContain('Configure this service');
        expect(out).toContain('No configuration file on this box');
    });

    it('treats an unknown file state as present rather than disabling anything', () => {
        // The field is absent from an older backend; nothing may be refused on it.
        const out = renderCard({ fileExists: undefined, fileMtime: null });
        expect(out).not.toContain('?disabled=true');
    });
});

describe('systemd state', () => {
    it('shows a stopped service as stopped instead of showing nothing', () => {
        // The tile used to read its state from a list that omits idle units,
        // so an installed-but-stopped service had no badge at all.
        expect(renderCard({ status: 'inactive' })).toContain('STOPPED');
    });

    it('shows a failed service as failed', () => {
        expect(renderCard({ status: 'failed' })).toContain('FAILED');
    });
});
