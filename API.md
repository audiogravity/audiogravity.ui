# Audiogravi<sup>ty</sup> UI — Core API Contract

The UI communicates with the core exclusively via:
- **REST** (JSON over HTTPS) — all endpoints under the base URL
- **SSE** — real-time event stream at `/sse/dashboard`
- **WebSocket** — PTY terminal at `/sysinfo/terminal/ws`

Full interactive documentation is available at **`/docs`** (Swagger UI) on a
running Audiogravi<sup>ty</sup> core.

---

## Base URL

Configured at runtime via `window.AG_CONFIG.apiUrl` (injected by `install.sh`).
Default in dev: `/api` (Vite proxy → `http://localhost:8000`).

## Authentication

Every request must carry:

| Header | Value |
|---|---|
| `X-API-Key` | Static API key (set in the core's `.env`) |
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
| PATCH | `/auth/users/{username}` | Update a user (password, role, enabled) |
| DELETE | `/auth/users/{username}` | Delete a user |
| GET | `/auth/users/active` | Current user info |
| POST | `/auth/webauthn/register/begin` | Start passkey registration |
| POST | `/auth/webauthn/register/complete` | Complete passkey registration |
| POST | `/auth/webauthn/login/begin` | Start passkey login — always **200** with authentication options (empty `allowCredentials` when the user is unknown or has no passkeys); never 404, whatever the username |
| POST | `/auth/webauthn/login/complete` | Complete passkey login |
| GET | `/auth/webauthn/credentials` | List registered passkeys |
| DELETE | `/auth/webauthn/credentials/{id}` | Remove passkey |

### Audio Pipeline — `/audio_pipeline/*`
| Method | Path | Description |
|---|---|---|
| GET | `/audio_pipeline/current` | Current pipeline state + now playing. The streamer node's `metadata` may carry `unmatched_outputs` — `[{ label, output_type, hw }]`, the outputs currently carrying audio whose connector kind no declared topology port mentions; absent when idle or fully described. |

| GET | `/audio_pipeline/topology/view` | Read `audio-topology.json` (user-declared hi-fi chain) |
| POST | `/audio_pipeline/topology/save` | Write `audio-topology.json` (auto-backup + hot-reload) |
| GET | `/audio_pipeline/now-playing` | Every active playback source |
| GET | `/audio_pipeline/album-tracks` | Tracklist of the album being played |
| GET | `/audio_pipeline/cover` | Resolve cover art for a now-playing item |
| POST | `/audio_pipeline/control` | Transport command — body `{ source_id, control_id?, action, volume?/seek_position? }`. The returned `success` reflects **MPD's verdict for every action**: `false` means **no change was confirmed** — the device refused (a live radio stream, a Tidal first listen still downloading, a mixerless output) or the exchange timed out before a verdict. A client that flipped its UI optimistically should flip it back; the state published on the SSE bus right after **every** control is the reference to converge on |
| GET | `/audio_pipeline/library-cover/{path}?sig=` | **Renderer-facing** (public, HMAC-signed): local-library album art for a cast file's `albumArtURI`. Not called by the UI. |

### Library — `/library/*`
| Method | Path | Description |
|---|---|---|
| GET | `/library/albums` | List albums — `?source_id=`, optional `?artist_id=`, optional `?sort=title\|added`. **503** with a message meant to be shown as-is when the local source cannot answer for a reason that is not an empty collection: MPD stopped, or **no music library configured on the box**. Both used to come back as zero albums, which says the collection is gone |
| GET | `/library/queue` | Current playback queue — `?source_id=`, optional `?limit=` |
| POST | `/library/queue` | Add or play a library item — body `{ source_id, item_id, item_type, action, duration? }` (`duration` in seconds, 0–86400: for UPnP tracks, whose length MPD cannot know before decoding the stream — it feeds the queue display) |
| DELETE | `/library/queue/{queue_id}` | Remove one track — `?source_id=` |
| GET | `/library/favorite-ids?source_id=&item_type=album` | Favorited item ids on a streaming source (Qobuz/Tidal/HRA) → `{ ids: [...] }`. Used to render the accurate ★ state on browse/search grids |
| POST | `/library/favorite` | Add an item to a streaming source's favorites — body `FavoriteRequest { source_id, item_id, item_type: "album" }` |
| DELETE | `/library/favorite?source_id=&item_id=&item_type=album` | Remove an item from a streaming source's favorites |
| GET | `/library/stream/{path}?sig=` | **Renderer-facing** (public, HMAC-signed, HTTP Range/206): serves a local-library file for a remote renderer to pull. Not called by the UI. |
| POST | `/library/upnp-play` | Play or enqueue a UPnP item — body `{ source_id, res, title?, art_uri?, server_name?, duration?, action }` |
| GET | `/library/upnp-browse?location=<device_url>&object_id=…` | Browse ContentDirectory — takes a `location` device URL. Items now carry **`duration`** (seconds, from DIDL `res@duration`, `null` when the server publishes none); it was parsed and then silently dropped, so clients received nothing to size a progress bar with |
| GET | `/library/search?location=<device_url>` | Search UPnP ContentDirectory — takes a `location` device URL. On a local (MPD) source, same **503** as `/library/albums` for a stopped daemon or a box with no library — rather than "no results", which reads as "your music does not contain that" |
| GET | `/library/upnp-known-servers` | List discovered UPnP servers — returns `location` field |
| GET | `/library/upnp-servers` | Scan for new UPnP servers |
| GET | `/library/roon-status` | Where the Roon setup stands — `{ state, zones, extension_name }`. `state` is one of `no_endpoint` (no Roon Bridge or Roon Server running on the box), `core_not_found` (no Core answering), `waiting_authorization` (the extension has to be enabled in Roon → Settings → Extensions), `connected`, `checking` (an attempt is running — the call returns at once rather than holding for it, so poll), or `unknown` (nothing attempted, or a failure whose cause the box could not name). `extension_name` is the label to look for in Roon's list |
| GET | `/library/roon-zones` | List Roon zones |
| GET | `/library/roon-browse` | Browse the Roon hierarchy |
| POST | `/library/roon-action` | Execute a Roon browse action (play, queue…) |
| DELETE | `/library/upnp-known-servers/{server_id}` | Forget a persisted UPnP server |
| GET | `/library/qobuz-featured` | Qobuz featured albums |
| GET | `/library/qobuz-playlists` | Qobuz editorial playlists |
| GET | `/library/qobuz-playlist-tracks` | Tracks of a Qobuz playlist |
| GET | `/library/tidal-featured` | Tidal editorial discovery |
| GET | `/library/tidal-charts` | Tidal charts |
| GET | `/library/tidal-editorial` | Tidal editorial playlists |
| GET | `/library/tidal-playlists` | Tidal user playlists |
| GET | `/library/tidal-playlist-tracks` | Tracks of a Tidal playlist |
| GET | `/library/highresaudio-categories` | HRA shop categories — `[{title, label}]`, in the order HRA publishes them |
| GET | `/library/highresaudio-category?category=<title>` | HRA shop category album grid (e.g. `Editors Choice`, `Bestsellers`) |
| GET | `/library/highresaudio-discover` | HRA curated album grid — a shortcut for the "High-Res Essentials" category |
| GET | `/library/highresaudio-genres` | HRA genres with their sub-genres — `[{title, path, subgenres}]` |
| GET | `/library/highresaudio-genre?genre=<path>` | Album grid of a genre or sub-genre (`Jazz`, `Jazz/Bebop`) |
| GET | `/library/highresaudio-search-filters` | What an HRA search can be narrowed by: `{formats, moods}` |
| GET | `/library/highresaudio-search?q=…` | HRA search narrowed by `format`, `mood`, `composer`, `artist`, `label`, `genre`, `subgenre` — albums only |
| GET | `/library/highresaudio-playlists?type=editorial\|mine` | HRA playlists: the selections HRA publishes, or the account's own. Mapped to the album model, like the Qobuz/Tidal twins |
| GET | `/library/highresaudio-playlist-tracks?playlist_id=…&type=editorial\|mine` | Tracks of an HRA playlist |
| GET | `/library/highresaudio-vault` | The albums the account purchased (HRA's VirtualVault), paged with `offset`/`limit`. Ids carry a `vault:` prefix — see below. Playable without a subscription; an account that bought nothing answers `200 []` |

> **HRA categories — `title` is the key, `label` is what you show.** `title` is HRA's own
> string and the ONLY value `/library/highresaudio-category` accepts; four categories come
> back in German whatever the language asked for, so the core carries a `label` to display
> instead (*Hörtipps* → *Tips*). `label` equals `title` for every other category. Passing a
> label back where a title is expected is not an error: the category is simply unknown and
> the answer is `200 []`.

> **HRA playlists — the id names its own family.** The two trees have independent id
> sequences, so a listing returns `editorial:1845` / `mine:5549` rather than a bare number:
> the id you were given travels back untouched to `/library/highresaudio-playlist-tracks`
> and to `POST /library/queue`, and no caller ever has to guess which tree it came from.
> `type` still exists on both routes and stays authoritative when the prefix is absent.
> An account with no playlist of its own answers `200 []`, not an error.

> **HRA Vault — the id names its tree, and the tree is not the catalogue.** A purchased
> album is listed as `vault:<album>_<transaction>`; the prefix travels back untouched to
> `POST /library/queue` (`item_type` `album`, or `track` with a `vault:`-prefixed
> `playlistAdd`). HRA keeps purchases on separate routes that do not answer for catalogue
> ids and vice versa, so the prefix is what selects them — never the id's shape. A Vault id
> is not a favourite: do not pass one to the favorites routes.

> **HRA genres — `path` is the key, never the title.** Sub-genre titles repeat across genres,
> and sixteen of them carry the name of a top-level genre (`Soundtrack/Soundtrack`), so only
> the path identifies one. `/` separates the two levels and no title contains one.

> **HRA search — `q` is required (3 characters minimum); the filters narrow a search, they do
> not replace one.** A shorter `q` answers `200 []` without calling HRA. Two caveats measured
> on their side, which is why the interface offers neither: **`format` makes HRA ignore `q`
> altogether** (three different terms, one of them nonsense, return the same fifty albums),
> and **`mood` takes about a minute** on a cold query (then answers instantly, their cache
> being warm). This endpoint therefore waits **30s** instead of the usual 15, and answers
> **504** — "trying again usually returns at once" — rather than 500 when it runs out. Only
> album hits are returned; HRA can also answer with playlists, which AG cannot play yet.

**Where a play goes** — `/library/queue`, `/library/upnp-play` and `/radio/play` all
resolve their destination the same way, and answer with the same statuses:

| Status | Meaning |
|---|---|
| **501** | The selected output cannot play this content — a source the backend could not classify, or a format HQPlayer cannot decode (the detail names the track and the format). Streaming sources are **no longer** refused here: Qobuz, Tidal and HIGHRESAUDIO reach HQPlayer like every other source |
| **409** | A network renderer **and** HQPlayer are both selected — turn one off |
| **503** | The selected output cannot deliver sound right now (HQPlayer's NAA down, an undecodable format, an exchange failure) — **or MPD is not running at all**, see below |

`/radio/play`, `POST /radio/library` and `POST /radio/favorites` all resolve the station
first, and all three answer **503** when that resolution fails because the Radio Browser
catalogue is unreachable or is rate-limiting the box — the detail carries the reason.
`/radio/play` also answers **503 with MPD's reason** when MPD refuses the station itself
(malformed URL, MPD saturated) — it used to report the station as playing while nothing
had started. They
used to answer **404 "station not found"**, which blamed the station for an outage
elsewhere; a 404 now means the catalogue answered and does not know that UUID. A station
already saved on the box, or added by hand, resolves without the network and is unaffected.

> **When MPD is stopped.** Everything AG plays goes through MPD, and the box stops it
> itself for the Roon and HQPlayer profiles, so a stopped daemon is a state an owner
> reaches on purpose. Every route that talks to it now answers **503** with
> `MPD is not running. Start it from the Services tab.` — the interface shows that
> detail verbatim, where it used to show `Queue operation failed`. It applies to
> `GET /library/albums`, `GET /library/search`, `GET`/`DELETE`/`POST /library/queue`,
> `POST /library/upnp-play` and `POST /radio/play`.
>
> Two of those changed shape: `GET /library/albums` and `GET /library/queue` used to
> answer **200 with an empty payload**, which stated that the collection was gone. Only
> a REFUSED connection is reported this way, and only after being confirmed a second
> later — AG restarts MPD itself on an output change, and the port refuses during that
> window exactly like a stopped daemon. A timeout still degrades to an empty list: a
> daemon that is listening and not answering is a different failure.

Roon is never diverted: a Roon zone is its own output chain. `action: "add"` appends —
to MPD, or to HQPlayer's queue when it is the output — and never interrupts what plays;
a network renderer has no persistent queue, so an `add` stays with MPD. A UPnP stream is
badged `origin: "upnp"`, a station `origin: "radio"`.

**When the push went to HQPlayer**, the response carries `routed_to: "hqplayer"` alongside
the usual `{ ok, action, item_type, tracks }`. The field is absent on every other path, so
its presence is the signal — a client must not infer the destination from the selected
output, which can change between the request and the answer. The item then appears in
`PlayerState` under `source_id`/`control_id` `src_hqplayer`, badged by its **content**:
`origin` is `qobuz`, `tidal`, `highresaudio`, `upnp`, `radio` or `library`, never
`hqplayer` — HQPlayer is a processor in the signal path, not the identity of what plays.
`can_seek` is true as soon as a length is known, and title, artist and cover follow the
track through an album (they are read from the list AG pushed, indexed by HQPlayer's own
track number; a playlist changed from HQPlayer's remote drops back to `origin: "external"`
with no title).

Tidal answers **501** when the stream it would serve is AAC — either the account's quality
is a lossy tier, or that album is not available in lossless. The check reads the format
Tidal actually serves for the first track of the push, not the configured tier, and the
detail names both possible causes.

A **200 does not mean sound came out**: whether a push to HQPlayer actually started is
decided after the response and surfaces on `PlayerState.outputs[].error`.

> Streaming sources are addressed via `source_id`: `/library/albums?source_id=src_highresaudio` (favourites / My Album), `/library/search?source_id=src_highresaudio&q=…`, and `POST /library/queue` with `source_id=src_highresaudio` (`item_type` `album` or `track`). Same pattern as `src_qobuz` / `src_tidal`.

> **Album ordering — `?sort=` (MPD sources only).** `title` (default) is alphabetical;
> `added` puts the most recently added to the library first, using MPD 0.24's `Added`
> field, exposed on each album as `added` (ISO-8601 UTC, `null` where the source cannot
> report one). The ordering is applied by the core **over the whole library before
> paging**, which is the point: pagination is server-side, so a client can only ever sort
> the page it holds. Each album carries `{ id, title, artist, year, added, cover_token }`,
> and `added` is the field this ordering reads. It is compared **by day** — an import pass spreads its albums
> over minutes, and ordering on the exact second reproduces disk-traversal order; within a
> day the alphabetical order stands. Streaming sources ignore the parameter: their order
> belongs to the provider.

> **Artist drill-down:** `GET /library/albums?source_id=…&artist_id=…` lists a single artist's albums for **every** source. `artist_id` is source-specific — it is the value returned as an artist's `id` by `GET /library/search`: the artist **name** for MPD and HIGHRESAUDIO, the **item_key** for Roon, and the numeric **artist id** for Qobuz and Tidal. (Artists are navigational only — they are not queueable via `POST /library/queue`, which accepts `track` / `album` / `playlist`.)

**Item identity — display vs routing.** Every now-playing item carries three separate
fields:

| Field | Use it for | Never use it for |
|---|---|---|
| `origin` (+ `origin_name`) | the badge: `qobuz`, `library`, `radio`, `upnp` + server name, `external` | routing |
| `played_on` | naming the output: `"local"` or a renderer UDN | routing |
| `control_id` | routing a transport command | display |

A cast is badged with what it **is** — a Qobuz album cast to a speaker reads `origin:
"qobuz"`, `played_on: "<udn>"` — while `control_id` stays `"upnp_renderer"`, the handle
commands must be sent to. `external` means a third-party controller drives the device.

A selected-but-stopped renderer yields **no item**: it is carried by
`PlayerState.outputs[]`, and the state still carries `control_id` so it stays
controllable. `outputs[].active` marks the output actually carrying the audio, not
merely a reachable selection.

**Seeking** — MPD decides whether a stream can be seeked when it OPENS it, so a Tidal
track played for the first time is unseekable for that whole listen even though its
seekable copy finishes downloading seconds in. The backend now reopens the track from
that copy when you seek, which is invisible to the listener; while the download is still
running, and on any live stream, the seek is **refused**. A refusal is truthful, not a
failure to retry: `success:false` / **503** means no position change was confirmed, and
the state published on the SSE bus right after carries the real position — a client that
moved its progress bar optimistically should snap it back to that value.

**Reading the queue** — `GET /library/queue?source_id=…` returns each item with its
real **`origin`** (`radio`, `qobuz`, `tidal`, `upnp`, `library`…), independent of the MPD
transport; for a recognised station the item's `cover_token` is the station logo.
**`duration`** is now populated for queued streams too (Qobuz, Tidal, HIGHRESAUDIO, UPnP):
MPD only learns a stream's length by decoding it, so the value captured at enqueue time is
served — and persisted, so it survives a core restart. A live radio stream stays `null`,
which is the correct display (`--:--`). Now Playing falls back to the same value, so the
player total and the queue row never disagree.
Qobuz/Tidal/HIGHRESAUDIO share the MPD engine, so asking with their `source_id` returns
that shared queue. With no MPD engine the endpoint returns an empty queue (**200**), not
an error. **`?limit=<n>`** returns the current track plus up to `n` following items —
`position` stays the absolute queue position; omit it for the whole queue.

**Removing from the queue** — `DELETE /library/queue/{queue_id}?source_id=…`, keyed on
the item's **`queue_id`** (the MPD `Id`, stable across reindexing; `None` for Roon), not
on its position. A removal MPD refuses (the id is no longer in the queue) — or cannot
take because MPD is unreachable — answers **503 carrying the reason** — it used to answer
`ok:true` and the ghost row reappeared on the next refresh with no explanation.

**Queue writes tell the truth** — every MPD write behind `POST /library/queue`,
`/library/upnp-play` and `POST /radio/play` now reads MPD's verdict: a refused add or
play answers **503 with MPD's reason** instead of the old unconditional `ok:true` over a
queue that never changed. Two deliberate exceptions: a **partial** stream enqueue (the
list aborted midway) still answers `ok:true` with `tracks` set to the count actually
queued — the queue did change, and hiding that behind an error would lie the other way —
and the metadata tags written after a stream enqueue are cosmetic, so their refusal never
fails an enqueue that succeeded (queue rows may show URLs instead of titles; the reason is
logged).

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
| GET | `/player/state` | SSE stream — live `PlayerState` events (fields below) |
| GET | `/player/state/snapshot` | Current `PlayerState` (one-shot) |
| POST | `/player/control` | Transport command — body `{ action, value?, control_id?, source_id? }`. A refused command answers **503** rather than silently succeeding — refusals are truthful: no change was confirmed, and the SSE state published right after is the reference; see `/audio_pipeline/control` above |
| POST | `/player/source` | Select the active source |
| GET | `/player/sleep-timer` | Current sleep-timer state |
| POST | `/player/sleep-timer` | Arm the sleep timer (pause after N minutes) |
| DELETE | `/player/sleep-timer` | Cancel the sleep timer |
| GET | `/player/origins` | Canonical `origin → label` map, merged into the client's static fallback at startup |
| GET | `/player/outputs` | Selector catalogue — every selectable output |
| PUT | `/player/mpd-output/{output_id}` | Enable one MPD output exclusively and disconnect any active renderer. The switch is atomic and enable-**first**: if MPD refuses the target (device busy), the previous output keeps playing and the response is **503 carrying MPD's reason** — it used to answer `success:true` even when the switch had disabled every output |

**Transport actions**: `toggle`, `next`, `prev`, `seek`, `set_volume`, `set_repeat`,
`set_shuffle`. Route with `control_id` (`source_id` accepted as fallback). Anything
else → **400**. `seek` and `set_volume` require `value`.

**`PlayerState` — routing and output fields**

| Field | Meaning |
|---|---|
| `control_id` | Routing handle of the active item — send it back on `/player/control` |
| `played_on` | Where the audio comes out: `"local"` or a renderer UDN. Display only |
| `outputs[]` | Runtime outputs: the local chain + the selected renderer |
| `active_output_id` | Id of the entry in `outputs[]` carrying the audio |
| `queue_next` | `{title, artist, album, cover_token}` — upcoming track of a renderer cast |
| `sources[].selectable` | `false` on an entry that is a routing handle, not a source: listed so the player can render it, never offered as something to browse |

Each `outputs[]` entry: `{id, type: "local"|"upnp_renderer", name, reachable, active,
transport_state, error}`.

- `transport_state` — `"PLAYING"` | `"PAUSED"` | `"STOPPED"`, or `null` when nothing could be read.
- `reachable` — `false` when the output cannot be contacted (speaker asleep or off the network).
- `error` — why this output produces no sound, in the engine's own words (e.g. MPD's
  `Failed to open ALSA device "hw:0,0": Device or resource busy`). `null` normally, and
  it clears itself once playback succeeds. **It may appear seconds after a play request
  has answered `200`**: whether a push to HQPlayer produced actual sound is decided after
  the response (see `/library/queue`).

`GET /player/outputs` is a **different list**: the full catalogue for *choosing* an
output (MPD output blocks as `type: "mpd_output"` with an `output_id`, plus known
renderers), including inactive and unreachable ones. `PlayerState.outputs[]` carries
only what is running. Same entry shape, different contents.

### HQPlayer — `/hqplayer/*`
| Method | Path | Description |
|---|---|---|
| GET | `/hqplayer/connection` | Connection state — `available` (HQPlayer reachable), `naa_available` (networkaudiod active) + **`use_as_output`** (library playback routed through HQPlayer) |
| PUT | `/hqplayer/connection` | Connect to HQPlayer instance — response includes `naa_available` |
| DELETE | `/hqplayer/connection` | Disconnect and delete the persisted config. **Stops HQPlayer first**, so its NAA releases the local sound card |
| PUT | `/hqplayer/use-as-output` | Route library playback through HQPlayer — body `{ enabled }` → `{ use_as_output }` |
| GET | `/hqplayer/discover` | Scan local subnet |
| GET | `/hqplayer/filters` | Available interpolation filters (the active one is in `/hqplayer/status`) |
| PUT | `/hqplayer/filter` | Select a filter by index |
| GET | `/hqplayer/shapers` | Available noise shapers |
| PUT | `/hqplayer/shaper` | Select a shaper by index |
| GET | `/hqplayer/modes` | Available output modes |
| PUT | `/hqplayer/mode` | Select an output mode by index |
| PUT | `/hqplayer/volume` | Set volume (dB) |
| DELETE | `/hqplayer/dsp` | Forget the persisted DSP selection |
| GET | `/hqplayer/status` | Current DSP status — now also carries **`length`**, the track duration in seconds as HQPlayer measures it (`null` when it knows none, e.g. a live stream) |

**Seeking through HQPlayer now works.** The player state reports `can_seek: true` whenever a
length is known, and `POST /player/control` with `action: "seek"` reaches HQPlayer's own seek
(position in seconds, same payload convention as every other source). It was previously
declared unseekable because nothing sent the command — not because HQPlayer refuses it.
`duration` prefers HQPlayer's own measurement over whatever the source supplied: it is right
more often, and it is the only value available for a playback started outside Audiogravi<sup>ty</sup>.

**Every source reaches HQPlayer**, streaming services included — there is no source-based
refusal left, only the format deny-list. HQPlayer pulls each track over HTTP from an address
on the LAN: `/hqplayer/stream/` for local files, and the service's own public proxy path for
Qobuz / Tidal / HIGHRESAUDIO. Those URLs carry **no `api_key`** by design (the same reason
renderer-facing URLs do not), so they must stay in the public-path allow-list. Qobuz and HRA
are pushed with `?mode=redirect`, which 302s HQPlayer to the CDN so the box relays nothing;
Tidal has no CDN URL to give and is passed through.
| POST | `/hqplayer/stop` | Stop playback |

**`use-as-output`** is server-side and persisted, so every client agrees on where
library playback goes. Enabling answers **503** when no HQPlayer is configured or its
NAA is not running; disabling is always allowed and stops HQPlayer, releasing the local
sound card. Clients must not write this setting to correct an observed NAA outage — the
core refuses the play instead, naming the daemon.

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
| GET | `/qobuz/oauth/callback` | OAuth2 callback (browser redirect target) — renders a styled result page; a core failure returns the styled **error** page with status **502**, not a raw 500 |
| DELETE | `/qobuz/connection` | Disconnect |
| GET | `/qobuz/stream/{track_id}` | FLAC pass-through proxy — **public (no auth)**, used by UPnP renderers on the LAN. `?mode=redirect` → **302** to a fresh CDN URL (local MPD path: MPD follows it, so the enqueued proxy URL never expires and AG relays no bytes) |

### HIGHRESAUDIO (HRA) — `/highresaudio/*`
| Method | Path | Description |
|---|---|---|
| GET | `/highresaudio/connection` | Connection state (`connected`, `username`, `subscription`, `has_subscription`). `subscription` is HRA's own word for the session — `SUBSCRIPTION` or `NO SUBSCRIPTION`; `has_subscription` is `false` when the account can play only its purchases (the Vault): the catalogue, favourites and playlists refuse that session. `null` while disconnected. A client reading a core that predates the field must treat its absence as subscribed |
| POST | `/highresaudio/connection` | Log in — body `{username, password}`. 401 when HRA issues no session (bad credentials). An account without a subscription IS connected, with `has_subscription: false` |
| DELETE | `/highresaudio/connection` | Disconnect (logout + clear credentials) |
| GET | `/highresaudio/stream/{track_id}` | FLAC pass-through proxy — **public (no auth)**, used by UPnP renderers on the LAN. `?mode=redirect` → **302** to a fresh CDN URL (local MPD path: MPD follows it, so the enqueued proxy URL never expires and AG relays no bytes) |

### Services — `/services/*`
| Method | Path | Description |
|---|---|---|
| GET | `/services` | List all managed systemd services |
| GET | `/services/{name}` | Service details + metrics |
| POST | `/services/{name}/start` | Start |
| POST | `/services/{name}/stop` | Stop |
| POST | `/services/{name}/restart` | Restart |
| POST | `/services/{name}/reload` | Reload the unit's config |
| POST | `/services/{name}/properties/validate` | Dry-run an override before applying it |
| POST | `/services/{name}/properties/restore` | Undo the previous override |
| DELETE | `/services/{name}/properties/override` | Drop the override, back to unit defaults |
| POST | `/services/{name}/action` | start / stop / restart / enable / disable — **only Audiogravi<sup>ty</sup>-managed units** (audio engines + core AG services); a non-managed unit is rejected |
| GET | `/services/{name}/properties` | systemd unit properties |
| POST | `/services/{name}/properties` | Apply RT/CPU/IO override properties — managed units only; each value is strictly validated (no directive injection) and the override is **always** re-validated server-side (`skip_validation` is ignored) |

### Profiles — `/profiles/*`
| Method | Path | Description |
|---|---|---|
| GET | `/profiles/detailed` | Profiles with their contents |
| POST | `/profiles/{profile_id}/activate` | Activate a profile |
| POST | `/profiles/{profile_id}/deactivate` | Deactivate a profile |
| GET | `/profiles/configuration` | Current configuration snapshot |
| GET | `/profiles/configuration/export-file` | Download the configuration |
| POST | `/profiles/configuration/import-file` | Restore a configuration |

### Performance — `/performance/*`
| Method | Path | Description |
|---|---|---|
| GET | `/performance/cpu/info` | Per-core governor and frequency |
| POST | `/performance/cpu/governor/set` | Apply a governor now |
| POST | `/performance/cpu/governor/save` | Persist the current governor |
| POST | `/performance/cpu/governor/systemd/create` | Reapply it at every boot |
| GET | `/performance/rt-processes` | Real-time scheduling per audio process |

**Benchmarks** — start a test, then poll it by `{test_id}`. **No UI screen calls
these today**; see `/docs` for their request/response shape.

| Method | Path | Description |
|---|---|---|
| POST | `/performance/latency/test/start` | Start a latency test (`cyclictest`) |
| GET | `/performance/latency/test/{test_id}/status` | Progress |
| GET | `/performance/latency/test/{test_id}/result` | Result |
| POST | `/performance/latency/test/{test_id}/cancel` | Cancel |
| POST | `/performance/network/test/start` | Start a network stability test (`iperf3`) |
| GET | `/performance/network/test/{test_id}/status` | Progress |
| GET | `/performance/network/test/{test_id}/result` | Result |
| POST | `/performance/network/test/{test_id}/cancel` | Cancel |

### Push notifications — `/push/*`
| Method | Path | Description |
|---|---|---|
| GET | `/push/vapid-public-key` | VAPID public key for subscription |
| POST | `/push/subscribe` | Register push subscription |
| DELETE | `/push/unsubscribe` | Remove subscription (query param: `endpoint`) |

### System info — `/sysinfo/*`
| Method | Path | Description |
|---|---|---|
| GET | `/sysinfo/current` | CPU, memory, disk, network snapshot |
| GET | `/sysinfo/metrics` | Live metrics series |
| GET | `/sysinfo/system` | Host identity (kernel, distro, uptime) |
| GET | `/audio-hw/devices` | ALSA cards + USB interfaces (own group, not under `/sysinfo`) |
| GET | `/sysinfo/logs` | Journalctl logs for a unit |
| WS | `/sysinfo/terminal/ws` | Interactive PTY shell (WebSocket) |
| GET | `/sysinfo/status` | Aggregated health of the box |
| GET | `/sysinfo/cpu` | CPU model, cores, frequencies |
| POST | `/sysinfo/monitoring/start` | Start pushing metrics on SSE |
| POST | `/sysinfo/monitoring/stop` | Stop pushing them |
| POST | `/sysinfo/logs/stream/start` | Start streaming a unit's journal on SSE |
| POST | `/sysinfo/logs/stream/stop` | Stop streaming it |
| POST | `/sysinfo/actions/reboot` | Reboot the machine |
| POST | `/sysinfo/actions/restart-backend` | Restart the core |
| POST | `/sysinfo/actions/update` | Self-update the core to a newer release; admin **password** required |
| GET | `/sysinfo/update-status` | Current self-update progress (phase) |
| GET | `/sysinfo/support-report` | Full state snapshot for the owner to send to support; **admin-only** |

`GET /sysinfo/support-report` → one snapshot of the box, built on demand. Sections:

- `box` — `ag_version`, `architecture`, `hostname`, `os`, `python`, `enabled_modules`.
- `licence` — `status` (the verdict: `trial | lifetime | starter | expired | version_expired | tampered | no_license`), `plan`, `device_id`, `days_remaining`, `activated_at`, `expires_at`, `version_scope`, `order_id`, plus `online_check` `{ status, valid, checked, checked_at }`. No `.lic` content.
- `system` — `uptime`, `boot_time`, `load_average`, `memory`, `cpu`, `temperature`, `os_release`, `kernel`, and `network_interfaces` as `{ name, ipv4, ipv6, is_up }`. No MAC: `licence.device_id` already answers the identity question.
- `network` — `gateway`, `default_interface`, `lan_ip`, `dns_servers`, `clock` `{ timezone, ntp_service, ntp_synchronized, local_time }`, `links` (per interface `{ name, up, mtu, type: wired|wifi, speed_mbps?, duplex?, bitrate?, signal_dbm?, ssid?, note? }`) and `reachability` `{ internet, license_server? }` — each a measured TCP probe `{ host, port, reachable, latency_ms | error }`. A read that failed carries `gateway_error` / `dns_error` instead of an absent key: a failed measurement is never rendered as "no default route".
- `web_ui` — how the interface is actually served, **probed against the running server**, never read from config: `scheme`, `port`, `reachable`, `ui_build` (the served `build.json` — a core/ui version skew is invisible otherwise), `certificate` `{ subject, issuer, not_before, not_after, days_left, san_dns, san_ips, covers_lan_ip }` and `ca` `{ bootstrap_port, available, subject, not_after, issuer_matches, signature_verified }`. `covers_lan_ip` / `signature_verified` are `null` when undecidable, never `false`.
- `self_update` — `state` (the updater's own phase), `bootstrap_url`, `download_token_present` (presence only) and `releases` `{ url, http_status, latency_ms, accessible, latest?, note? }`. `accessible` is the **measured** answer to "can this box see a release": `true` (with `latest`), `false`, or `null` when GitHub's anonymous rate limit makes it undecidable.
- `env_sanity` — whether the deployed `.env` carries what the code expects: `path` (the file pydantic actually loaded), `mode`, `world_readable`, `keys_present`, `expected_keys`, `missing`, `unknown`. **Names only, never values.** `missing` is an inventory — those keys run on `config.py` defaults — not an alarm.
- `storage` — `mounts` `{ mountpoint, for_paths, total_bytes, free_bytes, used_percent, read_only }` for `/`, `/var`, the backup dir, MPD's cache and every library root. `read_only` catches the classic silent failure: a filesystem the kernel remounted `ro` after an error.
- `packages` — `{ id, label, status, installed_version, supported_here }`. No update check, so no apt refresh and no vendor calls.
- `services` — `managed` (the AG allowlist, each `{ name, state, sub_state, enabled }`), `failed_elsewhere` (any failed unit outside it) and `total_units`.
- `audio_stack` — the `/audio-stack/status` payload: `outputs`, `selected_output`, per-service `{ service_id, config_path, configured, output, configured_device, pinned_device, device_matches_pin? }`, `library_sources`.
- `audio_live` — the audio path **as it is now**, not as configured: `cards` (ALSA cards with `usbid`, `usbbus`, `usb_speed_mbps`, `usb_version` — a DAC that came up Full-Speed instead of High-Speed is a silent degradation), `active_streams` `{ stream, direction, format, rate, channels }` (the bit-perfect proof), `cpu_governor`, `cpu_mhz`. An unreadable `/proc/asound` sets `cards_error` rather than reading as "no DAC".
- `audio_tuning` — per audio unit, `load_state` first: `systemctl show` answers for a unit that does not exist on the box, with the defaults it *would* apply, so anything other than `loaded` means **no tuning fields are returned** for that unit (`ActiveState` cannot tell a stopped unit from an absent one). Only `not-found` means the software is absent — `masked`, `bad-setting`, `error` and `stub` all describe a unit file that **exists**, and a client must not render them as "not installed". For a loaded unit: what systemd is **configured** to apply against what the process **actually** carries: `configured` `{ nice, cpu_affinity, cpu_sched, cpu_sched_priority, io_class, io_priority, io_accounting, ip_accounting, drop_ins }` vs `live` `{ nice, cpu_sched, cpu_sched_priority, cpu_affinity, io }`, plus `restarts` (Restart=always masks crash loops), `started_at`, `memory_bytes`, `cpu_used_seconds`. The difference between the two halves is a drop-in that did not apply.
- `av_peers` — the audio ecosystem around the box: `upnp_renderers` / `upnp_servers` `{ name, host, is_local? }` (SSDP, so same-segment only), `hqplayer` `{ configured_host, port, probe, available?, state?, found_on_network }` and `roon` `{ configured_host, in_use, probe?, found_on_network }`. Both peers report what the **network** holds regardless of configuration. `roon.in_use` reads the pairing token: `roon_core_host` defaults to `127.0.0.1`, so a host alone never means "configured".
- `configs` — one entry per audio config: `{ service_id, path, exists, size_bytes, modified, mode, lines, dropped_comments, redacted, truncated, backups_total, last_backup }`. See the redaction contract below.
- `library` — `declared_roots`, `has_local_library`, `roots_detail` `{ path, exists, readable }`, and `mpd_database` `{ path, declared, exists?, size_bytes?, modified? }` where `declared` ∈ `declared | not_declared | config_unreadable` — an unreadable `mpd.conf` is not the same diagnostic as a database that was never built — plus `mpd_stats` `{ songs, albums, artists, db_updated, mpd_error }` asked of MPD itself (a track count answers what a database file size cannot).
- `streaming` — per service (`qobuz`, `tidal`, `highresaudio`, `roon`): `true`, `false`, or **`null` when the probe could not run** (module not enabled, or it raised) — with the reason under `probe_errors: { service: reason }`, present only when there is one. `null` must render as *unknown*, never as "not signed in": collapsing the third case onto `false` is what made this section report every account as disconnected on every box. Never a token. **Every key is a service** except the metadata ones (`probe_errors`, `error`) — a client must exclude those rather than match a hardcoded service list, or a service the core adds later disappears from a section that still looks complete.
- `journal` — recent failures, redacted like the configs: `lines` (unit errors, `-p err`, 7 days), `kernel` (hardware-shaped warnings — USB resets, storage errors, undervoltage, throttling — filtered **server-side** so a chatty unrelated warner cannot push them out of the window) and `boots` `{ total, recent }` (five boots in two days points at power or storage, not software). `lines` and `kernel` are capped on journalctl's own order, then ordered by parsed instant (not by string — a DST week carries two offsets) and identical blocks are folded into the first occurrence, annotated `[×N, last <timestamp>]`; a block is a timestamped line plus its continuations, so a count never lands on a continuation. A sub-read that failed carries `error` / `kernel_error` / `boots_error`; the others are still returned.

**Secrets are redacted before the report is built.** Config files are reduced to their
effective directives — comments dropped except the Audiogravity marker, `#`/`//`/XML
alike — and any credential-shaped directive **or value** is replaced with `«redacted»`,
the directive **name** kept so the reader still learns the setting exists. API keys, the
JWT secret, CIFS credentials, streaming tokens, the `.lic` content and library contents
never appear. Each config entry carries `dropped_comments`, `redacted` and `truncated`
counts — a cut is never silent.

The payload carries `report_version` (**2** since the network/web/self-update/env/storage/
audio-live/audio-tuning/av-peers/journal sections were added); a client older or newer than
its core must state a section's absence rather than render an empty one as a negative finding.

A section the core could not collect carries its own `error` key instead of sinking the
response; the call still returns **200**. On-demand only: it shells out (lsblk, findmnt,
dpkg), so it is not cached, polled or scheduled.

`POST /sysinfo/actions/update` body: `{ password, version?, token? }` → `{ status: "updating", from, to }`. Admin + **password** gated. Launches a **detached** updater (transient systemd unit) that reinstalls the core binary (to `version`, or latest when omitted), health-checks it, and **rolls back** on failure. `token` is an optional GitHub PAT for the private releases repo (Early Access); when omitted it falls back to the core's configured `RELEASE_DOWNLOAD_TOKEN`. Health-check requires the new binary to report the **target version** (not just answer `200`). Returns **409** if an update is already in progress (a crashed/stale in-progress state older than 15 min is ignored, so a dead updater can't wedge this). Follow progress via `GET /sysinfo/update-status`.

`GET /sysinfo/update-status` → `{ phase, from?, to?, error?, updated_at? }` where `phase` ∈ `idle | starting | downloading | installing | verifying | done | rolled_back | failed`. Read from disk, so it survives the core restart mid-update.

### Audio Stack — `/audio-stack/*`
Per-service minimal-config provisioning for the audio stack (mpd, upmpdcli, shairport).
Consumed by the first-time-setup modal + the editor's **Guided** mode in AUDIO
SERVICES CONFIGURATION. **Admin-only** — every endpoint requires an
administrator. **No licence needed**: setting the machine up is not a paid
feature, so the gate is about the role, not the edition.

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

`GET /audio-stack/status` → `{ outputs: [{ hw, card_name, usb_id, device_id, label, category, is_usb_dac, recommended }], library_sources: [{ kind: "usb"|"mount", label, path, uuid, fstype }], selected_output: { usb_id, card_name, device_id } | null, services: [{ service_id, config_path, configured, output: { usb_id, card_name, device_id } | null, configured_device, pinned_device, device_matches_pin? }] }`. `configured` is **true only when the file carries the AG marker** (not mere existence — distro packages ship defaults). `services[].output` is the per-service pinned output (null for upmpdcli / unset). `selected_output` is a back-compat single pin derived from the per-service map.

These three fields were added without bumping `report_version`, so a client must treat an **absent** key and a `null` one as different answers: absent means the core predates them and said nothing; `null` means it looked and found nothing. Rendering the first as the second asserts a fact the payload never carried.

`configured_device` and `pinned_device` are two **different** facts and the gap between them is the point: `pinned_device` is the `hw:X,Y` the stored pin resolves to (what AG believes it selected), `configured_device` is what the service is really playing on. For MPD that is the block MPD has **enabled**, not the first block in `mpd.conf` — native switching never rewrites the file. `device_matches_pin` is present **only when both are known**: a missing pin or an unparsable config is *unknown*, never "they agree". They drift apart when a config is hand-written or predates per-service pins, and that drift is exactly what a support report exists to surface.

`GET /audio-stack/library-scan-status` → `{ scanning: bool, job_id? }`. `scanning` is true while MPD's database `update` runs (its `updating_db` status field is set); `job_id` is that update's id when scanning. Best-effort — an unreachable MPD reports `{ scanning: false }` rather than erroring. The UI polls this (~1.5 s) after a library change (`/provision`, `/library`) to show a transient "indexing library" indicator and hide it once the scan settles; the indicator also probes it **once on mount**, so leaving and returning to the config tab mid-index re-attaches to the running scan instead of losing it. Admin-only.

`POST /audio-stack/provision` body: `{ card_name, usb_id?, device_id?, (music_directory | library_usb_uuid + library_fstype), regenerate?, services?, admin_password }` → `{ device, selected_output, music_directory, results: [{ service_id, status: "generated"|"regenerated"|"error", config_path?, backup_path?, restarted?, error? }] }`. **Always overwrites** the config, auto-backing up any existing file first (distro packages ship defaults, so an only-if-absent write never applied). **Both** the initial provision and per-service `regenerate` require the admin `admin_password` (verified — wrong/missing → **401**). Pins the chosen output for each targeted service that drives an ALSA device (mpd, airplay), and **triggers an MPD database rescan** when mpd's library is (re)generated — skipped when there is no library, since nothing would be walked.

`music_directory` carries **three distinct values**, and absence is not emptiness:

| Value | Meaning |
|---|---|
| absent (`null`) | Nothing is said about the library — the one mpd already has is **kept**. This is what a "reset to minimal" sends: it resets the rest, not your music. |
| **empty string** | The box deliberately has **no local library** — a streaming-only setup, an AirPlay receiver, a UPnP bridge. mpd's `music_directory` directive is **omitted**, never written empty (mpd refuses to start on `music_directory ""`, and on a relative path). Without the directive mpd starts, disables its database and still accepts streams. |
| a path | Used, after checks. |

A path that is given must be **absolute, existing, a directory, and readable by the account mpd runs as** — a directory this process can read is not necessarily one mpd can, and that failure is indistinguishable from an empty library once mpd is running. Any of those fails with **400** carrying a message written to be shown as-is. Checked **before** any side effect (output pin, ALSA index pin, USB mount), so a refusal never leaves the box half configured. Ignored entirely when `library_usb_uuid` is set.

`POST /audio-stack/output` body: `{ service_id, card_name, usb_id?, device_id? }` → `{ service_id, device, output }`. Rewrites **only** the ALSA device directive of that service (via steering's device switcher) and pins the new per-service output — the rest of the config is preserved. Admin-only, **no password**. **400** if the service has no ALSA output or the output cannot be resolved.

`POST /audio-stack/library` body: `{ music_directory | library_usb_uuid + library_fstype }` → `{ service_id: "mpd", music_directory }`. Sets, **adds or removes** mpd's `music_directory` (mounting a USB drive by UUID if given) — outputs and bit-perfect flags preserved — restarts mpd, and **triggers an MPD database rescan** so the new library is indexed (the minimal config has `auto_update` off; the rescan runs in the background). Both directions are supported: attaching a library to a box that started without one, where there is no directive to rewrite, and **detaching** it again by sending no path — the directive is then removed rather than blanked, and no rescan is triggered since there is nothing to walk. The same path checks as `/provision` apply, with the same **400** and message. Admin-only, **no password**.

`GET /audio-stack/mounts` → `[{ slug, label, host, share, mountpoint, read_only, mounted, in_use }]`. Only the mounts **created from the UI** (recognised by their systemd-unit tag) — hand-made OS mounts are not listed (they already appear in `library_sources`). `mounted` is true only when the CIFS share is actually mounted (an armed idle automount — an `autofs` trap — reports **false**). `in_use` flags the share mpd's current `music_directory` lives on.

`POST /audio-stack/mounts` body: `{ label, host, share, username?, password?, read_only?, admin_password }` → the created mount (shape above, `mounted: true`). Installs a systemd `.mount`/`.automount` pair at `/mnt/<slug>` (slug derived from the label) and **actually mounts the share before answering** — the connectivity test, done as a non-blocking start + state poll (30 s budget) so a slow host can never leave an orphan mount behind a rollback. On failure everything is rolled back and the mount error is returned as **502**; validation errors are **400**; wrong `admin_password` is **401**. `username`/`password` are the **CIFS credentials** (both-or-neither; guest otherwise), stored only in a 0600 file — `admin_password` is always the AG admin's re-authentication, as on `/provision`. CIFS/SMB only (NFS is terminal-only by design). Creates are serialised server-side.

`DELETE /audio-stack/mounts/{slug}?force=` → **204**. Unmounts (verified) and removes the unit files, credentials and mountpoint. **404** for a slug AG does not manage — hand-made mounts are never touched. **409** when the share is mpd's current library or the unmount is busy (files open); retry with `?force=true` to lazy-unmount anyway — the UI drives this with an explicit confirm.

### Config Validation — `/config_validation/*`
Structural + semantic validation of the editable audio config files.

`/validate` needs **no licence**: it guards the configuration import, which is itself
ungated, and the caller imports anyway when validation fails — gating it removed a
safety check instead of protecting a feature. `/validate-topology` **is** licence-gated
(**403** on Starter): it serves the Pipeline view.

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

### Radio — `/radio/*`
| Method | Path | Description |
|---|---|---|
| GET | `/radio/search` | Search the Radio Browser catalogue |
| GET | `/radio/library` | Stations saved in My Live Radio |
| POST | `/radio/library` | Save a catalogue station |
| POST | `/radio/library/custom` | Save a hand-entered station |
| DELETE | `/radio/library/{station_uuid}` | Remove a saved station |
| PUT | `/radio/{station_uuid}` | Edit a saved station in place |
| GET | `/radio/favorites` | List favourites |
| POST | `/radio/favorites` | Add a favourite |
| DELETE | `/radio/favorites/{station_uuid}` | Remove a favourite |
| POST | `/radio/play` | Resolve a station URL and play it — body `{ station_uuid }` |

`POST /radio/play` follows the output selection like every other play path: same
destinations and same refusal statuses as `/library/queue` (see above). The stream is
badged `origin: "radio"`.

### Audio software packages — `/packages/*`
| Method | Path | Description |
|---|---|---|
| GET | `/packages/` | List managed packages |
| GET | `/packages/{package_id}` | Package details |
| GET | `/packages/{package_id}/logs` | Buffered log of the current/last operation |
| POST | `/packages/{package_id}/install` | Install |
| POST | `/packages/{package_id}/uninstall` | Uninstall |
| POST | `/packages/{package_id}/update` | Update one package |
| POST | `/packages/update_all` | Update every managed package |
| GET | `/packages/config/view` | The registry-generated config, as applied |
| POST | `/packages/config/refresh` | Regenerate that config from the registry |

`available_version` comes from apt for packages that live in a repository, and **from the source itself** for those that do not — a downloaded `.deb` (HQPlayer NAA) is read from the vendor's own listing, and an AG-hosted bundle from the checksum manifest published beside it. Asking apt about those returns the version already installed, so a comparison against it always said "up to date". It stays `null` for a vendor that publishes no version at all (Roon): there, `installer_type` is `script` and updating means reinstalling the current build rather than comparing.

`GET /packages/` and `GET /packages/{package_id}` also return **`availability`** and **`availability_reason`**. `availability` is one of `available`, `unsupported` (the source genuinely publishes nothing for this box — permanent), `unknown` (the source could not be reached when the config was resolved — worth retrying) or `blocked` (another installed package forbids it, e.g. Roon Server next to Roon Bridge). `availability_reason` is a short sentence for display, `null` when nothing is wrong. `is_supported` keeps its meaning — can this box install it — and is now derived from the same facts; the two extra fields exist because a greyed-out button needs to say **why**, and because "no build for your machine" and "we could not ask" are not the same answer. A **vendor verdict outranks a local one**: a package with no build for this architecture reports `unsupported` even when a conflicting package is also installed, since removing the other one would not make it installable. Package ids are `airplay`, `mpd`, `hqplayer`, `upmpdcli`, `roon` and `roonserver`. The `is_test_package` flag stays in the response model, but no shipped package sets it: the no-op `test-dummy` entry that exercised the install workflow is no longer declared in the registry, so it is no longer resolved into a box's config. A **`required`** flag marks a package the box cannot work without: `POST /packages/{id}/uninstall` refuses it, and the interface offers no button for it. Only `mpd` sets it today — the local library, the queue, internet radio and all three streaming services play through MPD, so a box that lost it would keep an interface and lose the product. Stopping the service is still allowed, and is the way to run a box purely as a Roon endpoint or an HQPlayer NAA.

`GET /packages/{package_id}/logs?after_seq=<n>` → `{ package_id, status, entries: [{ timestamp, level, message, seq }], last_seq }`. Log lines are pushed live as `package_log` SSE events; this route exists so a client that **missed** some — a reconnect, a backgrounded tab, a slow consumer — can recover them instead of staying stuck on the last line it received. `seq` is monotonic **per package and never restarts**, including across operations, so a client holding a stale cursor is never wrongly told it is up to date; pass the highest `seq` held as `after_seq` to fetch only what is missing. `last_seq` is the highest value held server-side, which tells a caught-up client where it stands even when `entries` comes back empty. The buffer holds the **last 500 lines** and is cleared when a new operation starts on that package — so do not call this before the operation has been POSTed, or the previous operation's log is returned. **404** on an unknown package id. `level` is one of `debug`, `info`, `success`, `warning`, `error`; output relayed from apt/dpkg is always `info` (its wording is third-party and says nothing about severity — the verdict is the operation's own result line).

### License — `/license/*`
| Method | Path | Description |
|---|---|---|
| GET | `/license/status` | Current licence state — for a trial, `days_remaining` and `trial_days_total` (built-in floor, or a longer licence-server-signed override); for a licence carrying an end date, `expires_at` (detailed below) |
| GET | `/license/online-status` | Cached remote verification (detailed below) |
| GET | `/license/public-config` | Public config served by the licence server |
| POST | `/license/check` | Validate a key without applying it |
| POST | `/license/activate` | Self-service activation |
| POST | `/license/upload` | Upload a licence file |
| DELETE | `/license/license` | Remove the installed licence |

**`GET /license/status`** — `status` is one of `trial`, `lifetime`, `starter`, `expired`,
`version_expired`, `tampered`, `no_license`.

Two of them are easy to confuse and mean different things:

- **`expired`** — a licence that carried an end date and reached it. The customer paid; his
  term is over. The box keeps Starter, exactly like an expired trial. Previously this fell
  through to `tampered`, which told the customer his own file was *"invalid or bound to a
  different device"* — read as corrupted or stolen, and worth a support ticket every time.
- **`version_expired`** — a licence still valid in time, bought for an earlier major version.

**`expires_at`** (ISO date, inclusive) is present whenever a licence carries an end date —
both while it is still running and after it has ended. It is `null` on a perpetual licence,
which is the only kind that has no end. Without it the interface reported a time-limited
licence as *"Lifetime license active"*, so a customer believed he had bought one outright.

The comparison is made in **UTC on both ends**, so a box and the licence server lapse a
licence at the same instant whatever timezone the box sits in. An `expires_at` present on a
licence is enforced **whatever its `plan` says** — a document marked perpetual that also
carried a date would otherwise stay unlocked for ever while the interface, which reads the
date, announced it as active until a day long past.

A licence still within its term keeps `status: "lifetime"` — the tier and the unlocked
features are unchanged, and that is what gating reads. Only the wording differs, which is why
`expires_at` has to travel with it. `version_expired` carries the same details as any other
licensed state (`expires_at`, `order_id`, `plan`), since a licence can be both version-locked
and time-limited.

**`plan`** is `"lifetime"` or `"term"` — it is **not** the raw `type` from the .lic file. The
licence server stamps `"trial"` on every document that carries an end date, including one
sold for a year, so relaying it unchanged showed a paying customer `Plan: trial`.

**`GET /license/online-status`** returns the cached result of the last remote
verification (refreshed every 24 h, or right after an activation).


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
when the license server is unconfigured. Delivery is **license-independent**: a
trial or expired box receives them too (they ride the public config channel, not
only a valid verification).

`update` — availability of a newer AG release, computed by the license server
(newer than this backend's version and within the box's major). When
an update applies: `{ "available": true, "latest": "0.9.11", "mandatory": false,
"notes_url": "…" }`. Defaults to `{ "available": false }` when up to date or the
license server is unconfigured/unreachable. **License-independent** like
`announcements`: a trial or expired box is notified too, bounded to its own major
(a cross-major jump stays a paid upgrade, never an auto-update). The backend only
surfaces this — it performs no version comparison and downloads nothing on its own.


### Output steering — `/steering/*`
| Method | Path | Description |
|---|---|---|
| GET | `/steering/status` | Which service drives which ALSA device |
| GET | `/steering/outputs` | Outputs a service can be switched to |
| POST | `/steering/switch-output` | Point a service at another output |

### Service config editor — `/audio_app_config/*`
Editing a service's own configuration file needs **no licence**.

The editable set and each file's location come from the core's service registry, **not**
from `audio-config.json`: its `appconfigfile` field is ignored. A path can only name one
directory, and the same file lives in `/etc` on a distro package and `/usr/local/etc` on a
source build — so whichever value shipped was wrong on the other platform. The core resolves
across both layouts instead. A service the core does not know has no editable config.

| Method | Path | Description |
|---|---|---|
| GET | `/audio_app_config/services` | Services whose config file is editable (from the core registry) |
| GET | `/audio_app_config/{service_id}/config` | Read the config file (`?type=raw` for the file itself) |
| POST | `/audio_app_config/{service_id}/config` | Write it back; optionally restart the service |
| GET | `/audio_app_config/{service_id}/backups` | List the timestamped copies kept before each save |
| POST | `/audio_app_config/{service_id}/backups/{filename}/restore` | Restore one of them; optionally restart the service |

Every save takes a timestamped backup first, which is what the two `backups` routes read
and replay — so an edit that stops a service can always be undone from the editor.

Three contract details of the structured form (`?type=structured` / POST with `data`):
values of schema-declared **boolean** fields arrive as JSON booleans (not the file's
`0`/`1` strings) and are written back as the format's own spelling; a structured save
**preserves the `# Managed by AudioGravity` marker** when the file carried it (never adds
it — raw saves are untouched, the user controls the full text there); and upmpdcli's single
**Friendly Name** field maps to `avfriendlyname` (the name UPnP/AV control points display),
with `friendlyname` — the OpenHome renderer's name — derived server-side as `<name>-OH`.
Dissociating the two keys remains possible in raw mode only.

Each item of `GET /audio_app_config/services` carries three fields describing the state of
the software and of its file. All three default to the optimistic value, so a box that
cannot answer is never reported as missing something it has.

| Field | Meaning |
|---|---|
| `is_installed` | Whether systemd knows the service's unit (`LoadState != not-found`), read over D-Bus. `true` when it could not be determined — including when the box has no D-Bus. Same authority as the Services and Profiles tabs. |
| `state` | systemd `ActiveState` (`active`, `inactive`, `failed`…), `null` when unknown. Read here rather than from `GET /services/`, whose listing omits units that are loaded yet idle — `upmpdcli` among them — which left their tile with no status at all. |
| `file_exists` | Whether the configuration file is on disk. Distinct from `file_mtime`, which is also `null` when the file cannot be stat'ed: such a file is still served by `GET /{service_id}/config`, so it must not be reported as absent. |

The three are independent, and the UI acts on them separately: a package can be gone with
its configuration file left behind (`apt remove` without `--purge`), and an installed
service can have no file yet — writing one creates it.

### Other
| Method | Path | Description |
|---|---|---|
| GET | `/` | Root — service identity |
| GET | `/health` | Backend health check |
| GET | `/status` | Backend status |
| GET | `/stats/tabs` | Per-tab usage counters |
| GET | `/monitoring/dashboard` | Same stream as `/sse/dashboard` (alias) |
| GET | `/sse/dashboard` | SSE stream the UI opens — every real-time update |
| GET | `/sse/{channel}` | One bus channel — `dashboard`, `player`, `system`, `services`, `profiles`, `performance`, `audio_config`, `steering`. **404** on any other name: `{channel}` is a channel, not an event type (`/sse/sysinfo` is not "the `sysinfo` events" — that event rides on `dashboard`) |


### Routes absent from `/docs`

Four real routes are deliberately kept out of the OpenAPI schema. They are not for the
UI — they are called by a renderer or by the browser's `<img>`/`<audio>` tag — but they
exist, so hunting for them in Swagger is a dead end.

| Method | Path | Called by |
|---|---|---|
| GET | `/library/stream/{path}?sig=` | A network renderer fetching a local file (HMAC-signed, Range) |
| GET | `/audio_pipeline/library-cover/{path}?sig=` | A renderer fetching the cover of that file |
| GET | `/hqplayer/stream/{path}` | HQPlayer fetching a local file over HTTP |
| POST | `/upnp-renderer/{udn}/notify` | The renderer's own GENA callback |

---

## SSE events

The SSE stream at `/sse/dashboard` emits JSON events. Key event types:

| Event type | Payload |
|---|---|
| `now_playing` | Current track, source, format |
| `audio_pipeline` | Full pipeline topology update — same node shape as `GET /audio_pipeline/current`, `unmatched_outputs` included |
| `services_metrics` | CPU/memory/IO per service. Five figures can be `null` — **absent, not zero** — for a **running** service whose counter is off: `memory_mb` when the kernel exposes no memory cgroup controller (the event's `memory_accounting` flag says which case the box is in), and `io_read_rate` / `io_write_rate` / `network_rx_rate` / `network_tx_rate` until *IO Accounting* / *IP Accounting* are enabled on the unit. `cpu_percent` and `tasks` are always measured. A **stopped** unit reports `0` for all of them — that silence is real. |
| `profile_metrics` | Profile activation result |
| `sysinfo` | CPU, memory, disk, network |
| `renderer_status` | UPnP renderer connection state — see below |

---

**`renderer_status`** carries `connected`, `reachable`, `bypassed`, `renderer_name`,
`renderer_udn`, plus `transport_state`, `title`, `artist`, `position`, `volume`,
`queue_position`, `queue_total` and `queue_next_*`. **Use it for the connection card
only**: the player reads the renderer's transport state and upcoming track from
`PlayerState.outputs[]` and `queue_next`, which are the single source of truth.

---

*For the complete schema of each request/response, run a local backend and
open `/docs` (Swagger UI) or `/redoc`.*
