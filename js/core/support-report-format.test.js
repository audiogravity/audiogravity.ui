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

describe('formatSupportReport — v2 sections', () => {
    const v2 = {
        report_version: 2,
        network: {
            gateway: '10.0.4.1', default_interface: 'wlan0', lan_ip: '10.0.4.254',
            dns_servers: ['1.1.1.1'],
            clock: { timezone: 'Europe/Paris', ntp_synchronized: 'no' },
            reachability: {
                internet: { host: 'audiogravity.app', port: 443, reachable: true, latency_ms: 77 },
                license_server: { host: 'ls.example', port: 443, reachable: false, error: 'TimeoutError' },
            },
        },
        web_ui: {
            port: 8080, lan_ip: '10.0.4.254', scheme: 'https', reachable: true,
            ui_build: { version: '0.9.46', build_date: '2026-08-24T10:00:00Z', git_commit: 'abc1234' },
            certificate: {
                subject: 'Audiogravity UI', not_after: '2028-01-01T00:00:00+00:00',
                days_left: 490, san_ips: ['10.0.4.10'], san_dns: [], covers_lan_ip: false,
            },
            ca: { bootstrap_port: 8081, available: true, subject: 'Audiogravity CA', issuer_matches: true, signature_verified: true },
        },
        self_update: {
            state: { phase: 'idle' },
            bootstrap_url: 'https://audiogravity.app/install-core.sh',
            download_token_present: false,
        },
        env_sanity: {
            path: '/etc/audiogravity/.env', exists: true, mode: '0o644', world_readable: true,
            keys_present: 31, expected_keys: 46,
            missing: ['RELEASE_DOWNLOAD_TOKEN'], unknown: ['OLD_KEY'],
        },
        storage: { mounts: [{ mountpoint: '/mnt/musics', used_percent: 72.6, free_bytes: 2199023255552 }] },
        audio_live: {
            cards: [{ index: 0, id: 'Abacus', description: 'USB-Audio - Heed Abacus', usbid: '20b1:30ab', usbbus: '001/009' }],
            active_streams: [{ stream: 'card0/pcm0p/sub0', direction: 'playback', format: 'S32_LE', rate: '44100 (44100/1)', channels: '2' }],
            cpu_governor: 'performance',
        },
        library: {
            has_local_library: false,
            mpd_stats: { songs: '48312', albums: '3210', artists: '812', db_updated: '2026-08-23T06:12:08+00:00' },
        },
        journal: { priority: 'err', window: '7 days', units: ['mpd.service'], lines: ['2026-08-24 box mpd[1]: something failed'] },
    };

    it('reports NTP not synchronizing — the silent killer', () => {
        expect(formatSupportReport(v2)).toContain('NTP synchronized: no');
    });

    it('reports an unreachable licence server with its error', () => {
        expect(formatSupportReport(v2)).toContain('UNREACHABLE (TimeoutError)');
    });

    it('gives the UI its own version line', () => {
        expect(formatSupportReport(v2)).toContain('0.9.46 · built 2026-08-24T10:00:00Z · commit abc1234');
    });

    it('flags a certificate that does not name the current address', () => {
        expect(formatSupportReport(v2)).toContain('NO — certificate does not name 10.0.4.254');
    });

    it('says the CA signs the served certificate', () => {
        expect(formatSupportReport(v2)).toContain('signs the served certificate: yes');
    });

    it('treats an absent download token as the normal public-releases state', () => {
        expect(formatSupportReport(v2)).toContain('not set (not required — releases are public)');
        expect(formatSupportReport(v2)).not.toContain('MISSING');
    });

    it('reports MEASURED access to the releases repo, with the latest version', () => {
        const ok = { ...v2, box: { ag_version: '0.9.45' }, self_update: { ...v2.self_update, releases: { accessible: true, latest: 'v0.9.46', http_status: 200, latency_ms: 47 } } };
        expect(formatSupportReport(ok)).toContain('access OK · latest v0.9.46 — this box runs 0.9.45 · 47 ms');
    });

    it('says when the box is up to date', () => {
        const same = { ...v2, box: { ag_version: '0.9.46' }, self_update: { ...v2.self_update, releases: { accessible: true, latest: 'v0.9.46', http_status: 200, latency_ms: 47 } } };
        expect(formatSupportReport(same)).toContain('latest v0.9.46 (this box is up to date)');
    });

    it('reports refused access as what breaks updates', () => {
        const no = { ...v2, self_update: { ...v2.self_update, releases: { accessible: false, http_status: 404 } } };
        expect(formatSupportReport(no)).toContain('NO ACCESS (HTTP 404) — updates cannot download');
    });

    it('never converts a GitHub rate limit into a verdict', () => {
        const limited = { ...v2, self_update: { ...v2.self_update, releases: { accessible: null, note: 'rate-limited by GitHub — inconclusive' } } };
        const text = formatSupportReport(limited);
        expect(text).toContain('inconclusive — rate-limited');
        expect(text).not.toContain('NO ACCESS');
    });

    it('warns on a world-readable .env and lists missing keys by name', () => {
        const text = formatSupportReport(v2);
        expect(text).toContain('world-readable');
        expect(text).toContain('RELEASE_DOWNLOAD_TOKEN');
        expect(text).toContain('31 present / 46 expected');
    });

    it('shows storage in terabytes when it is terabytes', () => {
        expect(formatSupportReport(v2)).toContain('72.6% used · 2.0 TB free');
    });

    it('shows the live stream — the bit-perfect proof', () => {
        const text = formatSupportReport(v2);
        expect(text).toContain('card0/pcm0p/sub0 · S32_LE · 44100 (44100/1) Hz · 2 ch');
        expect(text).toContain('[20b1:30ab bus 001/009]');
    });

    it('renders MPD stats even on a streaming-only box', () => {
        expect(formatSupportReport(v2)).toContain('48312 songs · 3210 albums · 812 artists');
    });

    it('renders journal lines, and silence as a real answer', () => {
        expect(formatSupportReport(v2)).toContain('mpd[1]: something failed');
        const quiet = { ...v2, journal: { window: '7 days', lines: [] } };
        expect(formatSupportReport(quiet)).toContain('logged no error in this window');
    });

    it('renders an idle stream list as a statement, not an absence', () => {
        const idle = { ...v2, audio_live: { cards: [], active_streams: [], cpu_governor: null } };
        expect(formatSupportReport(idle)).toContain('No PCM stream open right now.');
    });

    it('states when the .env does not exist at all', () => {
        const missing = { ...v2, env_sanity: { path: '/etc/audiogravity/.env', exists: false } };
        expect(formatSupportReport(missing)).toContain('DOES NOT EXIST');
    });

    it('a failed v2 section prints its error and sinks nothing', () => {
        const broken = { ...v2, network: { error: 'boom' } };
        const text = formatSupportReport(broken);
        expect(text).toContain('could not be collected — boom');
        expect(text).toContain('AUDIO LIVE');
    });
});

describe('formatSupportReport — AV network', () => {
    const base = {
        report_version: 2,
        system: {
            network_interfaces: [
                { name: 'eth0', ipv4: [], is_up: false },
                { name: 'wlan0', ipv4: ['10.0.4.254'], is_up: true },
            ],
        },
        network: { default_interface: 'wlan0' },
        av_peers: {
            upnp_renderers: [
                { name: 'music.#1', host: '10.0.4.254', is_local: true },
                { name: 'Salon', host: '10.0.4.189', is_local: false },
            ],
            upnp_servers: [{ name: 'MinimServer[nas]', host: '10.0.0.42' }],
            hqplayer: { configured_host: '10.0.4.200', port: 4321, probe: { reachable: true, latency_ms: 3 }, available: true, state: 'playing' },
            roon: { configured_host: '10.0.4.200', probe: { reachable: false, port: 9330, error: 'TimeoutError' } },
        },
    };

    it('lists each renderer with its host and marks this box', () => {
        const text = formatSupportReport(base);
        expect(text).toContain('music.#1 @ 10.0.4.254 (this box)');
        expect(text).toContain('Salon @ 10.0.4.189');
    });

    it('lists media servers such as MinimServer', () => {
        expect(formatSupportReport(base)).toContain('MinimServer[nas] @ 10.0.0.42');
    });

    it('reports HQPlayer reachable with its engine state', () => {
        expect(formatSupportReport(base)).toContain('10.0.4.200:4321 reachable · 3 ms · engine answering (playing)');
    });

    it('reports an unreachable Roon Core as the diagnosis it is', () => {
        expect(formatSupportReport(base)).toContain('10.0.4.200:9330 UNREACHABLE (TimeoutError)');
    });

    it('says none found rather than showing an empty list', () => {
        const empty = { ...base, av_peers: { upnp_renderers: [], upnp_servers: [], hqplayer: {}, roon: {} } };
        const text = formatSupportReport(empty);
        expect(text).toContain('none found on this network segment');
        expect(text).toContain('HQPlayer');
        expect(text).toContain('not configured');
    });

    it('marks the interface carrying the default route', () => {
        const text = formatSupportReport(base);
        expect(text).toContain('net wlan0');
        expect(text).toContain('10.0.4.254 · default route');
        expect(text).toContain('no address (down)');
    });
});

describe('formatSupportReport — links, USB speed, audio tuning', () => {
    const report = {
        report_version: 2,
        network: {
            clock: { timezone: 'Europe/Paris', ntp_synchronized: 'yes', local_time: '2026-08-24T13:51:45+02:00' },
            links: [
                { name: 'eth0', up: true, mtu: 1500, type: 'wired', speed_mbps: 100, duplex: 'full' },
                { name: 'wlan0', up: true, mtu: 1500, type: 'wifi', note: 'iw not installed — WiFi rate/signal unknown' },
                { name: 'wlan1', up: true, mtu: 1500, type: 'wifi', bitrate: '866.7 MBit/s', signal_dbm: -52, ssid: 'Salon' },
            ],
        },
        audio_live: {
            cards: [{ index: 0, id: 'Abacus', description: 'USB-Audio - Heed Abacus', usbid: '20b1:30ab', usbbus: '001/009', usb_speed_mbps: 480, usb_version: '2.00' }],
            active_streams: [],
            cpu_governor: 'performance',
            cpu_mhz: 2415,
        },
        audio_tuning: {
            units: [
                {
                    unit: 'mpd.service', active: 'active',
                    configured: { nice: '0', cpu_affinity: '3', cpu_sched: 'rr', cpu_sched_priority: '45', io_class: 'best-effort', io_priority: '4', io_accounting: 'yes', ip_accounting: 'yes', drop_ins: ['realtime.conf'] },
                    live: { nice: 0, cpu_sched: 'rr', cpu_sched_priority: 45, cpu_affinity: '3', io: 'none: prio 0' },
                },
                {
                    unit: 'upmpdcli.service', active: 'active',
                    configured: { nice: '0', cpu_sched: 'rr', cpu_sched_priority: '35', io_accounting: 'no', ip_accounting: 'no', drop_ins: [] },
                    live: { nice: 0, cpu_sched: 'other', cpu_sched_priority: 0, cpu_affinity: '0-3' },
                },
            ],
        },
    };

    it('gives each wired link its negotiated speed — the 100 Mb gigabit port', () => {
        expect(formatSupportReport(report)).toContain('wired · 100 Mb/s full duplex · mtu 1500');
    });

    it('says WHY the wifi rate is unknown instead of pretending', () => {
        expect(formatSupportReport(report)).toContain('iw not installed');
    });

    it('gives a measured wifi link its bitrate, signal and ssid', () => {
        expect(formatSupportReport(report)).toContain('866.7 MBit/s · -52 dBm · ssid Salon');
    });

    it('shows the local time next to the timezone', () => {
        expect(formatSupportReport(report)).toContain('local time 2026-08-24T13:51:45+02:00');
    });

    it('names the USB link speed of the DAC', () => {
        expect(formatSupportReport(report)).toContain('USB 480 Mb/s (High-Speed)');
    });

    it('shows the current CPU frequency with the governor', () => {
        expect(formatSupportReport(report)).toContain('performance · 2415 MHz');
    });

    it('renders live scheduling with accounting and drop-ins', () => {
        const text = formatSupportReport(report);
        expect(text).toContain('rr prio 45 · nice 0 · CPUs 3 · io none: prio 0 · acct io:yes ip:yes');
        expect(text).toContain('drop-ins: realtime.conf');
    });

    it('flags a drop-in that did not apply — configured vs live', () => {
        expect(formatSupportReport(report)).toContain('⚠ configured rr prio 35');
    });
});

describe('formatSupportReport — kernel, boots, ro, restarts, backups, network finds', () => {
    const report = {
        report_version: 2,
        storage: { mounts: [{ mountpoint: '/', used_percent: 42, free_bytes: 1000, read_only: true }] },
        audio_tuning: {
            units: [{
                unit: 'mpd.service', active: 'active', restarts: 7,
                started_at: 'Mon 2026-08-24 13:00:01 CEST',
                memory_bytes: 52428800, cpu_used_seconds: 123,
                configured: { nice: '0', io_accounting: 'yes', ip_accounting: 'yes', drop_ins: [] },
                live: { nice: 0, cpu_sched: 'rr', cpu_sched_priority: 45, cpu_affinity: '3' },
            }],
        },
        av_peers: {
            upnp_renderers: [], upnp_servers: [],
            hqplayer: { configured_host: null, port: 4321, found_on_network: [{ host: '10.0.4.200', active_filter: 'poly-sinc-ext2' }] },
            roon: { configured_host: null, found_on_network: { host: '10.0.4.200', port: 9330 } },
        },
        configs: [{
            service_id: 'mpd', path: '/etc/mpd.conf', exists: true,
            dropped_comments: 3, lines: ['port "6600"'],
            backups_total: 8, last_backup: '2026-08-23T10:00:00+00:00',
        }],
        journal: {
            window: '7 days', units: ['mpd.service'],
            lines: [],
            kernel: ['2026-08-22 kernel: usb 1-8: reset high-speed USB device'],
            boots: { total: 5, recent: ['3 abc… Sat…', '4 def… Sun…', '5 ghi… Mon…'] },
        },
    };

    it('marks a read-only filesystem as the failure it is', () => {
        expect(formatSupportReport(report)).toContain('⚠ READ-ONLY');
    });

    it('unmasks a crash-looping unit hidden by Restart=always', () => {
        const text = formatSupportReport(report);
        expect(text).toContain('⚠ 7 restart(s)');
        expect(text).toContain('started Mon 2026-08-24 13:00:01 CEST');
    });

    it('reads what accounting counts — memory and cpu per unit', () => {
        expect(formatSupportReport(report)).toContain('mem 50.0 MB · cpu 123s');
    });

    it('says an unconfigured HQPlayer was still FOUND on the network', () => {
        expect(formatSupportReport(report)).toContain('not configured · found on network: 10.0.4.200 (filter poly-sinc-ext2)');
    });

    it('says an unconfigured Roon Core announces itself', () => {
        expect(formatSupportReport(report)).toContain('announced on network at 10.0.4.200:9330');
    });

    it('counts the backups behind each config', () => {
        expect(formatSupportReport(report)).toContain('8 backup(s), latest 2026-08-23T10:00:00+00:00');
    });

    it('surfaces hardware kernel warnings — the DAC reset', () => {
        expect(formatSupportReport(report)).toContain('usb 1-8: reset');
    });

    it('shows the boot history that reframes a ticket', () => {
        const text = formatSupportReport(report);
        expect(text).toContain('Boots');
        expect(text).toContain('5 recorded');
    });

    it('states kernel silence as an answer', () => {
        const quiet = { ...report, journal: { ...report.journal, kernel: [] } };
        expect(formatSupportReport(quiet)).toContain('no hardware-related kernel warning');
    });
});

describe('formatSupportReport — post-review corrections', () => {
    it('a box without Roon says "not in use", never a false UNREACHABLE', () => {
        const report = {
            report_version: 2,
            av_peers: {
                upnp_renderers: [], upnp_servers: [], hqplayer: {},
                roon: { configured_host: '127.0.0.1', in_use: false, found_on_network: null },
            },
        };
        const text = formatSupportReport(report);
        expect(text).toContain('not in use on this box · no Core announced on the network');
        expect(text).not.toContain('UNREACHABLE');
    });

    it('keys on code defaults read as inventory, not as an alarm', () => {
        const report = {
            report_version: 2,
            env_sanity: { path: '/etc/audiogravity/.env', exists: true, mode: '0o600', keys_present: 26, expected_keys: 46, missing: ['TIDAL_QUALITY', 'JWT_ENABLED'], unknown: [] },
        };
        const text = formatSupportReport(report);
        expect(text).toContain('2 key(s) on code defaults: TIDAL_QUALITY, JWT_ENABLED');
        expect(text).not.toContain('Missing');
    });
});

describe('formatSupportReport — a failed measurement is never a negative diagnosis', () => {
    it('a v1 core: absent v2 sections are stated as absent, not fabricated', () => {
        const text = formatSupportReport({ report_version: 1, box: { ag_version: '0.9.45' } });
        expect(text).toContain('not provided by this core (report v1');
        expect(text).not.toContain('no default route');
        expect(text).not.toContain('No PCM stream open');
        expect(text).not.toContain('none found on this network segment');
        expect(text).not.toContain('logged no error in this window');
    });

    it('a failed gateway or DNS read is shown as a failed read', () => {
        const text = formatSupportReport({ report_version: 2, network: { gateway_error: 'ip: not found', dns_error: 'EACCES' } });
        expect(text).toContain('Gateway');
        expect(text).toContain('could not be read — ip: not found');
        expect(text).toContain('could not be read — EACCES');
        expect(text).not.toContain('no default route');
    });

    it('a failed live scheduling probe falls back to configured values and says so', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_tuning: { units: [{ unit: 'mpd.service', configured: { nice: '0', cpu_sched: 'rr', cpu_sched_priority: '45', cpu_affinity: '3', io_accounting: 'yes', ip_accounting: 'yes' }, live: { error: 'ProcessLookupError: pid gone' } }] },
        });
        expect(text).toContain('rr prio 45');
        expect(text).toContain('live read failed — ProcessLookupError: pid gone');
        expect(text).not.toContain('— · nice —');
    });

    it('a failed unit query still shows kernel warnings and boot history', () => {
        const text = formatSupportReport({
            report_version: 2,
            journal: { window: '7 days', error: 'journalctl timed out', kernel: ['kernel: usb 1-8: reset'], boots: { total: 3, recent: [] } },
        });
        expect(text).toContain('unit errors could not be read — journalctl timed out');
        expect(text).toContain('usb 1-8: reset');
        expect(text).toContain('3 recorded');
    });

    it('kernel and boot read failures are rendered, not swallowed', () => {
        const text = formatSupportReport({ report_version: 2, journal: { window: '7 days', lines: [], kernel_error: 'no pcre2', boots_error: 'denied' } });
        expect(text).toContain('kernel journal could not be read — no pcre2');
        expect(text).toContain('boot history could not be read — denied');
        expect(text).not.toContain('no hardware-related kernel warning');
    });

    it('an unreadable /proc/asound/cards is not "no DAC"', () => {
        const text = formatSupportReport({ report_version: 2, audio_live: { cards: [], cards_error: 'EIO', active_streams: [] } });
        expect(text).toContain('could not be read — EIO');
    });

    it('backups are shown even for a config file that is missing', () => {
        const text = formatSupportReport({
            report_version: 2,
            configs: [{ service_id: 'mpd', path: '/etc/mpd.conf', exists: false, backups_total: 4, last_backup: '2026-08-20T10:00:00+00:00' }],
        });
        expect(text).toContain('4 backup(s), latest 2026-08-20T10:00:00+00:00');
        expect(text).toContain('(file does not exist)');
    });
});

describe('formatSupportReport — a probe that could not run never reads as a negative', () => {
    it('a streaming account whose probe failed is unknown, not "not signed in"', () => {
        // The regression this guards: `is_connected` is a property, the collector
        // called it, the TypeError went into a bare except that wrote false, and
        // every box reported "not signed in" while its accounts were connected.
        const text = formatSupportReport({
            report_version: 2,
            streaming: {
                qobuz: null,
                tidal: false,
                highresaudio: true,
                probe_errors: { qobuz: "TypeError: 'bool' object is not callable" },
            },
        });
        expect(text).toContain("qobuz");
        expect(text).toMatch(/qobuz\s+unknown — TypeError/);
        expect(text).toMatch(/tidal\s+not signed in/);
        expect(text).toMatch(/highresaudio\s+signed in/);
    });

    it('renders a streaming service the core added that the UI never heard of', () => {
        // A hardcoded service list would drop this line and still look complete.
        const text = formatSupportReport({
            report_version: 2,
            streaming: { qobuz: true, deezer: false },
        });
        expect(text).toMatch(/deezer\s+not signed in/);
    });

    it('probe_errors is never rendered as if it were a streaming service', () => {
        const text = formatSupportReport({
            report_version: 2,
            streaming: { qobuz: null, probe_errors: { qobuz: 'module not enabled' } },
        });
        expect(text).not.toMatch(/^\s*probe_errors/m);
    });

    it('a masked unit is not called missing', () => {
        // The unit file exists; masking is deliberate. Calling it "not installed"
        // sends the reader to reinstall software that is already there.
        const text = formatSupportReport({
            report_version: 2,
            audio_tuning: { units: [{ unit: 'audiogravity-pulse.service', load_state: 'masked' }] },
        });
        expect(text).toContain('MASKED');
        expect(text).not.toContain('not installed on this box');
    });

    it('an unknown load state is reported neutrally, never as absence', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_tuning: { units: [{ unit: 'mpd.service', load_state: 'merged' }] },
        });
        expect(text).toContain('unit not loaded (merged)');
        expect(text).not.toContain('not installed on this box');
    });

    it('a unit that is not installed is said to be missing, not tuned', () => {
        // `systemctl show` answers for an absent unit with systemd's defaults, so
        // the report used to print a full tuning line for software the box lacks.
        const text = formatSupportReport({
            report_version: 2,
            audio_tuning: {
                units: [
                    { unit: 'audiogravity-camilladsp.service', load_state: 'not-found' },
                    { unit: 'mpd.service', load_state: 'loaded', configured: { nice: '0', cpu_sched: 'rr', cpu_sched_priority: '45', io_class: 'best-effort', io_priority: '4' } },
                ],
            },
        });
        expect(text).toContain('not installed on this box (not-found)');
        expect(text).not.toMatch(/audiogravity-camilladsp\s+.*best-effort/);
        expect(text).toMatch(/mpd\s+rr prio 45/);
    });
});

describe('formatSupportReport — what the box does, not only what AG believes', () => {
    it('tells two outputs of the same card apart', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: {
                outputs: [
                    { card_name: 'PCH', hw: 'hw:1,0', label: 'PCH — CS4208 Analog' },
                    { card_name: 'PCH', hw: 'hw:1,1', label: 'PCH — CS4208 Digital' },
                ],
                services: [],
            },
        });
        expect(text).toContain('PCH — CS4208 Analog (hw:1,0)');
        expect(text).toContain('PCH — CS4208 Digital (hw:1,1)');
    });

    it('never prints the same USB id twice on one line', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: {
                outputs: [{ card_name: 'Abacus', hw: 'hw:0,0', label: 'Abacus — USB Audio (USB 20b1:30ab)', usb_id: '20b1:30ab' }],
                services: [],
            },
        });
        expect(text).toContain('Abacus — USB Audio (USB 20b1:30ab) (hw:0,0)');
        expect(text).not.toContain('[20b1:30ab]');
    });

    it('still names the USB id when the label does not carry it', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: { outputs: [{ card_name: 'Abacus', usb_id: '20b1:30ab' }], services: [] },
        });
        expect(text).toContain('Abacus [20b1:30ab]');
    });

    it('says nothing about the config device when the core did not send one', () => {
        // A core predating these fields sends no key at all. Printing "no device in
        // config" would assert a fact the report never carried.
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: {
                outputs: [],
                services: [{ service_id: 'mpd', configured: true, output: { card_name: 'Abacus', device_id: 0 } }],
            },
        });
        expect(text).toContain('AG-managed · Abacus (device 0)');
        expect(text).not.toContain('no device in config');
        expect(text).not.toContain('config says');
    });

    it('reports an unreadable config device as such, distinctly from an absent field', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: {
                outputs: [],
                services: [{ service_id: 'mpd', configured: true, output: null, configured_device: null }],
            },
        });
        expect(text).toContain('no device in config');
    });

    it('shows the device each config actually names', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: {
                outputs: [],
                services: [
                    { service_id: 'mpd', configured: true, output: { card_name: 'Abacus', device_id: 0 }, configured_device: 'hw:0,0', pinned_device: 'hw:0,0', device_matches_pin: true },
                ],
            },
        });
        expect(text).toContain('config says hw:0,0');
        expect(text).not.toContain('does not match the pin');
    });

    it('flags a config that plays somewhere other than the pinned output', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: {
                outputs: [],
                services: [
                    { service_id: 'airplay', configured: true, output: { card_name: 'Abacus', device_id: 0 }, configured_device: 'hw:1,1', pinned_device: 'hw:0,0', device_matches_pin: false },
                ],
            },
        });
        expect(text).toContain('config says hw:1,1');
        expect(text).toContain('does not match the pin (hw:0,0)');
    });

    it('says nothing about agreement when there is no pin to compare against', () => {
        const text = formatSupportReport({
            report_version: 2,
            audio_stack: {
                outputs: [],
                services: [
                    { service_id: 'mpd', configured: true, output: null, configured_device: 'hw:0,0', pinned_device: null },
                ],
            },
        });
        expect(text).toContain('not pinned');
        expect(text).toContain('config says hw:0,0');
        expect(text).not.toContain('does not match the pin');
    });
});

describe('formatSupportReport — the facts a certificate incident turns on', () => {
    it('dates the served certificate, not only its expiry', () => {
        // The day a certificate was reissued is the day devices trusting it stopped.
        // It used to be computable only by subtracting the issuing policy from the
        // expiry, by hand.
        const out = formatSupportReport({
            web_ui: {
                certificate: {
                    subject: '192.168.178.84',
                    not_before: '2026-08-31T17:44:35+00:00',
                    not_after: '2028-12-03T17:44:35+00:00',
                    days_left: 824,
                },
            },
        });
        expect(out).toContain('issued 2026-08-31T17:44:35+00:00');
    });

    it('dates and fingerprints the authority, which an upgrade never reissues', () => {
        const out = formatSupportReport({
            web_ui: {
                ca: {
                    available: true, bootstrap_port: 8081, subject: 'Audiogravity Local CA',
                    signature_verified: true,
                    not_before: '2026-08-20T19:15:00+00:00',
                    fingerprint_sha256: 'ab12cd34',
                },
            },
        });
        expect(out).toContain('CA created');
        expect(out).toContain('ab12cd34');
    });

    it('says a leased address is leased', () => {
        const out = formatSupportReport({
            network: {
                links: [{ name: 'wlan0', type: 'wifi', mtu: 1500, up: true,
                    bitrate: '390 MBit/s', addr_source: 'dynamic' }],
            },
        });
        expect(out).toContain('dynamic');
    });

    it('reports the name the box announces, as avahi gives it', () => {
        const out = formatSupportReport({
            network: { mdns: { service: 'active', announced: 'HiRasp.local' } },
        });
        expect(out).toContain('HiRasp.local');
        expect(out).toContain('avahi-daemon active');
    });

    it('still says something on a box where nothing announces the name', () => {
        // The shape this line exists for: avahi missing, so the .local the certificate
        // promises answers to nothing. Dropping the line left the report silent there.
        const out = formatSupportReport({
            network: { mdns: { service: 'inactive', announced: null } },
        });
        expect(out).toContain('mDNS');
        expect(out).toContain('not announced');
    });

    it('does not turn "could not ask" into "announces nothing"', () => {
        // avahi running, the read failed: unknown. Printing "not answered" there would
        // accuse a box that may be fine.
        const out = formatSupportReport({
            network: { mdns: { service: 'active', announced: null } },
        });
        expect(out).toContain('unknown · avahi-daemon active');
    });

    it('omits the issue date rather than printing undefined', () => {
        // The interface and the core install as separate packages: a newer interface
        // reading an older core's report must not paste `issued undefined` into a mail.
        const out = formatSupportReport({
            web_ui: { certificate: { subject: 'box', not_after: 'b', days_left: 10 } },
        });
        const certLine = out.split('\n').find(l => l.includes('Certificate'));
        expect(certLine).toBeDefined();
        expect(certLine).not.toContain('issued');
        expect(certLine).not.toContain('undefined');
    });

    it('compares the announced name without case, as DNS does', () => {
        // RFC 4343, and two producers: avahi on one side, openssl and the hostname on
        // the other. A difference of case is not a mismatch.
        const out = formatSupportReport({
            network: { mdns: { service: 'active', announced: 'HiRasp.local' } },
            web_ui: {
                certificate: { subject: '192.168.178.84', not_after: 'b', days_left: 10,
                    san_dns: ['localhost', 'hirasp.local'], san_ips: [] },
            },
        });
        expect(out).not.toContain('NOT in the certificate');
    });

    it('flags an announced name the certificate does not carry', () => {
        // The certificate is built from the whole hostname, avahi announces the first
        // label only. On a box named `musics.1` the two differ and the promised name
        // answers to nothing — invisible unless the report says so, the two facts
        // living two sections apart.
        const out = formatSupportReport({
            network: { mdns: { service: 'active', announced: 'musics.local' } },
            web_ui: {
                certificate: { subject: '10.0.4.254', not_before: 'a', not_after: 'b',
                    days_left: 800, san_dns: ['localhost', 'musics.1.local'], san_ips: [] },
            },
        });
        expect(out).toContain('Announced name');
        expect(out).toContain('NOT in the certificate');
    });

    it('explains no_license instead of letting it read as a refusal', () => {
        // It means "no .lic on this box, nothing was sent" — the ordinary state of a
        // trial. Read as a server verdict it starts a hunt for a problem that is not there.
        const out = formatSupportReport({
            licence: { online_check: { status: 'no_license', checked_at: '2026-08-31T17:44:32Z' } },
        });
        expect(out).toContain('nothing was sent');
    });

    it('dates the self-update, so "done" says when', () => {
        const out = formatSupportReport({
            self_update: { state: { phase: 'done', from: '0.9.49', to: '0.9.50',
                updated_at: '2026-08-31T17:44:00Z' } },
        });
        expect(out).toContain('at 2026-08-31T17:44:00Z');
    });

    it('marks MPD\'s last error as undated, since MPD keeps it until cleared', () => {
        const out = formatSupportReport({
            library: { mpd_stats: { mpd_error: 'Failed to decode http://127.0.0.1:8000/...' } },
        });
        expect(out).toContain('undated');
    });
});
