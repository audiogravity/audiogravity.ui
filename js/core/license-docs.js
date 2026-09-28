/**
 * @module license-docs
 * @description Static HTML content for the License Terms modal (options + EULA).
 * Displayed via UIComponents.InfoModal in ag-license-status (EDITIONS & LICENSE).
 */

export const LICENSE_TERMS_TITLE = 'Editions & License';

export const LICENSE_TERMS_HTML = `
    <h3 style="margin:0 0 .6em">License Options</h3>

    <p>Audiogravi<sup>ty</sup> comes in two editions — a free <strong>Starter Edition</strong> and a
    <strong>Pro License</strong> — and every install starts with a <strong>30-day trial</strong> of Pro.</p>

    <h4 style="margin:1em 0 .4em">Trial — 30 days</h4>
    <p>Full access to every feature, automatically activated on first run. No action required.
    Days remaining are shown in <strong>Admin › License</strong>.</p>

    <h4 style="margin:1em 0 .4em">Starter Edition — Free</h4>
    <p>Activated automatically when the trial expires — no action required. Includes the essentials
    to run and monitor your audio system:</p>
    <ul style="margin:.4em 0;padding-left:1.4em">
        <li><strong>Profiles</strong> — one-click switching between pre-configured audio chain scenarios; activates required services and stops conflicting ones automatically</li>
        <li><strong>Services</strong> — real-time monitoring and control of audio services (start / stop / restart / enable at boot) with live CPU, memory and I/O metrics, each with a sparkline of its recent values</li>
        <li><strong>Software</strong> — install, update and remove audio packages with dry-run simulation before committing changes</li>
        <li><strong>System</strong> — hardware dashboard: CPU, temperature, memory, disk and network at a glance; full audio device inventory (ALSA cards, USB interfaces, subdevices)</li>
        <li><strong>Users</strong> — role-based access management (Admin, User, Guest) with WebAuthn / passkeys login</li>
        <li><strong>Push notifications</strong> — iOS, Android and desktop alerts when a service goes down, the processor overheats, a software update is available or a profile is activated</li>
        <li><strong>Audio Services Config</strong> — safe in-place editing of each audio service's own configuration file, with a diff before saving, a basic syntax check and automatic backups</li>
        <li><strong>Guided provisioning</strong> — generate a minimal, correct configuration for the whole stack (output, music library, network mounts) in a few clicks, instead of editing each service by hand (administrators only)</li>
        <li><strong>DSD bit-perfect protection</strong> — automatic ALSA hardware volume lock during DSD playback</li>
        <li><strong>Now Playing</strong> — display-only: shows current track, cover art, format and progress across all sources (transport controls require Pro)</li>
    </ul>

    <h4 style="margin:1em 0 .4em">Pro License — one-time payment, no subscription</h4>
    <p>Permanently unlocks all features. Bound to one installation on one machine.
    Includes all updates within the purchased major version (e.g. v1.x).
    Existing holders receive a <strong>preferential upgrade price</strong> for new major versions.
    Everything in Starter, plus:</p>
    <ul style="margin:.4em 0;padding-left:1.4em">
        <li><strong>Player</strong> — full transport controls across all sources (MPD, Roon, AirPlay, UPnP, HQPlayer): play/pause, seek, next/prev, volume, repeat/shuffle and real-time Hi-Fi format readout (PCM / DSD, sample rate, bit depth, bitrate)</li>
        <li><strong>Library</strong> — high-resolution music library for Roon, MPD, UPnP servers (MinimServer, upmpdcli), Qobuz, Tidal and HIGHRESAUDIO: album browsing, full-text search, queue management and output zone selection; <strong>UPnP Control Point</strong> to send audio directly to any DLNA/UPnP MediaRenderer on the network (amplifiers, networked speakers…)</li>
        <li><strong>Output steering</strong> — switch between USB, Toslink and HDMI outputs without touching the streamer</li>
        <li><strong>Internet radio</strong> — Radio Browser directory, custom stations, favourites with Hi-Res filtering</li>
        <li><strong>HQPlayer DSP remote</strong> — change filter, noise shaper, output mode and volume from the couch, with automatic network discovery</li>
        <li><strong>Audio Pipeline</strong> — interactive DAG visualisation of the full signal chain from source to DAC: full-resolution badge on the link to the DAC, format per link, real-time output steering without stopping playback</li>
        <li><strong>Systemd Configuration</strong> — fine-tune audio service drop-ins: CPU affinity, SCHED_FIFO / RR priority, MEMLOCK and RTPRIO — eliminates scheduling jitter for bit-perfect, glitch-free playback</li>
        <li><strong>Performance Optimization</strong> — per-core CPU governor control, real-time thermal throttle detection, µs-scale latency benchmarks (cyclictest) and live RT process monitor</li>
        <li><strong>Sleep timer</strong> — automatic pause after a set duration</li>
    </ul>
    <p style="margin:.6em 0 0;font-size: var(--font-size-sm);color:inherit;opacity:.7">Qobuz, Tidal and HIGHRESAUDIO require an active subscription to their respective services.
    Recommended platform: Linux Debian / DietPi. Other Linux distributions may work but are not officially supported.</p>

    <table style="width:100%;border-collapse:collapse;font-size: var(--font-size-sm);margin-top:1.4em">
        <thead>
            <tr style="border-bottom:1px solid currentColor">
                <th style="text-align:left;padding:.4em .6em"></th>
                <th style="padding:.4em .6em">Trial</th>
                <th style="padding:.4em .6em">Starter</th>
                <th style="padding:.4em .6em">Pro</th>
            </tr>
        </thead>
        <tbody>
            <tr><td style="padding:.3em .6em">Cost</td><td style="text-align:center">Free</td><td style="text-align:center">Free</td><td style="text-align:center">One-time</td></tr>
            <tr><td style="padding:.3em .6em">Duration</td><td style="text-align:center">30 days</td><td style="text-align:center">Unlimited</td><td style="text-align:center">Unlimited</td></tr>
            <tr><td style="padding:.3em .6em">Activation</td><td style="text-align:center">Automatic</td><td style="text-align:center">Automatic</td><td style="text-align:center">Manual</td></tr>
            <tr><td style="padding:.3em .6em">Updates</td><td style="text-align:center">—</td><td style="text-align:center">—</td><td style="text-align:center">v1.x included</td></tr>
            <tr><td style="padding:.3em .6em">Profiles</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Services</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Software</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">System</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Users &amp; WebAuthn</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Push notifications</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Now Playing (display)</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Player (controls)</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Library</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Output steering</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Internet radio</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">HQPlayer DSP</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Audio Pipeline</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Audio Services Config</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Guided provisioning</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Systemd Config</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Performance</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">DSD bit-perfect</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td><td style="text-align:center">✓</td></tr>
            <tr><td style="padding:.3em .6em">Sleep timer</td><td style="text-align:center">✓</td><td style="text-align:center">—</td><td style="text-align:center">✓</td></tr>
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

    <!-- rule 12 exception — sized against the modal body rather than from the scale;
         see the note on .package-version-info in css/utilities.css. -->
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

    <h4 style="margin:1em 0 .4em">6. License Validation Data</h4>
    <p>To bind a License to a single machine and to enforce this EULA, the Software contacts the
    Licensor's license server on activation and once every 24 hours. It transmits a derived device
    identifier, the primary MAC address, the operating system and architecture, the Software version,
    the current license status and, during the trial, its start date; the License File itself is
    transmitted when it is verified. The server records the network address the request arrives from.
    No personal content, music library data, or third-party service credentials are transmitted. This
    exchange is a functional requirement of the license and cannot be disabled.</p>

    <h4 style="margin:1em 0 .4em">7. Governing Law</h4>
    <p>This EULA is governed by French law. Disputes are subject to the exclusive jurisdiction of
    French courts.</p>

    <h4 style="margin:1em 0 .4em">8. General</h4>
    <p>This EULA constitutes the entire agreement between the parties and supersedes all prior
    communications. If any provision is unenforceable, the remainder continues in effect.
    All rights not expressly granted are reserved by the Licensor.</p>
`;
