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
 * Format bytes as a human-readable size.
 * @param {number} bytes - Size in bytes.
 * @returns {string} e.g. "228.1 kB".
 */
function humanSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—';
    const units = ['B', 'kB', 'MB', 'GB'];
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
            out.push(line(`net ${iface.name}`, `${addresses || 'no address'}${iface.is_up === false ? ' (down)' : ''}`));
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
            out.push(line('  detected', `${output.card_name ?? output.name ?? '?'}${output.usb_id ? ` [${output.usb_id}]` : ''}`));
        }
        for (const svc of stack.services || []) {
            const output = svc.output ? `${svc.output.card_name} (device ${svc.output.device_id})` : 'not pinned';
            out.push(line(svc.service_id, `${svc.configured ? 'AG-managed' : 'hand-written'} · ${output}`));
        }
        for (const source of stack.library_sources || []) {
            out.push(line('  library source', `${source.kind ?? '?'} ${source.mountpoint ?? source.path ?? ''} ${source.label ?? ''}`.trim()));
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

    // ── Streaming ──────────────────────────────────────────────────────────────
    const streaming = report.streaming || {};
    out.push(heading('Streaming accounts'));
    const streamingError = errorLine(streaming);
    if (streamingError) {
        out.push(streamingError);
    } else {
        for (const [name, connected] of Object.entries(streaming)) {
            out.push(line(name, connected ? 'signed in' : 'not signed in'));
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

    out.push('');
    return out.join('\n');
}
