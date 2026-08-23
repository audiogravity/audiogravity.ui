/**
 * @file Tests for the support report text renderer.
 *
 * Two things matter here. First, the report must survive a *partial* answer: it is
 * read when something is already broken, so a section the core could not collect
 * must be reported, not silently dropped — a missing section reads as "nothing to
 * see" and sends the reader down the wrong path. Second, the facts that cost a week
 * of guesswork in the field — version, service states, whether a config is
 * AG-managed or hand-written — must actually appear.
 */
import { describe, it, expect } from 'vitest';
import { formatSupportReport } from './support-report-format.js';

/** A complete report, shaped like the core's real payload. */
function fullReport(overrides = {}) {
    return {
        report_version: 1,
        generated_at: '2026-08-23T13:00:00+00:00',
        box: {
            ag_version: '0.9.45',
            architecture: 'aarch64',
            hostname: 'lounge',
            os: 'Linux 6.12.0',
            enabled_modules: ['auth', 'sysinfo'],
        },
        licence: {
            status: 'lifetime',
            plan: 'perpetual',
            device_id: 'abc123',
            order_id: 'AG-0000',
            activated_at: '2026-01-01',
            expires_at: null,
            days_remaining: null,
            online_check: { status: 'valid', checked_at: '2026-08-23T12:00:00+00:00' },
        },
        system: {
            uptime: '3 days',
            kernel: '6.12.0',
            os_release: 'Debian 13',
            load_average: { one_minute: 0.328125, five_minutes: 0.5, fifteen_minutes: 0.25 },
            memory: { percent: 60.8 },
            temperature: { cpu_temp: 55.7 },
            network_interfaces: [{ name: 'eth0', ipv4: ['10.0.0.5'], ipv6: [], is_up: true }],
        },
        packages: [
            { id: 'mpd', label: 'Music Player Daemon', status: 'installed', installed_version: '0.24.5', supported_here: true },
            { id: 'roonserver', label: 'Roon Server', status: 'not_installed', installed_version: null, supported_here: false },
        ],
        services: {
            managed: [
                { name: 'mpd', state: 'active', sub_state: 'running', enabled: false },
                { name: 'shairport-sync', state: 'failed', sub_state: 'failed', enabled: true },
            ],
            failed_elsewhere: [{ name: 'nas-mount', state: 'failed', sub_state: 'failed', enabled: true }],
            total_units: 127,
        },
        audio_stack: {
            selected_output: { card_name: 'Abacus', device_id: 0, usb_id: '20b1:30ab' },
            outputs: [{ card_name: 'Abacus', usb_id: '20b1:30ab' }],
            services: [
                { service_id: 'mpd', configured: true, output: { card_name: 'Abacus', device_id: 0 } },
                { service_id: 'upmpdcli', configured: false, output: null },
            ],
            library_sources: [{ kind: 'mount', mountpoint: '/mnt/musics' }],
        },
        library: {
            has_local_library: true,
            declared_roots: ['/mnt/musics'],
            roots_detail: [{ path: '/mnt/musics', exists: true, readable: false }],
            mpd_database: { path: '/var/lib/mpd/db', exists: false },
        },
        streaming: { qobuz: true, tidal: false },
        configs: [
            {
                service_id: 'mpd',
                path: '/etc/mpd.conf',
                exists: true,
                dropped_comments: 65,
                redacted: 1,
                truncated: 0,
                lines: ['music_directory "/mnt/musics"', 'password «redacted»'],
            },
        ],
        ...overrides,
    };
}

describe('formatSupportReport', () => {
    it('handles a missing or malformed report instead of throwing', () => {
        expect(formatSupportReport(null)).toBe('No report available.');
        expect(formatSupportReport('nope')).toBe('No report available.');
    });

    it('states when it was generated and which format it is', () => {
        const out = formatSupportReport(fullReport());
        expect(out).toContain('2026-08-23T13:00:00+00:00');
        expect(out).toContain('format v1');
    });

    it('says up front that secrets were removed', () => {
        // The owner is about to paste this into a message; the guarantee has to be
        // visible without reading to the end.
        expect(formatSupportReport(fullReport())).toMatch(/redacted/i);
    });

    // ── The facts that cost the week of guesswork ──────────────────────────────

    it('gives the version and architecture', () => {
        const out = formatSupportReport(fullReport());
        expect(out).toContain('0.9.45');
        expect(out).toContain('aarch64');
    });

    it('gives each managed service its state and whether it starts at boot', () => {
        const out = formatSupportReport(fullReport());
        expect(out).toMatch(/mpd\s+active\/running\s+enabled at boot: no/);
        expect(out).toMatch(/shairport-sync\s+failed\/failed\s+enabled at boot: yes/);
    });

    it('says whether each config is AG-managed or hand-written', () => {
        const out = formatSupportReport(fullReport());
        expect(out).toMatch(/mpd\s+AG-managed/);
        expect(out).toMatch(/upmpdcli\s+hand-written/);
    });

    it('surfaces a failed unit outside the AG set', () => {
        // A failed NAS mount is exactly the kind of cause that never shows up in the
        // audio stack itself.
        expect(formatSupportReport(fullReport())).toContain('nas-mount');
    });

    it('reports a library path that exists but cannot be read', () => {
        expect(formatSupportReport(fullReport())).toMatch(/exists: yes · readable: no/);
    });

    it('says when MPD has never indexed', () => {
        expect(formatSupportReport(fullReport())).toContain('never indexed');
    });

    it('includes the redacted config lines and what was removed', () => {
        const out = formatSupportReport(fullReport());
        expect(out).toContain('music_directory "/mnt/musics"');
        expect(out).toContain('password «redacted»');
        expect(out).toContain('65 comment lines omitted');
        expect(out).toContain('1 value(s) redacted');
    });

    // ── Degraded answers ───────────────────────────────────────────────────────

    it('prints a section the core could not collect rather than dropping it', () => {
        const out = formatSupportReport(fullReport({
            audio_stack: { error: 'RuntimeError: no such device' },
        }));
        expect(out).toContain('AUDIO STACK');
        expect(out).toContain('could not be collected');
        expect(out).toContain('RuntimeError: no such device');
    });

    it('still renders every other section when one failed', () => {
        const out = formatSupportReport(fullReport({ packages: { error: 'boom' } }));
        expect(out).toContain('0.9.45');
        expect(out).toContain('SERVICES');
        expect(out).toContain('CONFIGURATION FILES');
    });

    it('renders an empty report without throwing', () => {
        const out = formatSupportReport({});
        expect(out).toContain('AUDIOGRAVITY SUPPORT REPORT');
    });

    it('says a box has no local library rather than showing an empty list', () => {
        const out = formatSupportReport(fullReport({
            library: { has_local_library: false, declared_roots: [], roots_detail: [] },
        }));
        expect(out).toContain('streaming sources only');
    });

    it('marks a config file that is missing', () => {
        const out = formatSupportReport(fullReport({
            configs: [{ service_id: 'airplay', path: '/etc/shairport-sync.conf', exists: false }],
        }));
        expect(out).toContain('does not exist');
    });

    // ── Readability ────────────────────────────────────────────────────────────

    it('rounds the load average', () => {
        // The raw value is 0.328125; eleven decimals is noise in a document read by a person.
        const out = formatSupportReport(fullReport());
        expect(out).toContain('0.33 / 0.50 / 0.25');
        expect(out).not.toContain('0.328125');
    });

    it('keeps a space between a long label and its value', () => {
        // 'Music Player Daemon' is longer than the label column and used to run
        // straight into its value ('Music Player Daemoninstalled').
        expect(formatSupportReport(fullReport())).toContain('Music Player Daemon installed');
    });

    it('marks a package unsupported on this architecture', () => {
        expect(formatSupportReport(fullReport())).toContain('not supported on this architecture');
    });
});
