/**
 * @module license-docs
 * @description Static HTML content for the License Terms modal (options + EULA).
 * Displayed via UIComponents.InfoModal in ag-license-status.
 */

export const LICENSE_TERMS_TITLE = 'Editions & License';

export const LICENSE_TERMS_HTML = `
    <h3 style="margin:0 0 .6em">License Options</h3>

    <p>Audiogravi<sup>ty</sup> is available in three tiers: a <strong>30-day trial</strong> with full access,
    a free <strong>Starter Edition</strong> that activates automatically when the trial ends,
    and a <strong>Pro License</strong> — a one-time purchase that permanently unlocks all features.</p>

    <h4 style="margin:1em 0 .4em">Trial — 30 days</h4>
    <p>Full access to every feature, automatically activated on first run. No action required.
    Days remaining are shown in <strong>Admin › License</strong>.</p>

    <h4 style="margin:1em 0 .4em">Starter Edition — Free</h4>
    <p>Activated automatically when the trial expires — no action required. Includes the essentials
    to run and monitor your audio system:</p>
    <ul style="margin:.4em 0;padding-left:1.4em">
        <li><strong>Profiles</strong> — one-click switching between pre-configured audio chain scenarios; activates required services and stops conflicting ones automatically</li>
        <li><strong>Services</strong> — real-time monitoring and control of audio services (start / stop / restart / enable at boot) with live CPU, memory and I/O metrics</li>
        <li><strong>Software</strong> — install, update and remove audio packages from the Software tab</li>
        <li><strong>System</strong> — hardware dashboard: CPU, temperature, memory, disk and network at a glance; full audio device inventory (ALSA cards, USB interfaces, subdevices)</li>
        <li><strong>Users</strong> — role-based access management (Admin, User, Guest) with account creation, passwords and session history</li>
    </ul>

    <h4 style="margin:1em 0 .4em">Pro License — one-time payment, no subscription</h4>
    <p>Permanently unlocks all features. Bound to one installation on one machine.
    Includes all updates within the purchased major version (e.g. v1.x).
    Existing holders receive a <strong>preferential upgrade price</strong> for new major versions.</p>
    <ul style="margin:.4em 0;padding-left:1.4em">
        <li><strong>Systemd Configuration</strong> — fine-tune audio service drop-ins: CPU affinity, SCHED_FIFO / RR priority, MEMLOCK and RTPRIO — eliminates scheduling jitter for bit-perfect, glitch-free playback</li>
        <li><strong>Performance Optimization</strong> — per-core CPU governor control, real-time thermal throttle detection, µs-scale latency benchmarks (cyclictest) and live RT process monitor (MPD, Roon, shairport-sync scheduling class and priority)</li>
        <li><strong>Audio Services Configuration</strong> — safe in-place editing of audio service configuration files (MPD, Roon, AirPlay, upmpdcli…) with live syntax validation</li>
        <li><strong>Audio Pipeline</strong> — interactive DAG visualisation of the full signal chain from source to DAC: bit-perfection badge, format (bit depth / sample rate) and latency per link, real-time output steering without stopping playback</li>
        <li><strong>Player</strong> — unified playback control across all sources (MPD, Roon, AirPlay, UPnP): transport controls, seek, volume, cover art and real-time Hi-Fi format readout (PCM / DSD / MQA, sample rate, bit depth, bitrate)</li>
        <li><strong>Library</strong> — high-resolution music library for Roon, MPD, UPnP servers (MinimServer, upmpdcli), Qobuz and Tidal: album browsing, full-text search, queue management and output zone selection. Qobuz and Tidal require an active subscription to their respective services.</li>
    </ul>
    <p style="margin:.6em 0 0;font-size:.8rem;color:inherit;opacity:.7">Recommended platform: Linux Debian / DietPi. Other Linux distributions may work but are not officially supported.</p>

    <table style="width:100%;border-collapse:collapse;font-size:.8rem;margin-top:1.4em">
        <thead>
            <tr style="border-bottom:1px solid currentColor">
                <th style="text-align:left;padding:.4em .6em"></th>
                <th style="padding:.4em .6em">Trial</th>
                <th style="padding:.4em .6em">Starter</th>
                <th style="padding:.4em .6em">Pro</th>
            </tr>
        </thead>
        <tbody>
            <tr style="border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)">
                <td style="padding:.3em .6em;font-size:.7rem;text-transform:uppercase;opacity:.6;letter-spacing:.04em" colspan="4">General</td>
            </tr>
            <tr><td style="padding:.3em .6em">Cost</td><td style="text-align:center">Free</td><td style="text-align:center">Free</td><td style="text-align:center">One-time</td></tr>
            <tr><td style="padding:.3em .6em">Duration</td><td style="text-align:center">30 days</td><td style="text-align:center">Unlimited</td><td style="text-align:center">Unlimited</td></tr>
            <tr><td style="padding:.3em .6em">Activation</td><td style="text-align:center">Automatic</td><td style="text-align:center">Automatic</td><td style="text-align:center">Manual</td></tr>
            <tr><td style="padding:.3em .6em">Updates</td><td style="text-align:center">—</td><td style="text-align:center">—</td><td style="text-align:center">v1.x included</td></tr>
            <tr style="border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)">
                <td style="padding:.6em .6em .3em;font-size:.7rem;text-transform:uppercase;opacity:.6;letter-spacing:.04em" colspan="4">Starter features</td>
            </tr>
            <tr><td style="padding:.3em .6em">Profiles</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Services</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Software</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">System</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Users</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr style="border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)">
                <td style="padding:.6em .6em .3em;font-size:.7rem;text-transform:uppercase;opacity:.6;letter-spacing:.04em" colspan="4">Pro features</td>
            </tr>
            <tr><td style="padding:.3em .6em">Player</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Library</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Audio Pipeline</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Audio Services Configuration</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Systemd Configuration</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Performance Optimization</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
        </tbody>
    </table>

    <h4 style="margin:1.4em 0 .4em">How to Purchase</h4>
    <ol style="margin:.4em 0;padding-left:1.4em;display:flex;flex-direction:column;gap:.3em">
        <li>Click <strong>Pay with PayPal</strong> in <strong>Admin › License</strong>.</li>
        <li>You will receive your <strong>license key</strong> by email within seconds.</li>
        <li>Click <strong>License Key</strong>, enter your key and activate this machine.</li>
        <li>All features are immediately available — no restart required.</li>
    </ol>

    <hr style="margin:1.5em 0">
    <h3 style="margin:0 0 .6em">End-User License Agreement (EULA)</h3>

    <p>By downloading, installing, or using this software, you agree to the following terms.
    If you do not accept them, you must not install or use the software.</p>

    <p style="font-size:.85em;color:inherit;opacity:.8">
    <strong>"Software"</strong> — Audiogravi<sup>ty</sup> and all its components.
    <strong>"Starter Edition"</strong> — the free tier activated after trial expiry.
    <strong>"Pro License"</strong> — the paid, perpetual single-machine license.
    <strong>"License File"</strong> — the cryptographically signed <code>.lic</code> file bound to your device.
    <strong>"License Key"</strong> — the unique order code used to activate and download the License File.
    </p>

    <h4 style="margin:1em 0 .4em">1. Ownership</h4>
    <p>The Software is licensed, not sold. All title, copyright, and intellectual property rights
    remain the exclusive property of the Licensor (Audiogravi<sup>ty</sup>).</p>

    <h4 style="margin:1em 0 .4em">2. Grant of License</h4>
    <p><strong>Starter Edition</strong> — Non-exclusive, non-transferable, free and perpetual use within
    the Starter Edition functional limits.</p>
    <p><strong>Pro License</strong> — Perpetual, non-exclusive, non-transferable use of the Software
    and updates within the purchased major version, on one installation, one machine.
    Pro License holders receive a preferential upgrade price for new major versions.</p>

    <h4 style="margin:1em 0 .4em">3. Trial License</h4>
    <p>A 30-day trial is automatically activated on first installation, providing full access.
    Upon expiry, the Software reverts to Starter Edition. Any attempt to bypass this mechanism
    constitutes a breach of this EULA.</p>

    <h4 style="margin:1em 0 .4em">4. Restrictions</h4>
    <p>You may not: reverse-engineer or decompile the Software; distribute, sell, or transfer it;
    create derivative works; tamper with license enforcement; or share your License Key or License File
    with any third party.</p>

    <h4 style="margin:1em 0 .4em">5. Disclaimer &amp; Liability</h4>
    <p>The Software is provided without warranty. The Licensor's total liability shall not exceed the
    amount paid by the Licensee. Indirect, incidental, or punitive damages are excluded to the extent
    permitted by law.</p>

    <h4 style="margin:1em 0 .4em">6. Governing Law</h4>
    <p>This EULA is governed by French law. Disputes are subject to the exclusive jurisdiction of
    French courts.</p>

    <h4 style="margin:1em 0 .4em">7. General</h4>
    <p>This EULA constitutes the entire agreement between the parties and supersedes all prior
    communications. If any provision is unenforceable, the remainder continues in effect.
    All rights not expressly granted are reserved by the Licensor.</p>
`;
