/**
 * @module support-report-format
 * @description Renders the core's support report as plain text.
 *
 * The report exists to be **read and pasted into a message**, so text — not JSON — is
 * its real output format: a support mail full of braces is a support mail nobody reads.
 * The core returns structure; this turns it into the thing that gets sent.
 *
 * Kept out of the component so it can be tested on its own, and so a malformed or
 * partial report (a section the core could not collect carries its own `error`) is
 * handled here, once, rather than in the template.
 */

/** Width of the label column in a key/value line. */
const LABEL_WIDTH = 18;

/**
 * What each non-`loaded` systemd LoadState means, in the reader's terms.
 *
 * Only `not-found` means the software is absent. The others all describe a unit file
 * that EXISTS, so they must not send the reader to reinstall anything: `masked` is a
 * deliberate override to /dev/null, `bad-setting` and `error` are a unit systemd could
 * not parse or read, `stub` is a unit referenced but never written. Anything not listed
 * here falls back to a neutral wording that still names the raw state.
 */
const LOAD_STATE_TEXT = {
    'not-found': 'not installed on this box (not-found)',
    masked: 'installed but MASKED — systemd is told to ignore this unit',
    'bad-setting': 'unit file present but rejected by systemd (bad-setting)',
    error: 'unit file present but could not be read (error)',
    stub: 'referenced but no unit file was ever written (stub)',
};

/**
 * Format one label/value line.
 * @param {string} label - Field name.
 * @param {*} value - Field value; null/undefined/'' render as an em dash.
 * @returns {string} The padded line.
 */
function line(label, value) {
    const shown = value === null || value === undefined || value === '' ? '—' : String(value);
    // padEnd alone runs the two together when the label is longer than the column
    // ("Music Player Daemoninstalled"), so the separator is guaranteed, not padded for.
    return `  ${label.padEnd(LABEL_WIDTH - 1)} ${shown}`;
}

/**
 * Render a section heading.
 * @param {string} title - Section name.
 * @returns {string} Heading block.
 */
function heading(title) {
    return `\n${title.toUpperCase()}\n${'─'.repeat(title.length)}`;
}

/**
 * Render a section that failed to collect.
 *
 * A failed section is itself diagnostic — "we could not read the audio stack" is an
 * answer — so it is printed, never skipped.
 * @param {object} section - The section payload.
 * @returns {string|null} The error line, or null when the section is fine.
 */
function errorLine(section) {
    if (section && typeof section === 'object' && section.error) {
        return `  ⚠ could not be collected — ${section.error}`;
    }
    return null;
}

/**
 * Render a v2 section that this core did not produce at all.
 *
 * A frontend updated ahead of its core (a skew the core's own comments call
 * out) must not fabricate "no default route" or "no renderer found" from an
 * absent section: absence is a version fact, stated as such.
 * @param {object} report - The whole report.
 * @param {string} key - Section key.
 * @returns {string|null} The absence/error line, or null when the section is fine.
 */
function sectionError(report, key) {
    if (report[key] === undefined) {
        return `  not provided by this core (report v${report.report_version ?? '?'} — update the core to collect it)`;
    }
    return errorLine(report[key]);
}

/**
 * Format bytes as a human-readable size.
 * @param {number} bytes - Size in bytes.
 * @returns {string} e.g. "228.1 kB".
 */
function humanSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—';
    const units = ['B', 'kB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Render the whole support report as plain text.
 *
 * @param {object} report - The payload returned by `GET /sysinfo/support-report`.
 * @returns {string} The report, ready to read or paste into a message.
 */
export function formatSupportReport(report) {
    if (!report || typeof report !== 'object') return 'No report available.';

    const out = [];
    out.push('AUDIOGRAVITY SUPPORT REPORT');
    out.push(`Generated ${report.generated_at || '—'} · format v${report.report_version ?? '?'}`);
    out.push('Secrets (API keys, passwords, tokens, share credentials) are redacted.');

    // ── Box ────────────────────────────────────────────────────────────────────
    const box = report.box || {};
    out.push(heading('Box'));
    const boxError = errorLine(box);
    if (boxError) {
        out.push(boxError);
    } else {
        out.push(line('Version', box.ag_version));
        out.push(line('Architecture', box.architecture));
        out.push(line('Hostname', box.hostname));
        out.push(line('System', box.os));
        out.push(line('Modules', (box.enabled_modules || []).join(', ')));
    }

    // ── Licence ────────────────────────────────────────────────────────────────
    const licence = report.licence || {};
    out.push(heading('Licence'));
    const licenceError = errorLine(licence);
    if (licenceError) {
        out.push(licenceError);
    } else {
        out.push(line('Status', licence.plan ? `${licence.status} (${licence.plan})` : licence.status));
        out.push(line('Device ID', licence.device_id));
        out.push(line('Order', licence.order_id));
        out.push(line('Activated', licence.activated_at));
        // A licence bought for an earlier major version is valid in time and still
        // refused — without this line that reads as an unexplained refusal.
        if (licence.version_scope) out.push(line('Valid for', `v${licence.version_scope}.x`));
        if (licence.expires_at) out.push(line('Ends', licence.expires_at));
        if (licence.days_remaining !== null && licence.days_remaining !== undefined) {
            out.push(line('Days left', licence.days_remaining));
        }
        const check = licence.online_check || {};
        out.push(line('Server check', check.error ? `error — ${check.error}` : `${check.status ?? '—'} at ${check.checked_at || 'never'}`));
    }

    // ── System ─────────────────────────────────────────────────────────────────
    const system = report.system || {};
    out.push(heading('System'));
    const systemError = errorLine(system);
    if (systemError) {
        out.push(systemError);
    } else {
        out.push(line('Uptime', system.uptime));
        out.push(line('Kernel', system.kernel));
        out.push(line('OS release', system.os_release));
        const load = system.load_average || {};
        // Rounded: the raw values come back as full doubles (0.328125), and eleven
        // decimals of load average is noise in a document meant to be read.
        out.push(line('Load', [load.one_minute, load.five_minutes, load.fifteen_minutes]
            .filter(v => typeof v === 'number')
            .map(v => v.toFixed(2))
            .join(' / ')));
        const memory = system.memory || {};
        out.push(line('Memory', memory.percent !== undefined ? `${memory.percent}% used` : '—'));
        const temperature = system.temperature || {};
        if (temperature.cpu_temp !== undefined && temperature.cpu_temp !== null) {
            out.push(line('CPU temp', `${temperature.cpu_temp} °C`));
        }
        for (const iface of system.network_interfaces || []) {
            const addresses = [...(iface.ipv4 || []), ...(iface.ipv6 || [])].join(', ');
            // Which interface actually carries the traffic: with several of them
            // up, "which one is the box really using" is the first question.
            const isDefault = iface.name === (report.network || {}).default_interface;
            out.push(line(`net ${iface.name}`, `${addresses || 'no address'}${iface.is_up === false ? ' (down)' : ''}${isDefault ? ' · default route' : ''}`));
        }
    }

    // ── Network ────────────────────────────────────────────────────────────────
    const network = report.network || {};
    out.push(heading('Network'));
    const networkError = sectionError(report, 'network');
    if (networkError) {
        out.push(networkError);
    } else {
        // A failed read is not "no route": the core sets gateway_error and
        // omits the key — only a successful empty answer means no default route.
        out.push(line('Gateway', network.gateway_error
            ? `could not be read — ${network.gateway_error}`
            : network.gateway ? `${network.gateway} via ${network.default_interface || '?'}` : 'none — no default route'));
        out.push(line('LAN IP', network.lan_ip));
        out.push(line('DNS', network.dns_error
            ? `could not be read — ${network.dns_error}`
            : (network.dns_servers || []).join(', ')));
        const clock = network.clock || {};
        // The one silent killer: a drifted clock breaks TLS, the licence check and
        // streaming sessions, and shows up nowhere else in the report.
        out.push(line('Clock', clock.error
            ? `error — ${clock.error}`
            : `${clock.timezone || '?'} · NTP synchronized: ${clock.ntp_synchronized || 'unknown'}${clock.local_time ? ` · local time ${clock.local_time}` : ''}`));
        for (const link of network.links || []) {
            let detail;
            if (link.type === 'wired') {
                detail = link.speed_mbps
                    ? `wired · ${link.speed_mbps} Mb/s ${link.duplex || ''} duplex`.trim()
                    : `wired · no carrier`;
            } else {
                detail = link.bitrate
                    ? `wifi · ${link.bitrate}${link.signal_dbm !== undefined ? ` · ${link.signal_dbm} dBm` : ''}${link.ssid ? ` · ssid ${link.ssid}` : ''}`
                    : `wifi${link.note ? ` · ${link.note}` : ''}`;
            }
            out.push(line(`link ${link.name}`, `${detail} · mtu ${link.mtu}${link.up === false ? ' (down)' : ''}`));
        }
        for (const [name, probe] of Object.entries(network.reachability || {})) {
            out.push(line(name, probe.reachable
                ? `${probe.host}:${probe.port} reachable · ${probe.latency_ms} ms`
                : `${probe.host}:${probe.port} UNREACHABLE (${probe.error || '?'})`));
        }
    }

    // ── Web interface ──────────────────────────────────────────────────────────
    const web = report.web_ui || {};
    out.push(heading('Web interface'));
    const webError = sectionError(report, 'web_ui');
    if (webError) {
        out.push(webError);
    } else {
        out.push(line('Serving', web.reachable
            ? `${web.scheme} on port ${web.port}`
            : `NOT REACHABLE on port ${web.port}`));
        const build = web.ui_build || {};
        if (build.version) {
            out.push(line('UI version', `${build.version} · built ${build.build_date || '—'} · commit ${build.git_commit || '—'}`));
        }
        const cert = web.certificate;
        if (cert) {
            if (cert.error) {
                out.push(line('Certificate', `unreadable — ${cert.error}`));
            } else {
                out.push(line('Certificate', `${cert.subject || '—'} · expires ${cert.not_after} (${cert.days_left} days left)`));
                out.push(line('SAN', [...(cert.san_ips || []), ...(cert.san_dns || [])].join(', ')));
                // The certificate is issued for the address the box had at install
                // time; a box that changed address serves one browsers refuse.
                if (cert.covers_lan_ip !== null && cert.covers_lan_ip !== undefined) {
                    out.push(line('Covers LAN IP', cert.covers_lan_ip ? 'yes' : `NO — certificate does not name ${web.lan_ip}`));
                }
            }
        }
        const ca = web.ca;
        if (ca) {
            if (!ca.available) {
                out.push(line('CA', `NOT AVAILABLE on port ${ca.bootstrap_port}${ca.error ? ` — ${ca.error}` : ''}`));
            } else {
                // signature_verified null means "could not check", which is not "no".
                const signs = ca.issuer_matches === false ? 'NO — served certificate signed by another authority'
                    : ca.signature_verified === true ? 'yes'
                        : ca.issuer_matches === true ? 'yes (by name)' : 'unverified';
                out.push(line('CA', `${ca.subject || '—'} · on port ${ca.bootstrap_port} · signs the served certificate: ${signs}`));
            }
        }
    }

    // ── Self-update ────────────────────────────────────────────────────────────
    const update = report.self_update || {};
    out.push(heading('Self-update'));
    const updateError = sectionError(report, 'self_update');
    if (updateError) {
        out.push(updateError);
    } else {
        const state = update.state || {};
        let stateLine = state.phase || 'idle';
        if (state.phase && state.phase !== 'idle') {
            stateLine = `${state.phase}${state.from ? ` — ${state.from} → ${state.to || '?'}` : ''}${state.error ? ` · error: ${state.error}` : ''}`;
        }
        out.push(line('State', stateLine));
        out.push(line('Bootstrap URL', update.bootstrap_url));
        // The measured access check — the repo's own answer to the same request
        // the updater makes, never a deduction from host reachability. Three
        // honest outcomes: yes (with the latest version), no (with the status),
        // inconclusive (GitHub's anonymous rate limit answers 403).
        const releases = update.releases;
        if (releases) {
            let access;
            if (releases.accessible === true) {
                const box = (report.box || {}).ag_version;
                const latest = releases.latest || '?';
                const upToDate = box && latest.replace(/^v/, '') === box;
                access = `access OK · latest ${latest}${box ? (upToDate ? ' (this box is up to date)' : ` — this box runs ${box}`) : ''} · ${releases.latency_ms} ms`;
            } else if (releases.accessible === null) {
                access = `inconclusive — ${releases.note || 'rate-limited'}`;
            } else {
                access = `NO ACCESS (${releases.error || `HTTP ${releases.http_status}`}) — updates cannot download`;
            }
            out.push(line('Releases repo', access));
        }
        if (update.download_token_present !== undefined) {
            out.push(line('Download token', update.download_token_present
                ? 'present (legacy — no longer required, may be removed)'
                : 'not set (not required — releases are public)'));
        }
    }

    // ── Deployed settings ──────────────────────────────────────────────────────
    const env = report.env_sanity || {};
    out.push(heading('Deployed settings (.env)'));
    const envError = sectionError(report, 'env_sanity');
    if (envError) {
        out.push(envError);
    } else if (env.exists === false) {
        out.push(line('File', `${env.path} — DOES NOT EXIST`));
    } else {
        out.push(line('File', `${env.path} · mode ${(env.mode || '').replace('0o', '0')}`));
        if (env.world_readable) {
            out.push('  ⚠ world-readable — this file holds every secret the box has');
        }
        out.push(line('Keys', `${env.keys_present ?? '?'} present / ${env.expected_keys ?? '?'} expected`));
        // Inventory, not an alarm: many Settings keys are optional and never
        // written by the deployed template, so a healthy box always has some —
        // a permanent "Missing: 20 keys" would teach support to ignore the one
        // line built to catch real drift (the RELEASE_DOWNLOAD_TOKEN incident).
        if ((env.missing || []).length) {
            out.push(line('Defaults', `${env.missing.length} key(s) on code defaults: ${env.missing.join(', ')}`));
        }
        if ((env.unknown || []).length) out.push(line('Unknown', env.unknown.join(', ')));
    }

    // ── Storage ────────────────────────────────────────────────────────────────
    const storage = report.storage || {};
    out.push(heading('Storage'));
    const storageError = sectionError(report, 'storage');
    if (storageError) {
        out.push(storageError);
    } else {
        for (const mount of storage.mounts || []) {
            // A filesystem the kernel remounted read-only is the classic silent
            // failure: the box "works" and nothing persists.
            const ro = mount.read_only ? ' · ⚠ READ-ONLY' : '';
            out.push(line(mount.mountpoint, mount.error
                ? `unreadable — ${mount.error}`
                : `${mount.used_percent}% used · ${humanSize(mount.free_bytes)} free${ro}`));
        }
    }

    // ── Packages ───────────────────────────────────────────────────────────────
    out.push(heading('Audio packages'));
    const packages = report.packages;
    const packagesError = errorLine(packages);
    if (packagesError) {
        out.push(packagesError);
    } else if (!packages || !packages.length) {
        out.push('  none');
    } else {
        for (const pkg of packages) {
            const version = pkg.installed_version ? ` ${pkg.installed_version}` : '';
            const unsupported = pkg.supported_here === false ? ' (not supported on this architecture)' : '';
            out.push(line(pkg.label || pkg.id, `${pkg.status}${version}${unsupported}`));
        }
    }

    // ── Services ───────────────────────────────────────────────────────────────
    const services = report.services || {};
    out.push(heading('Services'));
    const servicesError = errorLine(services);
    if (servicesError) {
        out.push(servicesError);
    } else {
        for (const svc of services.managed || []) {
            out.push(line(svc.name, `${svc.state}/${svc.sub_state}   enabled at boot: ${svc.enabled ? 'yes' : 'no'}`));
        }
        const failed = services.failed_elsewhere || [];
        if (failed.length) {
            out.push('');
            out.push(`  Other failed units on this box (${failed.length}):`);
            for (const svc of failed) out.push(`    ${svc.name}`);
        }
        out.push('');
        out.push(`  ${services.total_units ?? '?'} systemd units in total.`);
    }

    // ── Audio stack ────────────────────────────────────────────────────────────
    const stack = report.audio_stack || {};
    out.push(heading('Audio stack'));
    const stackError = errorLine(stack);
    if (stackError) {
        out.push(stackError);
    } else {
        const selected = stack.selected_output;
        out.push(line('Selected output', selected ? `${selected.card_name} (device ${selected.device_id})` : 'none'));
        for (const output of stack.outputs || []) {
            // `label` and `hw` are what tell two outputs of the same card apart. On a
            // box with an onboard codec, card_name alone prints "PCH" twice and "HDMI"
            // three times — five lines nobody can act on, and the analog/SPDIF pair is
            // exactly where an AirPlay receiver ends up on the wrong socket.
            const what = output.label ?? output.card_name ?? output.name ?? '?';
            const where = output.hw ? ` (${output.hw})` : '';
            // The label already spells the USB id out ("Abacus — USB Audio (USB
            // 20b1:30ab)"); appending it again printed it twice on the same line.
            const usb = output.usb_id && !what.includes(output.usb_id)
                ? ` [${output.usb_id}]` : '';
            out.push(line('  detected', `${what}${where}${usb}`));
        }
        for (const svc of stack.services || []) {
            const output = svc.output ? `${svc.output.card_name} (device ${svc.output.device_id})` : 'not pinned';
            // What the service is really told to play on, next to what AG believes.
            // Showing the pin alone cannot reveal the one case worth a support report:
            // the config says one device and the pin says another.
            //
            // undefined and null are NOT the same answer, and printing one for the
            // other is the untruth this whole section exists to remove: a core that
            // predates these fields sends no key at all, and "no device in config"
            // would then assert something the report never received. Absent → say
            // nothing; null → the core looked and found no device.
            const device = svc.configured_device === undefined
                ? ''
                : (svc.configured_device
                    ? ` · config says ${svc.configured_device}`
                    : ' · no device in config');
            const disagree = svc.device_matches_pin === false
                ? `  ⚠ does not match the pin (${svc.pinned_device})`
                : '';
            out.push(line(
                svc.service_id,
                `${svc.configured ? 'AG-managed' : 'hand-written'} · ${output}${device}${disagree}`,
            ));
        }
        for (const source of stack.library_sources || []) {
            out.push(line('  library source', `${source.kind ?? '?'} ${source.mountpoint ?? source.path ?? ''} ${source.label ?? ''}`.trim()));
        }
    }

    // ── Audio live ─────────────────────────────────────────────────────────────
    const live = report.audio_live || {};
    out.push(heading('Audio live'));
    const liveError = sectionError(report, 'audio_live');
    if (liveError) {
        out.push(liveError);
    } else {
        if (live.cards_error) out.push(line('cards', `could not be read — ${live.cards_error}`));
        for (const card of live.cards || []) {
            const usb = card.usbid ? ` [${card.usbid}${card.usbbus ? ` bus ${card.usbbus}` : ''}]` : '';
            // The negotiated link speed, named: a DAC that came up Full-Speed
            // instead of High-Speed is a classic silent degradation.
            const speedNames = { 1.5: 'Low', 12: 'Full', 480: 'High', 5000: 'Super', 10000: 'Super+' };
            const usbSpeed = card.usb_speed_mbps
                ? ` · USB ${card.usb_speed_mbps} Mb/s${speedNames[card.usb_speed_mbps] ? ` (${speedNames[card.usb_speed_mbps]}-Speed)` : ''}`
                : '';
            out.push(line(`card${card.index} ${card.id}`, `${card.description}${usb}${usbSpeed}`));
        }
        const streams = live.active_streams || [];
        if (!streams.length) {
            out.push('  No PCM stream open right now.');
        } else {
            // The bit-perfect proof: what is actually crossing ALSA, not what the
            // config asked for.
            for (const stream of streams) {
                out.push(line(stream.direction, `${stream.stream} · ${stream.format} · ${stream.rate} Hz · ${stream.channels} ch`));
            }
        }
        out.push(line('CPU governor', live.cpu_governor
            ? `${live.cpu_governor}${live.cpu_mhz ? ` · ${live.cpu_mhz} MHz` : ''}`
            : live.cpu_governor));
    }

    // ── Audio tuning ───────────────────────────────────────────────────────────
    const tuning = report.audio_tuning || {};
    out.push(heading('Audio tuning'));
    const tuningError = sectionError(report, 'audio_tuning');
    if (tuningError) {
        out.push(tuningError);
    } else {
        for (const unit of tuning.units || []) {
            const label = (unit.unit || '').replace(/\.service$/, '');
            if (unit.error) {
                out.push(line(label, `could not be read — ${unit.error}`));
                continue;
            }
            // `systemctl show` answers for a unit that does not exist, filling every
            // scheduling property with the default it WOULD apply. Printing that as a
            // tuning line describes software the box does not have. The collector now
            // carries load_state so the two can be told apart.
            //
            // Only `not-found` means absent. systemd also reports `masked` (the unit
            // file is there, deliberately shorted to /dev/null — a routine step on an
            // audiophile box), plus `bad-setting`, `error` and `stub`, where the file
            // exists and something else is wrong. Calling any of those "not installed"
            // sends the reader to reinstall software that is already there, and buries
            // the real diagnostic in a parenthesis contradicting the sentence.
            if (unit.load_state && unit.load_state !== 'loaded') {
                out.push(line(label, LOAD_STATE_TEXT[unit.load_state]
                    || `unit not loaded (${unit.load_state})`));
                continue;
            }
            const cfg = unit.configured || {};
            // The LIVE values lead — they are what the kernel actually applies;
            // the configured ones only appear where they disagree, because a
            // drop-in that failed to apply is exactly that difference.
            const live2 = unit.live || {};
            // A failed live probe carries only {error} (the MainPID exited
            // between systemctl show and the sched syscalls): it must not win
            // over the configured values and print "no realtime scheduling".
            const liveOk = live2.cpu_sched !== undefined;
            const src = liveOk ? live2 : cfg;
            const sched = src.cpu_sched
                ? `${src.cpu_sched}${Number(src.cpu_sched_priority) > 0 ? ` prio ${src.cpu_sched_priority}` : ''}`
                : '—';
            const parts = [
                sched,
                `nice ${src.nice ?? '—'}`,
                `CPUs ${live2.cpu_affinity || cfg.cpu_affinity || 'all'}`,
                live2.io ? `io ${live2.io}` : (cfg.io_class ? `io ${cfg.io_class} prio ${cfg.io_priority}` : 'io —'),
                `acct io:${cfg.io_accounting ?? '?'} ip:${cfg.ip_accounting ?? '?'}`,
            ];
            const mismatch = liveOk && cfg.cpu_sched && live2.cpu_sched
                && (cfg.cpu_sched !== live2.cpu_sched || String(cfg.cpu_sched_priority) !== String(live2.cpu_sched_priority))
                ? ` ⚠ configured ${cfg.cpu_sched} prio ${cfg.cpu_sched_priority}` : '';
            out.push(line(label, parts.join(' · ') + mismatch));
            const facts = [];
            if (live2.error) facts.push(`live read failed — ${live2.error}`);
            // Restart=always masks crashes — the counter unmasks them.
            if (unit.restarts) facts.push(`⚠ ${unit.restarts} restart(s)`);
            if (unit.started_at) facts.push(`started ${unit.started_at}`);
            if (unit.memory_bytes !== undefined) facts.push(`mem ${humanSize(unit.memory_bytes)}`);
            if (unit.cpu_used_seconds !== undefined) facts.push(`cpu ${unit.cpu_used_seconds}s`);
            if (facts.length) out.push(line('', facts.join(' · ')));
            if ((cfg.drop_ins || []).length) {
                out.push(line('', `drop-ins: ${cfg.drop_ins.join(', ')}`));
            }
        }
    }

    // ── AV network ─────────────────────────────────────────────────────────────
    const peers = report.av_peers || {};
    out.push(heading('AV network'));
    const peersError = sectionError(report, 'av_peers');
    if (peersError) {
        out.push(peersError);
    } else {
        const renderers = peers.upnp_renderers;
        if (peers.upnp_renderers_error) {
            out.push(line('UPnP renderers', `could not scan — ${peers.upnp_renderers_error}`));
        } else if (!(renderers || []).length) {
            out.push(line('UPnP renderers', 'none found on this network segment'));
        } else {
            for (const renderer of renderers) {
                out.push(line('renderer', `${renderer.name} @ ${renderer.host}${renderer.is_local ? ' (this box)' : ''}`));
            }
        }
        const servers = peers.upnp_servers;
        if (peers.upnp_servers_error) {
            out.push(line('UPnP servers', `could not scan — ${peers.upnp_servers_error}`));
        } else if (!(servers || []).length) {
            // Multicast does not cross subnets: a server on another segment is
            // invisible here without being wrong.
            out.push(line('UPnP servers', 'none found on this network segment'));
        } else {
            for (const server of servers) {
                out.push(line('server', `${server.name} @ ${server.host}`));
            }
        }
        const hqp = peers.hqplayer || {};
        // What the network holds, whatever the configuration says: "not
        // configured" alone cannot tell a box that chose not to use HQPlayer
        // from one that never found it.
        const hqFound = hqp.found_on_network;
        const hqNetwork = hqp.discovery_error ? ` · network scan failed (${hqp.discovery_error})`
            : hqFound === undefined ? ''
                : hqFound.length ? ` · found on network: ${hqFound.map(h => h.host + (h.active_filter ? ` (filter ${h.active_filter})` : '')).join(', ')}`
                    : ' · none found on the local /24';
        if (!hqp.configured_host) {
            out.push(line('HQPlayer', `not configured${hqNetwork}`));
        } else {
            const probe = hqp.probe || {};
            const engine = hqp.available === undefined ? ''
                : hqp.available ? ` · engine answering (${hqp.state})` : ' · engine NOT answering';
            out.push(line('HQPlayer', probe.reachable
                ? `${hqp.configured_host}:${hqp.port} reachable · ${probe.latency_ms} ms${engine}${hqNetwork}`
                : `${hqp.configured_host}:${hqp.port} UNREACHABLE (${probe.error || '?'})${hqNetwork}`));
        }
        const roon = peers.roon || {};
        const roonFound = roon.found_on_network;
        const roonNetwork = roon.discovery_error ? ` · network scan failed (${roon.discovery_error})`
            : roonFound === undefined ? ''
                : roonFound ? ` · announced on network at ${roonFound.host}:${roonFound.port}`
                    : ' · no Core announced on the network';
        if (roon.in_use === false) {
            // roon_core_host DEFAULTS to 127.0.0.1, so a host alone never means
            // "configured" — without the pairing token the box does not use
            // Roon, and probing would print a false "configured but down".
            out.push(line('Roon Core', `not in use on this box${roonNetwork}`));
        } else if (!roon.configured_host) {
            out.push(line('Roon Core', `not configured${roonNetwork}`));
        } else if (roon.probe) {
            const probe = roon.probe;
            out.push(line('Roon Core', probe.reachable
                ? `${roon.configured_host}:${probe.port} reachable · ${probe.latency_ms} ms${roonNetwork}`
                : `${roon.configured_host}:${probe.port || ''} UNREACHABLE (${probe.error || '?'})${roonNetwork}`));
        } else {
            out.push(line('Roon Core', `${roon.configured_host} configured${roonNetwork}`));
        }
    }

    // ── Library ────────────────────────────────────────────────────────────────
    const library = report.library || {};
    out.push(heading('Music library'));
    const libraryError = errorLine(library);
    if (libraryError) {
        out.push(libraryError);
    } else if (!library.has_local_library) {
        out.push('  No local library declared — this box plays streaming sources only.');
    } else {
        for (const root of library.roots_detail || []) {
            out.push(line(root.path, `exists: ${root.exists ? 'yes' : 'no'} · readable: ${root.readable ? 'yes' : 'no'}`));
        }
        // Three ways of having no database, and they are three different diagnostics:
        // an unreadable config means nothing was learned, which is not the same as a
        // box MPD never indexed.
        const database = library.mpd_database || {};
        let databaseLine;
        if (database.declared === 'config_unreadable') {
            databaseLine = "mpd.conf could not be read — the database path is unknown";
        } else if (database.declared === 'not_declared') {
            databaseLine = 'no db_file declared — MPD keeps no persistent database';
        } else if (database.exists) {
            databaseLine = `${database.path} · ${humanSize(database.size_bytes)} · indexed ${database.modified}`;
        } else {
            databaseLine = `${database.path || '—'} · never indexed`;
        }
        out.push(line('MPD database', databaseLine));
    }
    // MPD's own numbers answer what a database file size cannot; rendered outside
    // the has_local_library branch — a streaming-only box still runs MPD.
    const stats = library.mpd_stats;
    if (stats && !libraryError) {
        if (stats.error) {
            out.push(line('MPD stats', `unavailable — ${stats.error}`));
        } else {
            out.push(line('MPD stats', `${stats.songs ?? '?'} songs · ${stats.albums ?? '?'} albums · ${stats.artists ?? '?'} artists${stats.db_updated ? ` · db updated ${stats.db_updated}` : ''}`));
            if (stats.mpd_error) out.push(line('MPD error', stats.mpd_error));
        }
    }

    // ── Streaming ──────────────────────────────────────────────────────────────
    const streaming = report.streaming || {};
    out.push(heading('Streaming accounts'));
    const streamingError = errorLine(streaming);
    if (streamingError) {
        out.push(streamingError);
    } else {
        // Every key IS a service except the metadata ones listed here. Excluding the
        // known non-services rather than listing the known services on purpose: a
        // hardcoded list silently drops any service the core later probes, and the
        // section would still look complete — a second place to keep in step with
        // `_collect_streaming`, drifting in the direction that hides things.
        // A value of null is a THIRD answer — the probe could not be run — and must
        // never render as "not signed in", the shape this section already lied in.
        const STREAMING_META_KEYS = ['probe_errors', 'error'];
        const errors = streaming.probe_errors || {};
        for (const [name, connected] of Object.entries(streaming)) {
            if (STREAMING_META_KEYS.includes(name)) continue;
            const state = connected === null || connected === undefined
                ? `unknown — ${errors[name] || 'could not be read'}`
                : (connected ? 'signed in' : 'not signed in');
            out.push(line(name, state));
        }
    }

    // ── Configuration files ────────────────────────────────────────────────────
    out.push(heading('Configuration files'));
    const configs = report.configs;
    const configsError = errorLine(configs);
    if (configsError) {
        out.push(configsError);
    } else if (!configs || !configs.length) {
        out.push('  none');
    } else {
        for (const config of configs) {
            out.push('');
            out.push(`  ── ${config.service_id} — ${config.path}`);
            // Backups first: a config that is missing or unreadable is exactly
            // when "restore it from the Backups button" is the advice.
            if (config.backups_total !== undefined) {
                out.push(`     (${config.backups_total
                    ? `${config.backups_total} backup(s), latest ${config.last_backup || '—'}`
                    : 'no backups yet'})`);
            }
            if (!config.exists) {
                out.push('     (file does not exist)');
                continue;
            }
            if (config.error) {
                out.push(`     (unreadable — ${config.error})`);
                continue;
            }
            const notes = [`${config.dropped_comments ?? 0} comment lines omitted`];
            if (config.redacted) notes.push(`${config.redacted} value(s) redacted`);
            if (config.truncated) notes.push(`${config.truncated} line(s) cut`);
            out.push(`     (${notes.join(', ')})`);
            for (const configLine of config.lines || []) out.push(`     ${configLine}`);
        }
    }

    // ── Journal ────────────────────────────────────────────────────────────────
    const journal = report.journal || {};
    out.push(heading(`Recent errors (journal, ${journal.window || '7 days'})`));
    const journalError = report.journal === undefined ? sectionError(report, 'journal') : null;
    if (journalError) {
        out.push(journalError);
    } else {
        // Boot history first: five boots in two days points at power or
        // storage, not software, and reframes everything below it.
        const boots = journal.boots;
        if (boots) {
            out.push(line('Boots', `${boots.total} recorded`));
            for (const boot of boots.recent || []) out.push(`    ${boot}`);
            out.push('');
        }
        // journal.error is the UNIT query failing; kernel warnings and boot
        // history are collected independently and must still be shown.
        if (journal.error) {
            out.push(`  ⚠ unit errors could not be read — ${journal.error}`);
        } else if (!(journal.lines || []).length) {
            // A real answer, not an absence: these units logged no error in the window.
            out.push('  none — the AG-managed units logged no error in this window.');
        } else {
            for (const journalLine of journal.lines) out.push(`  ${journalLine}`);
        }
        if (journal.boots_error) out.push(`  ⚠ boot history could not be read — ${journal.boots_error}`);
        // The kernel is where a DAC dropping off the bus, a dying SD card or an
        // undervolted supply speak — none of it belongs to any unit.
        if (journal.kernel_error) {
            out.push('');
            out.push(`  ⚠ kernel journal could not be read — ${journal.kernel_error}`);
        } else if (journal.kernel !== undefined) {
            out.push('');
            out.push('  kernel (usb / storage / power / thermal):');
            if (!(journal.kernel || []).length) {
                out.push('    none — no hardware-related kernel warning in this window.');
            } else {
                for (const kernelLine of journal.kernel) out.push(`    ${kernelLine}`);
            }
        }
    }

    out.push('');
    return out.join('\n');
}
