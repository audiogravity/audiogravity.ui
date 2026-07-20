# Audiogravity UI — Core API Contract

The UI communicates with the core exclusively via:
- **REST** (JSON over HTTPS) — all endpoints under the base URL
- **SSE** — real-time event stream at `/sse`
- **WebSocket** — PTY terminal at `/sysinfo/terminal/ws`

Full interactive documentation is available at **`/docs`** (Swagger UI) on a
running Audiogravity core.

---

## Base URL

Configured at runtime via `window.AG_CONFIG.apiUrl` (injected by `install.sh`).
Default in dev: `/api` (Vite proxy → `http://localhost:8000`).

## Authentication

Every request must carry:

| Header | Value |
|---|---|
| `X-API-Key` | Static API key (set in backend `.env`) |
| `Authorization` | `Bearer <JWT>` (after login) |

JWT tokens are obtained from `POST /auth/login` and stored in
`localStorage` / `sessionStorage` depending on the user's persistence setting.

---

## Endpoint groups

### Auth — `/auth/*`
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Password login → JWT |
| POST | `/auth/logout` | Invalidate session |
| GET | `/auth/users` | List users (admin) |
| POST | `/auth/users` | Create user (admin) |
| PUT | `/auth/users/{id}` | Update user |
| DELETE | `/auth/users/{id}` | Delete user |
| GET | `/auth/users/active` | Current user info |
| POST | `/auth/webauthn/register/begin` | Start passkey registration |
| POST | `/auth/webauthn/register/complete` | Complete passkey registration |
| POST | `/auth/webauthn/login/begin` | Start passkey login — always **200** with authentication options (empty `allowCredentials` when the user is unknown or has no passkeys); it never 404s, so it cannot be used to enumerate usernames |
| POST | `/auth/webauthn/login/complete` | Complete passkey login |
| GET | `/auth/webauthn/credentials` | List registered passkeys |
| DELETE | `/auth/webauthn/credentials/{id}` | Remove passkey |

### Audio Pipeline — `/audio_pipeline/*`
| Method | Path | Description |
|---|---|---|
| GET | `/audio_pipeline/current` | Current pipeline state + now playing |
| GET | `/audio_pipeline/topology/view` | Read `audio-topology.json` (user-declared hi-fi chain) |
| POST | `/audio_pipeline/topology/save` | Write `audio-topology.json` (auto-backup + hot-reload) |
| POST | `/audio_pipeline/control` | Transport controls (play/pause/next…) — body `{ source_id, control_id?, action, volume?/seek_position? }`. **`control_id`** is the routing handle from the item (`NowPlayingItem.control_id`) and wins over `source_id`; commands route to the device that **plays** the content (MPD locally, the renderer for a cast, HQPlayer, Roon). Handles: pipeline sources (`src_mpd`…), `src_hqplayer`, `upnp_renderer`. |
| GET | `/audio_pipeline/library-cover/{path}?sig=` | **Renderer-facing** (public, HMAC-signed): local-library album art for a cast file's `albumArtURI`. Not called by the UI. |

### Library — `/library/*`
| Method | Path | Description |
|---|---|---|
| POST | `/library/queue` | Add/play item — **routed to HQPlayer when it is the selected output** (`use_as_output`, decided server-side so clients never diverge). Destination resolved by one shared router (`core.playback_output`) used by every play path: **501** for a streaming source (Qobuz/Tidal/HRA), which HQPlayer cannot resolve — it reads items through MPD, so only the local library and stream URLs reach it today (cf. spec §7.4); **409** when a network renderer **and** HQPlayer are both selected, since AG will not guess which device you meant; **Roon is never diverted** — a Roon zone is its own output chain and never touches the local DAC HQPlayer replaces. HQPlayer failures surface as **503** carrying its own diagnosis. Otherwise routes to the active UPnP renderer when connected and action='play' (streaming **and** local library: a remote renderer pulls local files via the signed stream URL below; the local DAC / on-host renderer stay MPD-direct) |
| GET | `/library/favorite-ids?source_id=&item_type=album` | Favorited item ids on a streaming source (Qobuz/Tidal/HRA) → `{ ids: [...] }`. Used to render the accurate ★ state on browse/search grids |
| POST | `/library/favorite` | Add an item to a streaming source's favorites — body `FavoriteRequest { source_id, item_id, item_type: "album" }` |
| DELETE | `/library/favorite?source_id=&item_id=&item_type=album` | Remove an item from a streaming source's favorites |
| GET | `/library/stream/{path}?sig=` | **Renderer-facing** (public, HMAC-signed, HTTP Range/206): serves a local-library file for a remote renderer to pull. Not called by the UI. |
| POST | `/library/upnp-play` | Play UPnP item — body gains **`duration`** (carried through when the play is routed to HQPlayer, so the now-playing card keeps the track length). Routed to HQPlayer when it is the selected output, **honouring `action`**: `add` appends to the HQPlayer queue and leaves playback untouched (it used to clear the queue and jump to the track while reporting a successful enqueue). The stream is badged `origin: "upnp"`, not `library`. Same **409** conflict rule as `/library/queue`; failures → **503** with HQPlayer's diagnosis. Otherwise routed to the renderer or MPD |
| GET | `/library/upnp-browse?location=<device_url>&object_id=…` | Browse ContentDirectory — **`location` param (was `control_url`)** |
| GET | `/library/search?location=<device_url>` | Search UPnP ContentDirectory — **`location` param (was `control_url`)** |
| GET | `/library/upnp-known-servers` | List discovered UPnP servers — returns `location` field |
| GET | `/library/upnp-servers` | Scan for new UPnP servers |
| GET | `/library/roon-zones` | List Roon zones |
| GET | `/library/highresaudio-discover` | HRA curated album grid ("High-Res Essentials") |
| GET | `/library/highresaudio-category?category=<title>` | HRA shop category album grid (e.g. `Editors Choice`, `Bestsellers`) |

> Streaming sources are addressed via `source_id`: `/library/albums?source_id=src_highresaudio` (favourites / My Album), `/library/search?source_id=src_highresaudio&q=…`, and `POST /library/queue` with `source_id=src_highresaudio` (`item_type` `album` or `track`). Same pattern as `src_qobuz` / `src_tidal`.

> **Artist drill-down:** `GET /library/albums?source_id=…&artist_id=…` lists a single artist's albums for **every** source. `artist_id` is source-specific — it is the value returned as an artist's `id` by `GET /library/search`: the artist **name** for MPD and HIGHRESAUDIO, the **item_key** for Roon, and the numeric **artist id** for Qobuz and Tidal. (Artists are navigational only — they are not queueable via `POST /library/queue`, which accepts `track` / `album` / `playlist`.)

> **Renderer cast = content item + output (control contract, spec §3):** every now-playing item carries two separate identities — **`control_id`** (the ROUTING handle: the device/engine that plays the content and receives commands; equals `source_id` for pipeline sources) and display fields (`origin`, `display_name`), plus **`played_on`** (output id where the audio comes out: `"local"` or a renderer UDN — display only, never routes). When content plays on an active native renderer (Marantz, Linn, a remote AG box), the item is badged with the **content identity** — `origin` resolved from the loaded URI (`qobuz`, `library`, `upnp` + server name, or **`external`** when a third-party controller drives the renderer), `display_name` from that origin, `played_on` = the renderer UDN — while `source_id`/`control_id` stay `"upnp_renderer"` as the internal routing handle (never displayed). Controls go through `POST /audio_pipeline/control` or `POST /player/control` with `control_id` (the handle works even when the renderer is the selected output but **Stopped**). A selected-but-stopped renderer no longer yields a synthetic item: it is carried by `player_state.outputs[]` (entry with `transport_state: "STOPPED"`, `active_output_id` pointing at it, and `output_label` kept); the idle state also carries `control_id: "upnp_renderer"` so the stopped cast stays controllable after a backend restart. **`active` marks the output actually carrying the audio**, not merely a reachable selection: a renderer sitting STOPPED while a local source plays leaves `active` on `local` (otherwise locally-played audio was badged "→ renderer", and since clients read the error of the active output only, a local ALSA failure became invisible). When nothing plays, the selected renderer keeps the active spot. An on-host (local-MPD) renderer is never surfaced this way — it is not selectable as an output. **HQPlayer follows the same model as a PROCESSOR (spec §7)**: its now-playing item is badged with the content identity — `origin: "library"` for AG-pushed tracks, `origin: "external"` (no title — the HQPlayer API does not expose it) when something else drives HQPlayer — with `played_on: "local"` (NAA-gated) and `control_id: "src_hqplayer"` as the routing handle; HQPlayer itself appears as a processor step in `signal_path` when the topology declares it.

> **Queue items** (`GET /library/queue?source_id=…`) carry an **`origin`** field (`radio`, `qobuz`, `tidal`, `upnp`, `library`…) that mirrors `NowPlayingItem.origin` — the real stream provider, independent of the MPD transport. It lets the queue label by the actual source (e.g. "Radio") rather than the engine ("Local Library"), and a recognised radio stream's `cover_token` is the station logo. Qobuz/Tidal/HIGHRESAUDIO play over the shared MPD engine, so `GET /library/queue?source_id=src_qobuz` (and `src_tidal` / `src_highresaudio`) returns that shared queue with each item's real `origin` — previously it returned an empty queue. When no MPD engine exists yet the endpoint returns an empty queue (200), not an error. An optional **`?limit=<n>`** returns only the current track plus up to `n` following items (a lightweight next-track peek; item `position` stays the absolute MPD queue position) — omit it for the full queue.

> **Queue removal** is **by stable song id, not position**: each queue item carries a **`queue_id`** (the MPD `Id`, unchanged when the queue reindexes; `None` for Roon), and **`DELETE /library/queue/{queue_id}?source_id=…`** removes via MPD `deleteid`. This is reindex-safe — removing one track never hits the wrong one even if the queue shifted since it was listed. (The path segment was previously the 0-based `position`.)

### UPnP Renderer — `/upnp-renderer/*`

Routes are UDN-scoped: `{udn}` is the renderer's Unique Device Name (e.g. `uuid:…`).

| Method | Path | Description |
|---|---|---|
| GET | `/upnp-renderer/discover` | Scan LAN for MediaRenderer devices. Each entry carries **`is_local`** — `true` for a renderer co-located with AG (its own on-host upmpdcli), which the UI shows as an info row but must not offer as an output |
| GET | `/upnp-renderer/known` | All known renderers with live `active`, `reachable` fields |
| DELETE | `/upnp-renderer/{udn}` | Permanently remove renderer from known list (disconnects if active) |
| GET | `/upnp-renderer/{udn}/connection` | Connection state + capabilities for a specific renderer |
| PUT | `/upnp-renderer/{udn}/connection` | Connect to renderer `{udn}` (persisted as active output). Returns **400** for a co-located (`is_local`) renderer — it receives external casts and duplicates the Local DAC, so it cannot be selected as an output |
| DELETE | `/upnp-renderer/{udn}/connection` | Disconnect renderer `{udn}` — switches back to Local DAC |
| GET | `/upnp-renderer/{udn}/status` | Live playback state — `transport_state`, `title`, `artist`, `album`, `position`, `duration`, `volume`, `renderer_name`, **`reachable`**, **`queue_position`**, **`queue_total`**, **`queue_next_title`**, **`queue_next_artist`**, **`queue_next_album`**, **`queue_next_cover_token`** |
| POST | `/upnp-renderer/{udn}/play` | Load URI and start playback |
| POST | `/upnp-renderer/{udn}/stop` | Stop |
| POST | `/upnp-renderer/{udn}/pause` | Pause |
| POST | `/upnp-renderer/{udn}/seek` | Seek to position |
| PUT | `/upnp-renderer/{udn}/volume` | Set volume 0–100 |
| POST | `/upnp-renderer/{udn}/next` | Skip to next track in the renderer queue — 409 if no queue, at last track, or transition in progress |
| POST | `/upnp-renderer/{udn}/prev` | Go back to previous track in the renderer queue — 409 if no queue, at first track, or transition in progress |
| NOTIFY / POST | `/upnp-renderer/{udn}/notify` | UPnP GENA SUBSCRIBE/NOTIFY callback (public, no auth; sender IP must match the renderer's own IP) |

### Player — `/player/*`
| Method | Path | Description |
|---|---|---|
| GET | `/player/state` | SSE stream — live `PlayerState` events. Besides track/transport fields, the state carries: **`control_id`** (routing handle of the active item), **`played_on`** (output id: `"local"` or renderer UDN), **`outputs[]`** (`{id, type: "local"\|"upnp_renderer", name, active, transport_state: "PLAYING"\|"PAUSED"\|"STOPPED"\|null, error}` — the single source of truth for the renderer's transport state; **`error`** carries the engine's reason when an output produces no sound, e.g. MPD's `Failed to open ALSA device "hw:0,0": Device or resource busy` when another local service still holds the exclusive DAC — `null` normally, self-clearing once playback succeeds), **`active_output_id`**, and **`queue_next`** (`{title, artist, album, cover_token}` — upcoming track of a renderer cast; replaces reading `queue_next_*` from `renderer_status`). `sources[]` entries carry `control_id`/`played_on` too. |
| GET | `/player/state/snapshot` | Current `PlayerState` (one-shot) |
| POST | `/player/control` | Transport command (`toggle`, `next`, `prev`, `seek`, `set_volume`, `set_repeat`, `set_shuffle`) — body `{ action, value?, source_id?, control_id? }`; `control_id` (routing handle, spec §3) wins over `source_id` |
| POST | `/player/source` | Select active source |
| GET | `/player/sleep-timer` | Current sleep timer state |
| POST | `/player/sleep-timer` | Arm sleep timer (pause after N minutes) |
| DELETE | `/player/sleep-timer` | Cancel active sleep timer |
| GET | `/player/origins` | Canonical `origin → label` map (e.g. `"qobuz" → "Qobuz"`). Clients merge this into their static fallback at startup. |
| GET | `/player/outputs` | **Selector catalogue** — all selectable audio outputs: one entry per MPD audio_output block (`type: "mpd_output"`, `output_id: int`) + known UPnP renderers (`type: "upnp_renderer"`). Each entry: `{id, type, name, reachable, active[, output_id]}`. Falls back to a single "Local DAC" entry when MPD is unreachable. Distinct from `PlayerState.outputs[]` (the **runtime** list: local chain + selected renderer with live `transport_state`, built from caches). |
| PUT | `/player/mpd-output/{output_id}` | Enable one MPD audio output exclusively (all others disabled) and disconnect any active UPnP renderer. `output_id` is the MPD `outputid` integer. Returns 404 when `output_id` is not found in MPD. Returns 503 when MPD is unreachable. |

### HQPlayer — `/hqplayer/*`
| Method | Path | Description |
|---|---|---|
| GET | `/hqplayer/connection` | Connection state — `available` (HQPlayer reachable), `naa_available` (networkaudiod active) + **`use_as_output`** (library playback routed through HQPlayer) |
| PUT | `/hqplayer/connection` | Connect to HQPlayer instance — response includes `naa_available` |
| DELETE | `/hqplayer/connection` | Disconnect and delete the persisted config. **Stops HQPlayer first** so its NAA releases the exclusive local sound card — once the host is cleared AG can no longer command a stop, and the device would stay busy with no way left to free it. (This used to be a `POST /hqplayer/stop` the UI sent beforehand, so any other client left the DAC stuck.) |
| PUT | `/hqplayer/use-as-output` | Route library playback through HQPlayer — body `{ enabled }` → **`{ use_as_output }`** (deliberately narrow: returning the connection would make the toggle wait on HQPlayer's ~2.5 s Status round-trip, and let a client overwrite its cached connection with a payload missing `naa_available`). **Server-side and persisted**, so every client agrees — it used to be per-browser `localStorage`, letting a phone and a laptop route the same play differently. Disabling also stops HQPlayer so its NAA releases the exclusive local sound card. **503** when enabling while no HQPlayer is configured, or while its NAA is down — routing playback there would produce silence with nothing to explain it. Disabling is always allowed. The backend is the sole enforcer: clients must never write this setting on their own to "correct" an observed NAA outage (a passive view doing so used to turn the shared output off for every client during a transient `networkaudiod` restart). A play attempted while the NAA is down is refused with **503** naming the daemon, instead of silently changing the user's choice. |
| GET | `/hqplayer/discover` | Scan local subnet |
| GET/PUT | `/hqplayer/filter` | Active filter |
| GET/PUT | `/hqplayer/shaper` | Active shaper |
| GET/PUT | `/hqplayer/mode` | Active output mode |
| GET/PUT | `/hqplayer/volume` | Volume (dB) |
| GET | `/hqplayer/status` | Current DSP status |
| POST | `/hqplayer/play` | Play URI directly |
| POST | `/hqplayer/play-library` | Play library item |
| POST | `/hqplayer/stop` | Stop playback |
| DELETE | `/hqplayer/dsp` | Reset DSP to HQPlayer defaults |

### Tidal — `/tidal/*`
| Method | Path | Description |
|---|---|---|
| GET | `/tidal/connection` | Connection state |
| POST | `/tidal/connection` | Start PKCE login flow |
| POST | `/tidal/connection/submit` | Complete login (paste redirect URL) |
| DELETE | `/tidal/connection` | Disconnect |
| GET | `/tidal/stream/{track_id}` | DASH→FLAC proxy stream — **public (no auth)**, used by UPnP renderers on the LAN |

### Qobuz — `/qobuz/*`
| Method | Path | Description |
|---|---|---|
| GET | `/qobuz/connection` | Connection state |
| POST | `/qobuz/connection` | Start OAuth2 flow — **502** when the Qobuz app-bundle credentials cannot be fetched (`play.qobuz.com` unreachable / format changed) |
| GET | `/qobuz/oauth/callback` | OAuth2 callback (browser redirect target) — renders a styled result page; a backend failure returns the styled **error** page with status **502**, not a raw 500 |
| DELETE | `/qobuz/connection` | Disconnect |
| GET | `/qobuz/stream/{track_id}` | FLAC pass-through proxy — **public (no auth)**, used by UPnP renderers on the LAN. `?mode=redirect` → **302** to a fresh CDN URL (local MPD path: MPD follows it, so the enqueued proxy URL never expires and AG relays no bytes) |

### HIGHRESAUDIO (HRA) — `/highresaudio/*`
| Method | Path | Description |
|---|---|---|
| GET | `/highresaudio/connection` | Connection state (`connected`, `username`, `subscription`) |
| POST | `/highresaudio/connection` | Log in — body `{username, password}` (401 on bad credentials / no subscription) |
| DELETE | `/highresaudio/connection` | Disconnect (logout + clear credentials) |
| GET | `/highresaudio/stream/{track_id}` | FLAC pass-through proxy — **public (no auth)**, used by UPnP renderers on the LAN. `?mode=redirect` → **302** to a fresh CDN URL (local MPD path: MPD follows it, so the enqueued proxy URL never expires and AG relays no bytes) |

### Services — `/services/*`
| Method | Path | Description |
|---|---|---|
| GET | `/services` | List all managed systemd services |
| GET | `/services/{name}` | Service details + metrics |
| POST | `/services/{name}/action` | start / stop / restart / enable / disable — **only Audiogravity-managed units** (audio engines + core AG services); a non-managed unit is rejected |
| GET | `/services/{name}/properties` | systemd unit properties |
| PUT | `/services/{name}/properties` | Update RT/CPU/IO properties — managed units only; each value is strictly validated (no directive injection) and the override is **always** re-validated server-side (`skip_validation` is ignored) |

### Profiles — `/profiles/*`
| Method | Path | Description |
|---|---|---|
| GET | `/profiles` | List profiles |
| POST | `/profiles/{id}/activate` | Activate profile |

### Performance — `/performance/*`
| Method | Path | Description |
|---|---|---|
| POST | `/performance/latency/start` | Start cyclictest |
| GET | `/performance/latency/status` | Test status + results |
| POST | `/performance/network/start` | Start iperf3 / ping test |
| GET | `/performance/network/status` | Test status + results |
| GET | `/performance/cpu/governors` | Per-core governor info |
| PUT | `/performance/cpu/governors` | Set governor |

### Push notifications — `/push/*`
| Method | Path | Description |
|---|---|---|
| GET | `/push/vapid-public-key` | VAPID public key for subscription |
| POST | `/push/subscribe` | Register push subscription |
| DELETE | `/push/unsubscribe` | Remove subscription (query param: `endpoint`) |

### System info — `/sysinfo/*`
| Method | Path | Description |
|---|---|---|
| GET | `/sysinfo` | CPU, memory, disk, network snapshot |
| GET | `/sysinfo/audio-devices` | ALSA cards + USB interfaces |
| GET | `/sysinfo/logs` | Journalctl logs for a unit |
| WS | `/sysinfo/terminal/ws` | Interactive PTY shell (WebSocket) |
| POST | `/sysinfo/actions/update` | Self-update the core to a newer release; admin **password** required |
| GET | `/sysinfo/update-status` | Current self-update progress (phase) |

`POST /sysinfo/actions/update` body: `{ password, version?, token? }` → `{ status: "updating", from, to }`. Admin + **password** gated. Launches a **detached** updater (transient systemd unit) that reinstalls the core binary (to `version`, or latest when omitted), health-checks it, and **rolls back** on failure. `token` is an optional GitHub PAT for the private releases repo (Early Access); when omitted it falls back to the core's configured `RELEASE_DOWNLOAD_TOKEN`. Health-check requires the new binary to report the **target version** (not just answer `200`). Returns **409** if an update is already in progress (a crashed/stale in-progress state older than 15 min is ignored, so a dead updater can't wedge this). Follow progress via `GET /sysinfo/update-status`.

`GET /sysinfo/update-status` → `{ phase, from?, to?, error?, updated_at? }` where `phase` ∈ `idle | starting | downloading | installing | verifying | done | rolled_back | failed`. Read from disk, so it survives the core restart mid-update.

### Audio Stack — `/audio-stack/*`
Per-service minimal-config provisioning for the audio stack (mpd, upmpdcli, shairport).
Consumed by the first-time-setup modal + the editor's **Guided** mode in AUDIO
SERVICES CONFIGURATION. **Admin-only** — all endpoints require an administrator
(`require_admin`) on top of a full license.

| Method | Path | Description |
|---|---|---|
| GET | `/audio-stack/status` | Detected outputs, library sources, per-service pinned output + config state |
| GET | `/audio-stack/library-scan-status` | Whether MPD is currently indexing its database (post-library-change indicator) |
| POST | `/audio-stack/provision` | (Re)generate minimal configs — always overwrite-with-backup; admin **password** required |
| POST | `/audio-stack/output` | Targeted: change one service's audio output in place |
| POST | `/audio-stack/library` | Targeted: change mpd's music library in place |
| GET | `/audio-stack/mounts` | List UI-created network (CIFS) music mounts, with live mount state |
| POST | `/audio-stack/mounts` | Create + connectivity-test a CIFS mount; admin **password** required |
| DELETE | `/audio-stack/mounts/{slug}` | Remove a UI-created mount (units, credentials, mountpoint) |

`GET /audio-stack/status` → `{ outputs: [{ hw, card_name, usb_id, device_id, label, category, is_usb_dac, recommended }], library_sources: [{ kind: "usb"|"mount", label, path, uuid, fstype }], selected_output: { usb_id, card_name, device_id } | null, services: [{ service_id, config_path, configured, output: { usb_id, card_name, device_id } | null }] }`. `configured` is **true only when the file carries the AG marker** (not mere existence — distro packages ship defaults). `services[].output` is the per-service pinned output (null for upmpdcli / unset). `selected_output` is a back-compat single pin derived from the per-service map.

`GET /audio-stack/library-scan-status` → `{ scanning: bool, job_id? }`. `scanning` is true while MPD's database `update` runs (its `updating_db` status field is set); `job_id` is that update's id when scanning. Best-effort — an unreachable MPD reports `{ scanning: false }` rather than erroring. The UI polls this (~1.5 s) after a library change (`/provision`, `/library`) to show a transient "indexing library" indicator and hide it once the scan settles; the indicator also probes it **once on mount**, so leaving and returning to the config tab mid-index re-attaches to the running scan instead of losing it. Admin-only.

`POST /audio-stack/provision` body: `{ card_name, usb_id?, device_id?, (music_directory | library_usb_uuid + library_fstype), regenerate?, services?, admin_password }` → `{ device, selected_output, music_directory, results: [{ service_id, status: "generated"|"regenerated"|"error", config_path?, backup_path?, restarted?, error? }] }`. **Always overwrites** the config, auto-backing up any existing file first (distro packages ship defaults, so an only-if-absent write never applied). **Both** the initial provision and per-service `regenerate` require the admin `admin_password` (verified — wrong/missing → **401**). Pins the chosen output for each targeted service that drives an ALSA device (mpd, airplay), and **triggers an MPD database rescan** when mpd's library is (re)generated so the Library view is populated. Returns **400** if `mpd` is targeted without a library (a `regenerate` reuses mpd's existing one).

`POST /audio-stack/output` body: `{ service_id, card_name, usb_id?, device_id? }` → `{ service_id, device, output }`. Rewrites **only** the ALSA device directive of that service (via steering's device switcher) and pins the new per-service output — the rest of the config is preserved. Admin-only, **no password**. **400** if the service has no ALSA output or the output cannot be resolved.

`POST /audio-stack/library` body: `{ music_directory | library_usb_uuid + library_fstype }` → `{ service_id: "mpd", music_directory }`. Rewrites **only** mpd's `music_directory` (mounting a USB drive by UUID if given) — outputs and bit-perfect flags preserved — restarts mpd, and **triggers an MPD database rescan** so the new library is indexed (the minimal config has `auto_update` off; the rescan runs in the background). Admin-only, **no password**. **400** if no library is given.

`GET /audio-stack/mounts` → `[{ slug, label, host, share, mountpoint, read_only, mounted, in_use }]`. Only the mounts **created from the UI** (recognised by their systemd-unit tag) — hand-made OS mounts are not listed (they already appear in `library_sources`). `mounted` is true only when the CIFS share is actually mounted (an armed idle automount — an `autofs` trap — reports **false**). `in_use` flags the share mpd's current `music_directory` lives on.

`POST /audio-stack/mounts` body: `{ label, host, share, username?, password?, read_only?, admin_password }` → the created mount (shape above, `mounted: true`). Installs a systemd `.mount`/`.automount` pair at `/mnt/<slug>` (slug derived from the label) and **actually mounts the share before answering** — the connectivity test, done as a non-blocking start + state poll (30 s budget) so a slow host can never leave an orphan mount behind a rollback. On failure everything is rolled back and the mount error is returned as **502**; validation errors are **400**; wrong `admin_password` is **401**. `username`/`password` are the **CIFS credentials** (both-or-neither; guest otherwise), stored only in a 0600 file — `admin_password` is always the AG admin's re-authentication, as on `/provision`. CIFS/SMB only (NFS is terminal-only by design). Creates are serialised server-side.

`DELETE /audio-stack/mounts/{slug}?force=` → **204**. Unmounts (verified) and removes the unit files, credentials and mountpoint. **404** for a slug AG does not manage — hand-made mounts are never touched. **409** when the share is mpd's current library or the unmount is busy (files open); retry with `?force=true` to lazy-unmount anyway — the UI drives this with an explicit confirm.

### Config Validation — `/config_validation/*`
Structural + semantic validation of the editable audio config files. Full-license gated.

| Method | Path | Description |
|---|---|---|
| POST | `/config_validation/validate` | Validate `audio-config.json` data (structure + systemd/file checks) |
| POST | `/config_validation/validate-topology` | Validate `audio-topology.json` data (structure errors + link/connector warnings) |

Both return `{ valid: bool, errors: [{ location, message, type }], warnings: [string], summary? }`.
For `validate-topology`, structural problems (unknown device type, malformed shape) are blocking
`errors`; broken references (`target_device_id`/`target_input_id`) and unmappable streamer
connectors are non-blocking `warnings` (the topology only feeds the signal-path view). The UI
runs it before saving from the topology editor — errors block the save, warnings ask for
confirmation.

### Other
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Backend health check |
| GET | `/sse` | SSE event stream (all real-time updates) |
| GET/POST/PUT/DELETE | `/audio_app_config/*` | Config file editor |
| GET/POST/PUT/DELETE | `/radio/*` | Internet radio stations. **`POST /radio/play` follows the output selection** like every other play path (`core.playback_output`): HQPlayer when it is the selected output (badged `origin: "radio"`), else the active network renderer, else the local MPD. It previously always played to MPD, so a station started while HQPlayer held the DAC failed with `Device or resource busy`. **409** when two outputs are selected at once. |
| GET/POST/PUT/DELETE | `/packages/*` | Audio software manager |
| GET/POST/PUT/DELETE | `/license/*` | License management |
| GET/POST/PUT/DELETE | `/steering/*` | Output steering |

### `GET /license/online-status` — remote license verification cache

Returns the cached result of the last `POST /ls/portal/verify` call against the
remote license server (refreshed every 24 h, or immediately after activation).

```json
{
  "checked": true,
  "valid": true,
  "status": "valid",
  "order_id": "AG-XXXX-XXXX-XXXX-XXXX",
  "type": "lifetime",
  "expires_at": null,
  "issued": "2026-01-01T00:00:00Z",
  "checked_at": "2026-06-23T08:00:00Z",
  "announcements": [
    {
      "id": "uuid",
      "type": "version | promo | alert | info",
      "title": "Short display title",
      "body": "Optional longer description (nullable)",
      "url": "Optional call-to-action URL (nullable)"
    }
  ],
  "update": {
    "available": false,
    "latest": null,
    "mandatory": false,
    "notes_url": null
  }
}
```

`announcements` — broadcast messages from the license server, delivered via the
24 h check-in. Displayed in the AG Admin tab as dismissable banners
(`ag-announcement-banner`). Empty array when no active announcements exist or
when the license server is unconfigured.

`update` — availability of a newer AG release, computed by the license server
(newer than this backend's version and within the licence `version_scope`). When
an update applies: `{ "available": true, "latest": "0.9.11", "mandatory": false,
"notes_url": "…" }`. Defaults to `{ "available": false }` when up to date or the
license server is unconfigured/unreachable. The backend only surfaces this — it
performs no version comparison and downloads nothing (self-update lands later).

---

## SSE events

The SSE stream at `/sse` emits JSON events. Key event types:

| Event type | Payload |
|---|---|
| `now_playing` | Current track, source, format |
| `audio_pipeline` | Full pipeline topology update |
| `services_metrics` | CPU/memory/IO per service |
| `profile_metrics` | Profile activation result |
| `sysinfo` | CPU, memory, disk, network |
| `renderer_status` | UPnP renderer state — `connected`, `transport_state`, `title`, `artist`, `position`, `volume`, `renderer_name`, `renderer_udn`, `bypassed`, `reachable`, `queue_position`, `queue_total`, `queue_next_title`, `queue_next_artist`, `queue_next_album`, `queue_next_cover_token`. **Settings-card scope only** (connection/reachability): the player UI reads the renderer's transport state and queue from `PlayerState.outputs[]` / `queue_next` instead (single source of truth). |

---

*For the complete schema of each request/response, run a local backend and
open `/docs` (Swagger UI) or `/redoc`.*
