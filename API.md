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

### Library — `/library/*`
| Method | Path | Description |
|---|---|---|
| POST | `/library/queue` | Add/play item — routes to UPnP renderer when connected and action='play' |
| POST | `/library/upnp-play` | Play UPnP item — routes to renderer or MPD |
| GET | `/library/upnp-browse?location=<device_url>&object_id=…` | Browse ContentDirectory — **`location` param (was `control_url`)** |
| GET | `/library/search?location=<device_url>` | Search UPnP ContentDirectory — **`location` param (was `control_url`)** |
| GET | `/library/upnp-known-servers` | List discovered UPnP servers — returns `location` field |
| GET | `/library/upnp-servers` | Scan for new UPnP servers |
| GET | `/library/roon-zones` | List Roon zones |

### UPnP Renderer — `/upnp-renderer/*`
| Method | Path | Description |
|---|---|---|
| GET | `/upnp-renderer/discover` | Scan LAN for MediaRenderer devices |
| GET | `/upnp-renderer/connection` | Current renderer connection + capabilities |
| PUT | `/upnp-renderer/connection` | Connect to a renderer (persisted) |
| DELETE | `/upnp-renderer/connection` | Disconnect |
| GET | `/upnp-renderer/status` | Live playback state (transport_state, title, position, volume, renderer_name) |
| POST | `/upnp-renderer/play` | Load URI and start playback |
| POST | `/upnp-renderer/stop` | Stop |
| POST | `/upnp-renderer/pause` | Pause |
| POST | `/upnp-renderer/seek` | Seek to position |
| PUT | `/upnp-renderer/volume` | Set volume 0–100 |
| POST | `/upnp-renderer/notify` | UPnP SUBSCRIBE/NOTIFY callback (public, no auth) |

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

### Qobuz — `/qobuz/*`
| Method | Path | Description |
|---|---|---|
| GET | `/qobuz/connection` | Connection state |
| POST | `/qobuz/connection` | Start OAuth2 flow |
| GET | `/qobuz/callback` | OAuth2 callback |
| DELETE | `/qobuz/connection` | Disconnect |

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
  ]
}
```

`announcements` — broadcast messages from the license server, delivered via the
24 h check-in. Displayed in the AG Admin tab as dismissable banners
(`ag-announcement-banner`). Empty array when no active announcements exist or
when the license server is unconfigured.

---

## SSE events

The SSE stream at `/sse` emits JSON events. Key event types:

| Event type | Payload |
|---|---|
| `now_playing` | Current track, source, format |
| `pipeline_state` | Full pipeline topology update |
| `service_state` | Service status change |
| `service_metrics` | CPU/memory/IO per service |
| `profile_state` | Profile activation result |
| `connection_status` | Backend connectivity |
| `system_metrics` | CPU, memory, disk, network |

---

*For the complete schema of each request/response, run a local backend and
open `/docs` (Swagger UI) or `/redoc`.*
