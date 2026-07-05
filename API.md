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
| POST | `/auth/webauthn/login/begin` | Start passkey login |
| POST | `/auth/webauthn/login/complete` | Complete passkey login |
| GET | `/auth/webauthn/credentials` | List registered passkeys |
| DELETE | `/auth/webauthn/credentials/{id}` | Remove passkey |

### Audio Pipeline — `/audio_pipeline/*`
| Method | Path | Description |
|---|---|---|
| GET | `/audio_pipeline/current` | Current pipeline state + now playing |
| GET | `/audio_pipeline/topology/view` | Pipeline topology graph |
| POST | `/audio_pipeline/topology/save` | Save node positions |
| POST | `/audio_pipeline/control` | Transport controls (play/pause/next…) |
| GET | `/audio_pipeline/library-cover/{path}?sig=` | **Renderer-facing** (public, HMAC-signed): local-library album art for a cast file's `albumArtURI`. Not called by the UI. |

### Library — `/library/*`
| Method | Path | Description |
|---|---|---|
| POST | `/library/queue` | Add/play item — routes to the active UPnP renderer when connected and action='play' (streaming **and** local library: a remote renderer pulls local files via the signed stream URL below; the local DAC / on-host renderer stay MPD-direct) |
| GET | `/library/stream/{path}?sig=` | **Renderer-facing** (public, HMAC-signed, HTTP Range/206): serves a local-library file for a remote renderer to pull. Not called by the UI. |
| POST | `/library/upnp-play` | Play UPnP item — routes to renderer or MPD |
| GET | `/library/upnp-browse?location=<device_url>&object_id=…` | Browse ContentDirectory — **`location` param (was `control_url`)** |
| GET | `/library/search?location=<device_url>` | Search UPnP ContentDirectory — **`location` param (was `control_url`)** |
| GET | `/library/upnp-known-servers` | List discovered UPnP servers — returns `location` field |
| GET | `/library/upnp-servers` | Scan for new UPnP servers |
| GET | `/library/roon-zones` | List Roon zones |
| GET | `/library/highresaudio-discover` | HRA curated album grid ("High-Res Essentials") |
| GET | `/library/highresaudio-category?category=<title>` | HRA shop category album grid (e.g. `Editors Choice`, `Bestsellers`) |

> Streaming sources are addressed via `source_id`: `/library/albums?source_id=src_highresaudio` (favourites / My Album), `/library/search?source_id=src_highresaudio&q=…`, and `POST /library/queue` with `source_id=src_highresaudio` (`item_type` `album` or `track`). Same pattern as `src_qobuz` / `src_tidal`.

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
| GET | `/upnp-renderer/{udn}/status` | Live playback state — `transport_state`, `title`, `artist`, `album`, `position`, `duration`, `volume`, `renderer_name`, **`reachable`**, **`uses_local_mpd`**, **`queue_position`**, **`queue_total`**, **`queue_next_title`**, **`queue_next_artist`**, **`queue_next_album`**, **`queue_next_cover_token`** |
| POST | `/upnp-renderer/{udn}/play` | Load URI and start playback |
| POST | `/upnp-renderer/{udn}/stop` | Stop |
| POST | `/upnp-renderer/{udn}/pause` | Pause |
| POST | `/upnp-renderer/{udn}/seek` | Seek to position |
| PUT | `/upnp-renderer/{udn}/volume` | Set volume 0–100 |
| POST | `/upnp-renderer/{udn}/next` | Skip to next track in the renderer queue — 409 if no queue, at last track, or transition in progress |
| POST | `/upnp-renderer/{udn}/prev` | Go back to previous track in the renderer queue — 409 if no queue, at first track, or transition in progress |
| POST | `/upnp-renderer/{udn}/notify` | UPnP SUBSCRIBE/NOTIFY callback (public, no auth) |

### Player — `/player/*`
| Method | Path | Description |
|---|---|---|
| GET | `/player/state` | SSE stream — live `PlayerState` events |
| GET | `/player/state/snapshot` | Current `PlayerState` (one-shot) |
| POST | `/player/control` | Transport command (`toggle`, `next`, `prev`, `seek`, `set_volume`, `set_repeat`, `set_shuffle`) |
| POST | `/player/source` | Select active source |
| GET | `/player/sleep-timer` | Current sleep timer state |
| POST | `/player/sleep-timer` | Arm sleep timer (pause after N minutes) |
| DELETE | `/player/sleep-timer` | Cancel active sleep timer |
| GET | `/player/origins` | Canonical `origin → label` map (e.g. `"qobuz" → "Qobuz"`). Clients merge this into their static fallback at startup. |
| GET | `/player/outputs` | All selectable audio outputs: one entry per MPD audio_output block (`type: "mpd_output"`, `output_id: int`) + known UPnP renderers (`type: "upnp_renderer"`). Each entry: `{id, type, name, reachable, active[, output_id]}`. Falls back to a single "Local DAC" entry when MPD is unreachable. |
| PUT | `/player/mpd-output/{output_id}` | Enable one MPD audio output exclusively (all others disabled) and disconnect any active UPnP renderer. `output_id` is the MPD `outputid` integer. Returns 404 when `output_id` is not found in MPD. Returns 503 when MPD is unreachable. |

### HQPlayer — `/hqplayer/*`
| Method | Path | Description |
|---|---|---|
| GET | `/hqplayer/connection` | Connection state — `available` (HQPlayer reachable) + `naa_available` (networkaudiod active) |
| PUT | `/hqplayer/connection` | Connect to HQPlayer instance — response includes `naa_available` |
| DELETE | `/hqplayer/connection` | Disconnect |
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
| POST | `/qobuz/connection` | Start OAuth2 flow |
| GET | `/qobuz/callback` | OAuth2 callback |
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
| POST | `/services/{name}/action` | start / stop / restart / enable / disable |
| GET | `/services/{name}/properties` | systemd unit properties |
| PUT | `/services/{name}/properties` | Update RT/CPU/IO properties |

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

### Audio Stack — `/audio-stack/*`
Per-service minimal-config provisioning for the audio stack (mpd, upmpdcli, shairport).
Consumed by the first-time-setup modal + the editor's **Guided** mode in AUDIO
SERVICES CONFIGURATION. **Admin-only** — all endpoints require an administrator
(`require_admin`) on top of a full license.

| Method | Path | Description |
|---|---|---|
| GET | `/audio-stack/status` | Detected outputs, library sources, per-service pinned output + config state |
| POST | `/audio-stack/provision` | (Re)generate minimal configs — always overwrite-with-backup; admin **password** required |
| POST | `/audio-stack/output` | Targeted: change one service's audio output in place |
| POST | `/audio-stack/library` | Targeted: change mpd's music library in place |

`GET /audio-stack/status` → `{ outputs: [{ hw, card_name, usb_id, device_id, label, category, is_usb_dac, recommended }], library_sources: [{ kind: "usb"|"mount", label, path, uuid, fstype }], selected_output: { usb_id, card_name, device_id } | null, services: [{ service_id, config_path, configured, output: { usb_id, card_name, device_id } | null }] }`. `configured` is **true only when the file carries the AG marker** (not mere existence — distro packages ship defaults). `services[].output` is the per-service pinned output (null for upmpdcli / unset). `selected_output` is a back-compat single pin derived from the per-service map.

`POST /audio-stack/provision` body: `{ card_name, usb_id?, device_id?, (music_directory | library_usb_uuid + library_fstype), regenerate?, services?, password }` → `{ device, selected_output, music_directory, results: [{ service_id, status: "generated"|"regenerated"|"error", config_path?, backup_path?, restarted?, error? }] }`. **Always overwrites** the config, auto-backing up any existing file first (distro packages ship defaults, so an only-if-absent write never applied). **Both** the initial provision and per-service `regenerate` require the admin `password` (verified — wrong/missing → **401**). Pins the chosen output for each targeted service that drives an ALSA device (mpd, airplay). Returns **400** if `mpd` is targeted without a library (a `regenerate` reuses mpd's existing one).

`POST /audio-stack/output` body: `{ service_id, card_name, usb_id?, device_id? }` → `{ service_id, device, output }`. Rewrites **only** the ALSA device directive of that service (via steering's device switcher) and pins the new per-service output — the rest of the config is preserved. Admin-only, **no password**. **400** if the service has no ALSA output or the output cannot be resolved.

`POST /audio-stack/library` body: `{ music_directory | library_usb_uuid + library_fstype }` → `{ service_id: "mpd", music_directory }`. Rewrites **only** mpd's `music_directory` (mounting a USB drive by UUID if given) — outputs and bit-perfect flags preserved. Admin-only, **no password**. **400** if no library is given.

### Other
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Backend health check |
| GET | `/sse` | SSE event stream (all real-time updates) |
| GET/POST/PUT/DELETE | `/audio_app_config/*` | Config file editor |
| GET/POST/PUT/DELETE | `/radio/*` | Internet radio stations |
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
| `renderer_status` | UPnP renderer state — `connected`, `transport_state`, `title`, `artist`, `position`, `volume`, `renderer_name`, `renderer_udn`, `bypassed`, `reachable`, `uses_local_mpd`, `queue_position`, `queue_total`, `queue_next_title`, `queue_next_artist`, `queue_next_album`, `queue_next_cover_token` |

---

*For the complete schema of each request/response, run a local backend and
open `/docs` (Swagger UI) or `/redoc`.*
