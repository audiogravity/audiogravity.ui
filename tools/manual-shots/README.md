# Manual figures

The figures of the user manual (`audiogravity.site/docs/manual/images/ios-*.webp`) are
browser captures of the real interface, taken from the dev instance, in the format of an
iPhone 13 mini: 375 × 812 CSS pixels at density 3. Most are cropped to one component.

This tool retakes them and sets each one beside the published figure. It never writes into
the manual: a person looks at the comparison, then copies in the figures worth replacing.

## Run

```sh
./dev.sh start                                  # the dev instance: UI on :3000, core on :8001
node tools/manual-shots/capture.js --list       # every figure, its chapter, what it needs
node tools/manual-shots/capture.js              # every figure, less those taken from what plays now
node tools/manual-shots/capture.js software login
```

It needs the dev core's `.env.dev` beside this repository (`../audiogravity.core`): the admin
session is forged from its JWT secret and API key, so no password is involved.

Each figure is written as `ios-<name>.webp` in `$TMPDIR/ag-manual-shots` (`--out DIR` or
`AG_MANUAL_SHOTS_OUT` to change it), with `review.html`: every new figure beside the
published one, and the share of pixels that changed. A figure that fails leaves
`<name>.fail.png`, the whole window as it was at that moment. Each figure taken first
removes what an earlier run left for it, so a figure that fails leaves no older WebP
behind to be copied by mistake.

The page counts every difference, down to a few pixels of margin; whether it matters to
a reader is for the person looking. Differences also come from the moment — what plays,
the services' measurements, the password the HQPlayer Embedded dialog draws at random.

To replace a figure, copy it into the site repository:

```sh
cp "$TMPDIR/ag-manual-shots/ios-software.webp" ../audiogravity.site/docs/manual/images/
```

The HTML pages reference the images, so nothing else changes — unless the figure now shows
something its `alt` text does not say: edit the chapter, then run
`python3 scripts/gen_manual_html.py` in the site repository.

| Variable | Default | Use |
|---|---|---|
| `AG_DEV_URL` | `http://localhost:3000` | The dev instance |
| `AG_PROD_URL` | `https://<this machine's address>` | A release served over HTTPS, for `login` |
| `AG_CORE_ENV` | `../audiogravity.core/.env.dev` | Where the session secrets are read |
| `AG_MANUAL_SRC` | `../audiogravity.site/docs/manual` | The manual, as `scripts/sync-manual.js` reads it |
| `AG_MANUAL_SHOTS_OUT` | `$TMPDIR/ag-manual-shots` | Where the figures are written |
| `AG_SERVICES_SETTLE` | `7000` | Milliseconds on the Services tab before `services` is taken |
| `AG_PERFORMANCE_SETTLE` | `7000` | Milliseconds on the Performance tab before `cpu-cards` is taken: its bars need minutes to fill |

## Where each page comes from

- **The dev instance through `localhost`**, for almost every figure. `localhost` is a secure
  context even over plain HTTP; the machine's network address is not, and there the browser
  has no WebAuthn — the app then hides the Face ID row of Settings and the PASSKEYS button of
  the user card.
- **The same instance through the network address** for `hqplayer-embedded-install`: its
  dialog prints the address the page was opened from, and "localhost" would read wrong.
- **An installed release, over HTTPS**, for `login`: the dev server stamps "-DEV ·
  LOCALHOST" on that page, and the passkey button needs HTTPS. A box that serves its
  release over plain HTTP cannot give it; point `AG_PROD_URL` at one that uses HTTPS.

## Staged in the page, never on the box

Some figures show a state the box cannot be put in without consequence. The tool sets it in
the capturing browser only — a response rewritten on its way in, or a component's state —
and writes nothing to the core:

- `license` — a trial, 22 days of 30 left, with the synthetic Device ID of the component's
  story: restoring a real trial would mean deleting the licence.
- `update-banner` — an update to the release the running version leads to (0.9.62-dev →
  0.9.62).
- `hqplayer-output` — *Use as output* switched on: for real, it would send every play of
  the box to that HQPlayer.
- `hqplayer-embedded-install` — a first install, which asks for a web password.

`license-active` shows the real licence, with its **Device ID and Order ID blurred** — the
Order ID is the licence key. Their pixels are replaced by the blur, never blended with it.

## Figures taken from what plays now

`nowplaying-bar`, `origin-badge`, `fullscreen`, `queue-mixed`, `signal-chain`,
`output-busy` and `cast-renderer` show whatever the box is playing. They only run with
`--playback`, which says the lab has been staged for them:

| Figure | Staging (as published) |
|---|---|
| `nowplaying-bar` | A Qobuz track playing (*So What*, Miles Davis) |
| `origin-badge` | A radio playing (Radio Choco HD) |
| `fullscreen`, `signal-chain` | A track playing through MPD (*So What*, 24 bit / 192 kHz) |
| `queue-mixed` | A queue mixing sources: a Qobuz track, a local file, another Qobuz track, a radio |
| `output-busy` | The DAC held by another player, then Play pressed |
| `cast-renderer` | An album cast to a network renderer, so the player has a Next |

Staging takes over the box's audio: do it with the listener's agreement, write down the
starting state (MPD's `status` and `playlistinfo`, the volume), and put it back afterwards.
Take these figures last, and do not run the batch again once the audio is restored — it
would retake them from the restored state.

- **DAC held by another player**: play silence into the DAC's ALSA device as the `mpd` user,
  `sudo -u mpd aplay -q -D hw:<card>,0 -f S32_LE -r 192000 -c 2 -t raw /dev/zero &`, then press
  Play in the app ("Device or resource busy"); `pkill -x aplay` afterwards.
- **Cast**: `PUT /upnp-renderer/{udn}/connection` needs the body `{udn, friendly_name,
  location}` — without it the request is refused and the next Play goes to the local MPD. An
  "add" during a cast goes to the local MPD queue: play a whole album instead.
- **Restoring MPD**: a stream URL added again loses its tags, which the core sets with
  `addtagid` — put Title, Artist, Album and Track back the same way. For the position:
  `setvol 0`, `seek 0 <seconds>`, `pause 1`, then the original volume.

## Writing a recipe

A recipe (`recipes.js`) names the tab, the window height and what to frame.
`js/manual-shots.test.js` fails when a figure of the manual has no recipe, or a recipe no
figure.

- A figure is cut from the window's image: a box that runs past the bottom makes the capture
  fail, and the tool says so. Raise `height`.
- `networkidle` never comes — the app keeps an event stream open. Recipes wait a fixed time.
- Open panels through the component's state (`_setView('outputs')`, `_showInitModal = true`)
  rather than by clicking: some panels have no button on a box that is already set up. Never
  `_onSourceSelect`, which POSTs `/player/source`.
- A state fed by the event stream is put back by it within a second: call
  `el._unsubscribeState?.()` before patching it.
- Neutralise `position: sticky` before scrolling, never after: its opaque background is
  painted over the first lines of the box.
- When the figure's title is a sibling of the component (a source's logo sits in
  `.lib-context`, outside `ag-library-browse`), frame the `union()` of both.
- The Services sparklines start as 30 zeros and gain a point every ten seconds or so: set
  `AG_SERVICES_SETTLE=600000` for charts that say something.
- The captures use Playwright's default headless Chromium, like every published figure. The
  full Chromium draws text a few pixels differently: identical screens then compare as
  changed.
