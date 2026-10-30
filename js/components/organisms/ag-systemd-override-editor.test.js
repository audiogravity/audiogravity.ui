/**
 * Unit tests for ag-systemd-override-editor — the Audio Optimized preset and MPD.
 *
 * MPD makes its own sound threads real time (SCHED_FIFO 40), and the core publishes that
 * priority with the service's properties (`own_sound_rt_priority`). A real-time priority
 * on the whole service at that level or above ranks every other MPD thread ahead of them:
 * with MPD's output buffer set short by hand, the sound dropped out while MPD read cover
 * art (traced on the x86 box). Logic-only: lit and the component's imports are mocked so
 * the class imports without a DOM; the form is a stand-in holding the field elements the
 * component reads and writes.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('lit/directives/keyed.js', () => ({ keyed: (key, value) => ({ keyed: key, value }) }));
vi.mock('../../ui-helpers.js', () => ({ showConfirm: vi.fn() }));
vi.mock('../molecules/ag-config-diff.js', () => ({}));
vi.mock('../../ag-icons.js', () => ({ iconMusicNote: '', iconUndo: '' }));
vi.mock('./ag-modal.js', () => ({}));

import { AgSystemdOverrideEditor, outranksSound } from './ag-systemd-override-editor.js';

/** Flatten a mocked template to its text, strings interleaved with values. */
const text = (tpl) => {
    if (!tpl || typeof tpl !== 'object') return String(tpl ?? '');
    if (Array.isArray(tpl)) return tpl.map(text).join('');
    if ('keyed' in tpl) return text(tpl.value);
    return (tpl.strings ?? []).reduce((out, s, i) => out + s + text(tpl.values?.[i]), '');
};

/** The services as the Systemd page hands them over: label, unit, and what the core says. */
const MPD = { name: 'Music Player Daemon', systemd_unit: 'mpd.service', own_sound_rt_priority: 40 };
const AIRPLAY = { name: 'AirPlay Receiver', systemd_unit: 'shairport-sync.service', own_sound_rt_priority: null };

/** The form fields the editor touches, as plain objects. */
function makeForm(values = {}) {
    const names = ['cpu_affinity', 'cpu_scheduling_policy', 'cpu_scheduling_priority', 'nice',
        'io_scheduling_class', 'io_scheduling_priority', 'limit_memlock', 'limit_rtprio',
        'memory_max', 'memory_high', 'tasks_max', 'limit_nofile', 'limit_nproc',
        'oom_score_adjust', 'cpu_weight', 'io_accounting', 'ip_accounting'];
    return { elements: Object.fromEntries(names.map(n => [n, { value: values[n] ?? '', checked: false }])) };
}

function makeEl(service, form = makeForm()) {
    return Object.assign(Object.create(AgSystemdOverrideEditor.prototype), {
        isOpen: false, isSaving: false, _outranksSound: false, _opening: 0,
        service: { ...service, properties: {} },
        querySelector: () => form,
    });
}

describe('outranksSound — a priority on the whole service at or above its own sound threads', () => {
    it('MPD at the old preset\'s FIFO 80 is flagged', () => {
        expect(outranksSound(40, 'fifo', 80)).toBe(true);
    });

    it('the same level is flagged: a running thread is not preempted by its equal', () => {
        expect(outranksSound(40, 'rr', '40')).toBe(true);
    });

    it('below its sound threads is fine', () => {
        expect(outranksSound(40, 'rr', 39)).toBe(false);
    });

    it('no real-time policy is fine, whatever the priority field holds', () => {
        expect(outranksSound(40, '', 80)).toBe(false);
        expect(outranksSound(40, 'other', 80)).toBe(false);
    });

    it('a service that does not raise its own threads is left alone', () => {
        expect(outranksSound(null, 'fifo', 80)).toBe(false);
        expect(outranksSound(undefined, 'fifo', 80)).toBe(false);
    });
});

describe('ag-systemd-override-editor — the Audio Optimized preset', () => {
    it('leaves MPD\'s policy and priority empty, and fills the rest', () => {
        const form = makeForm({ cpu_scheduling_policy: 'fifo', cpu_scheduling_priority: '80' });
        const el = makeEl(MPD, form);
        el._applyPreset('audio');
        expect(form.elements.cpu_scheduling_policy.value).toBe('');
        expect(form.elements.cpu_scheduling_priority.value).toBe('');
        expect(form.elements.nice.value).toBe('-10');
        expect(form.elements.limit_rtprio.value).toBe('99');   // lets MPD raise its threads
        expect(form.elements.cpu_weight.value).toBe('1000');
        expect(el._outranksSound).toBe(false);
    });

    it('says what the presets do in the forms\' own help style, not a style of its own', () => {
        const markup = text(makeEl(MPD).render());
        expect(markup).toMatch(/<p class="form-help">\s*Presets fill the form/);
        expect(markup).not.toMatch(/<p style=/);
    });

    it('keeps FIFO 80 for a service that does not raise its own threads', () => {
        const form = makeForm();
        makeEl(AIRPLAY, form)._applyPreset('audio');
        expect(form.elements.cpu_scheduling_policy.value).toBe('fifo');
        expect(form.elements.cpu_scheduling_priority.value).toBe('80');
    });
});

describe('ag-systemd-override-editor — the warning', () => {
    it('shows on opening an MPD already set above its sound threads', () => {
        const el = makeEl(MPD);
        el.open({ ...MPD, properties: { cpu_scheduling_policy: 'fifo', cpu_scheduling_priority: 80 } });
        el.willUpdate(new Map([['service', null]]));   // what Lit runs on the change
        expect(el._outranksSound).toBe(true);
    });

    it('stays away from an MPD as installed', () => {
        const el = makeEl(MPD);
        el._outranksSound = true;
        el.open({ ...MPD, properties: {} });
        el.willUpdate(new Map([['service', null]]));
        expect(el._outranksSound).toBe(false);
    });

    it('is judged again only when the service changes', () => {
        const el = makeEl(MPD);
        el._outranksSound = true;
        el.willUpdate(new Map([['isSaving', false]]));
        expect(el._outranksSound).toBe(true);
    });

    it('follows the fields as they are edited', () => {
        const form = makeForm();
        const el = makeEl(MPD, form);
        form.elements.cpu_scheduling_policy.value = 'rr';
        form.elements.cpu_scheduling_priority.value = '45';
        el._checkSchedulingFields();
        expect(el._outranksSound).toBe(true);
        form.elements.cpu_scheduling_priority.value = '30';
        el._checkSchedulingFields();
        expect(el._outranksSound).toBe(false);
    });

    it('is said in a region that is always there, so a screen reader announces it', () => {
        const el = makeEl(MPD);
        el._outranksSound = false;
        const quiet = text(el.render());
        expect(quiet).toContain('class="form-warning" role="status"');
        expect(quiet).not.toContain('makes its own sound threads');
        el._outranksSound = true;
        const said = text(el.render()).replace(/\s+/g, ' ');   // the template wraps its lines
        expect(said).toContain('Music Player Daemon makes its own sound threads real time, at priority');
        expect(said).toContain('40');
        // What to do must be something the core accepts: a policy left at Default with
        // the priority kept is refused at save.
        expect(said).toContain('Leave the policy and the priority empty');
    });

    it('the fields\' handlers update the editor even when another element runs them', () => {
        // The form is rendered by ag-modal, which runs a bare method reference as itself:
        // the warning then never showed (caught in Chromium). Run each handler as the
        // modal would and look at the editor.
        const form = makeForm({ cpu_scheduling_policy: 'fifo', cpu_scheduling_priority: '80' });
        const el = makeEl(MPD, form);
        const handlers = [];
        const walk = (node) => {
            if (Array.isArray(node)) return node.forEach(walk);
            if (!node || typeof node !== 'object') return;
            if ('keyed' in node) return walk(node.value);
            if (!node.strings) return;
            node.strings.forEach((s, i) => {
                if (/@(change|input)=$/.test(s.trimEnd())) handlers.push(node.values[i]);
            });
            (node.values ?? []).forEach(walk);
        };
        walk(el.render());
        expect(handlers).toHaveLength(2);
        const modal = { querySelector: () => form };
        for (const handler of handlers) {
            el._outranksSound = false;
            handler.call(modal);
            expect(el._outranksSound).toBe(true);
        }
    });
});

describe('ag-systemd-override-editor — a new form on each opening', () => {
    /** The key the form is drawn under, found in the modal's body. */
    const formKey = (el) => {
        let key;
        const walk = (node) => {
            if (key !== undefined || !node || typeof node !== 'object') return;
            if (Array.isArray(node)) return node.forEach(walk);
            if ('keyed' in node) { key = node.keyed; return; }
            (node.values ?? []).forEach(walk);
        };
        walk(el.render());
        return key;
    };

    it('each opening draws the form under a new key, so a cancelled edit does not survive', () => {
        // Lit writes a bound field only when its value changes: a value typed, then
        // cancelled, stayed in the next opening of a service holding the same setting.
        const el = makeEl(MPD);
        el.open({ ...MPD, properties: {} });
        const first = formKey(el);
        el.open({ ...AIRPLAY, properties: {} });
        expect(formKey(el)).not.toBe(first);
        const second = formKey(el);
        el.open({ ...AIRPLAY, properties: {} });
        expect(formKey(el)).not.toBe(second);
    });

    it('the key sits inside the body\'s template, where it acts', () => {
        // Bound straight to the modal's `.bodyTemplate` property, the key re-created
        // nothing: the modal drew the next opening into the same form (seen in Chromium).
        const el = makeEl(MPD);
        el.open({ ...MPD, properties: {} });
        const tpl = el.render();
        const at = tpl.strings.findIndex(s => s.trimEnd().endsWith('.bodyTemplate='));
        expect(at).toBeGreaterThanOrEqual(0);
        const body = tpl.values[at];
        expect('keyed' in body).toBe(false);
        expect(body.values.some(v => v && typeof v === 'object' && 'keyed' in v)).toBe(true);
    });

    it('a re-render while editing keeps the same form, so the typing stays', () => {
        const el = makeEl(MPD);
        el.open({ ...MPD, properties: {} });
        const key = formKey(el);
        el._outranksSound = true;          // what typing a high priority causes
        expect(formKey(el)).toBe(key);
    });
});
