# Audiogravity UI — Backend API Contract

The frontend communicates with the backend exclusively via:
- **REST** (JSON over HTTPS) — all endpoints under the base URL
- **SSE** — real-time event stream at `/sse`
- **WebSocket** — PTY terminal at `/sysinfo/terminal/ws`

Full interactive documentation is available at **`/docs`** (Swagger UI) on a
running Audiogravity backend.

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
| POST | `/library/queue` | Add item to MPD queue |
| POST | `/library/upnp-play` | Play UPnP item |
| GET | `/library/upnp-known-servers` | List discovered UPnP servers |
| GET | `/library/roon-zones` | List Roon zones |

### HQPlayer — `/hqplayer/*`
| Method | Path | Description |
|---|---|---|
| GET | `/hqplayer/connection` | Connection state |
| PUT | `/hqplayer/connection` | Connect to HQPlayer instance |
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
