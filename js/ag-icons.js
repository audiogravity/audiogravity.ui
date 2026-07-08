/**
 * @module AgIcons
 * @description Canonical SVG icon library for the AG UI tree.
 * Every inline SVG icon used by an atom, molecule, organism or page lives here —
 * no usage threshold, no exceptions for "one-offs". Per CLAUDE.md rule 15.
 * Scope: inline SVG only. Icomoon / font-icon glyphs (`<span class="icon-…">`)
 * are a separate system and not concerned by this module.
 *
 * Icons sourced from Lucide (https://lucide.dev) — ISC licence.
 * Custom icons (connectors, output, queue variants) are hand-crafted at 24×24.
 *
 * Each export is the INNER content of an `<svg viewBox="0 0 24 24">`. The
 * outer `<svg>` (stroke, width, height, fill, linecap…) is the caller's
 * responsibility so each consumer can tune size and stroke style for its
 * context.
 *
 * @example
 *   import { iconBack } from '../../ag-icons.js';
 *   html`
 *     <svg viewBox="0 0 24 24" width="22" height="22"
 *          fill="none" stroke="currentColor" stroke-width="2"
 *          stroke-linecap="round" stroke-linejoin="round">
 *       ${iconBack}
 *     </svg>
 *   `
 */

import { svg } from 'lit';

/** Chevron pointing left — back navigation. (Lucide: chevron-left) */
export const iconBack = svg`<path d="m15 18-6-6 6-6"/>`;

/** Chevron pointing right — forward / drill-in indicator. (Lucide: chevron-right) */
export const iconChevronRight = svg`<path d="m9 18 6-6-6-6"/>`;

/** Chevron pointing down — collapse / expand-toggle indicator. (Lucide: chevron-down) */
export const iconChevronDown = svg`<path d="m6 9 6 6 6-6"/>`;

/** Chevron pointing up — expand mini → fullscreen. (Lucide: chevron-up) */
export const iconChevronUp = svg`<path d="m18 15-6-6-6 6"/>`;

/** Double chevron pointing down — collapse / close the fullscreen player. (Lucide: chevrons-down) */
export const iconChevronDoubleDown = svg`
    <path d="m7 6 5 5 5-5"/>
    <path d="m7 13 5 5 5-5"/>`;

/** Circular refresh arrow — reload / sync. (Lucide: rotate-cw) */
export const iconRefresh = svg`
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>`;

/** Plus — add to queue / create. (Lucide: plus) */
export const iconPlus = svg`<path d="M5 12h14"/><path d="M12 5v14"/>`;

/** Padlock — DSD-native volume-lock indicator. (Lucide: lock) */
export const iconDsdLock = svg`
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>`;

/** Three lines with dot bullets — playback queue / list view. (Lucide: list) */
export const iconQueue = svg`
    <path d="M3 5h.01"/>
    <path d="M3 12h.01"/>
    <path d="M3 19h.01"/>
    <path d="M8 5h13"/>
    <path d="M8 12h13"/>
    <path d="M8 19h13"/>`;

/** Concentric circles with filled centre — physical audio output indicator. (custom) */
export const iconOutput = svg`
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>`;

/** Musical note — generic "no cover" placeholder. (Lucide: music) */
export const iconMusicNote = svg`
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>`;

/** Disc with small inner dot — album glyph. (Lucide: disc) */
export const iconAlbum = svg`
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="2"/>`;

/** Disc with medium inner ring — track glyph. (Lucide: disc-2) */
export const iconTrack = svg`
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 12h.01"/>`;

/** Folder / container glyph (library-cover `container`). (Lucide: folder) */
export const iconFolder = svg`
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`;

/** Books on a shelf — the local music library source. (Lucide: library) */
export const iconLibrary = svg`
    <path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>`;

/** Concentric broadcast arcs with centre dot — radio. (Lucide: radio) */
export const iconRadio = svg`
    <path d="M16.247 7.761a6 6 0 0 1 0 8.478"/>
    <path d="M19.075 4.933a10 10 0 0 1 0 14.134"/>
    <path d="M4.925 19.067a10 10 0 0 1 0-14.134"/>
    <path d="M7.753 16.239a6 6 0 0 1 0-8.478"/>
    <circle cx="12" cy="12" r="2"/>`;

/** Play triangle + bar — "up next" / "skip-to" indicator. (Lucide: skip-forward) */
export const iconUpNext = svg`
    <path d="M21 4v16"/>
    <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" fill="currentColor" stroke="none"/>`;

/** Three lines + plus — queue with edit affordance. (custom) */
export const iconQueueEdit = svg`
    <path d="M3.5 6h12M3.5 11h12M3.5 16h7" stroke-linecap="round"/>
    <path d="M18 13v7M15 16.5h7" stroke-linecap="round"/>`;

/** Filled play triangle. (Lucide: play) */
export const iconPlay = svg`
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" fill="currentColor" stroke="none"/>`;

/** Two vertical filled bars — pause. (Lucide: pause) */
export const iconPause = svg`
    <rect x="14" y="3" width="5" height="18" rx="1" fill="currentColor" stroke="none"/>
    <rect x="5" y="3" width="5" height="18" rx="1" fill="currentColor" stroke="none"/>`;

/** Stop button — filled square. (Lucide: square) */
export const iconStop = svg`<rect width="18" height="18" x="3" y="3" rx="2" fill="currentColor" stroke="none"/>`;

/** USB-A pictogram — outer rect + three pin dots. (custom) */
export const iconConnectorUsbA = svg`
    <rect x="3.5" y="7" width="17" height="10" rx="1.2"/>
    <circle cx="7"  cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none"/>`;

/** Hollow concentric circles — TOSLINK optical port. (custom) */
export const iconConnectorToslink = svg`
    <circle cx="12" cy="12" r="8.5"/>
    <circle cx="12" cy="12" r="3"/>`;

/** Square jack with inner circle — RJ45 port. (custom) */
export const iconConnectorRj45 = svg`
    <rect x="3" y="3" width="18" height="18" rx="1.2"/>
    <circle cx="12" cy="12" r="3.5"/>`;

/** Generic plug rectangle with a horizontal mid-line — default connector. (custom) */
export const iconConnectorDefault = svg`
    <rect x="2.5" y="7" width="19" height="11" rx="1"/>
    <path d="M2.5 12h19"/>`;

/** Wi-Fi arcs with bottom dot — wireless source. (Lucide: wifi) */
export const iconWifi = svg`
    <path d="M12 20h.01"/>
    <path d="M2 8.82a15 15 0 0 1 20 0"/>
    <path d="M5 12.859a10 10 0 0 1 14 0"/>
    <path d="M8.5 16.429a5 5 0 0 1 7 0"/>`;

/** Magnifier — search. (Lucide: search) */
export const iconSearch = svg`
    <path d="m21 21-4.34-4.34"/>
    <circle cx="11" cy="11" r="8"/>`;

/** Six dots (two columns × three rows) — drag-handle grip. (Lucide: grip-vertical) */
export const iconDragHandle = svg`
    <circle cx="9"  cy="5"  r="1" fill="currentColor" stroke="none"/>
    <circle cx="9"  cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9"  cy="19" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="5"  r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/>`;

/** Arrow head + horizontal shaft pointing left. (Lucide: arrow-left) */
export const iconArrowLeft = svg`
    <path d="m12 19-7-7 7-7"/>
    <path d="M19 12H5"/>`;

/** Checkmark. (Lucide: check) */
export const iconCheck = svg`<path d="M20 6 9 17l-5-5"/>`;

/** Clock face with side bells — alarm / sleep timer. (Lucide: alarm-clock) */
export const iconAlarm = svg`
    <circle cx="12" cy="13" r="8"/>
    <path d="M12 9v4l2 2"/>
    <path d="M5 3 2 6"/>
    <path d="m22 6-3-3"/>
    <path d="M6.38 18.7 4 21"/>
    <path d="M17.64 18.67 20 21"/>`;

/** Three horizontal lines with a play triangle — "queue + play next" affordance. (custom) */
export const iconQueuePlay = svg`
    <path d="M3.5 6h14M3.5 11h14M3.5 16h9.5"/>
    <polygon points="17,13 21,15.5 17,18" fill="currentColor" stroke="none"/>`;

/** Square outer + cross lines — grid / library matrix. (Lucide: grid-2x2) */
export const iconLibraryGrid = svg`
    <path d="M12 3v18"/>
    <path d="M3 12h18"/>
    <rect x="3" y="3" width="18" height="18" rx="2"/>`;

/** Five-pointed star outline — favourite toggle (inactive). (Lucide: star) */
export const iconStar = svg`
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`;

/** Five-pointed star filled — favourite toggle (active). (Lucide: star filled) */
export const iconStarFilled = svg`
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
        fill="currentColor" stroke="none"/>`;

/** Tilted pencil — edit / modify. (Lucide: pencil) */
export const iconPencil = svg`
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
    <path d="m15 5 4 4"/>`;

// ─── Tab-bar icons ────────────────────────────────────────────────────────────

/** Hexagon with inner circle — Profiles tab. (custom) */
export const iconTabProfiles = svg`
    <path d="M3 12l4-7h10l4 7-4 7H7z"/>
    <circle cx="12" cy="12" r="3"/>`;

/** Two stacked server bars with status dots — Services tab. (custom) */
export const iconTabServices = svg`
    <rect x="3" y="4"  width="18" height="5" rx="0.5"/>
    <rect x="3" y="11" width="18" height="5" rx="0.5"/>
    <circle cx="6.5" cy="6.5"  r=".75" fill="currentColor" stroke="none"/>
    <circle cx="6.5" cy="13.5" r=".75" fill="currentColor" stroke="none"/>
    <line x1="3" y1="19" x2="12" y2="19"/>`;

/** Three nodes connected by paths — Pipeline tab. (custom) */
export const iconTabPipeline = svg`
    <circle cx="5"  cy="6"  r="2"/>
    <circle cx="5"  cy="18" r="2"/>
    <circle cx="19" cy="12" r="2"/>
    <path d="M7 6h3a4 4 0 0 1 4 4"/>
    <path d="M7 18h3a4 4 0 0 0 4-4"/>
    <line x1="14" y1="10"  x2="17" y2="11.5"/>
    <line x1="14" y1="14"  x2="17" y2="12.5"/>`;

/** CPU chip with pins — System tab. (custom) */
export const iconTabSystem = svg`
    <rect x="5" y="5" width="14" height="14" rx="1"/>
    <rect x="9" y="9" width="6"  height="6"  rx="0.5"/>
    <line x1="9"  y1="2"  x2="9"  y2="5"/>
    <line x1="15" y1="2"  x2="15" y2="5"/>
    <line x1="9"  y1="19" x2="9"  y2="22"/>
    <line x1="15" y1="19" x2="15" y2="22"/>
    <line x1="2"  y1="9"  x2="5"  y2="9"/>
    <line x1="2"  y1="15" x2="5"  y2="15"/>
    <line x1="19" y1="9"  x2="22" y2="9"/>
    <line x1="19" y1="15" x2="22" y2="15"/>`;

/** Processor chip with pins — Performance tab. (custom) */
export const iconTabPerformance = svg`
    <rect x="6" y="6" width="12" height="12" rx="1"/>
    <rect x="9" y="9" width="6"  height="6"  rx="0.5"/>
    <line x1="9"  y1="3"  x2="9"  y2="6"/>
    <line x1="12" y1="3"  x2="12" y2="6"/>
    <line x1="15" y1="3"  x2="15" y2="6"/>
    <line x1="9"  y1="18" x2="9"  y2="21"/>
    <line x1="12" y1="18" x2="12" y2="21"/>
    <line x1="15" y1="18" x2="15" y2="21"/>
    <line x1="3"  y1="9"  x2="6"  y2="9"/>
    <line x1="3"  y1="12" x2="6"  y2="12"/>
    <line x1="3"  y1="15" x2="6"  y2="15"/>
    <line x1="18" y1="9"  x2="21" y2="9"/>
    <line x1="18" y1="12" x2="21" y2="12"/>
    <line x1="18" y1="15" x2="21" y2="15"/>`;

/** Three concentric circles — Library tab. (custom) */
export const iconTabLibrary = svg`
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="4"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>`;

// ─── Playback transport ───────────────────────────────────────────────────────

/** Loop arrows — repeat mode toggle. (Lucide: repeat) */
export const iconRepeat = svg`
    <path d="m17 2 4 4-4 4"/>
    <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
    <path d="m7 22-4-4 4-4"/>
    <path d="M21 13v1a4 4 0 0 1-4 4H3"/>`;

/** Two crossing paths — shuffle mode toggle. (Lucide: shuffle) */
export const iconShuffle = svg`
    <path d="m18 14 4 4-4 4"/>
    <path d="m18 2 4 4-4 4"/>
    <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/>
    <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/>
    <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>`;

/** Bar + play triangle pointing left — previous track. (Lucide: skip-back) */
export const iconSkipBack = svg`
    <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" fill="currentColor" stroke="none"/>
    <path d="M3 20V4"/>`;

// ─── Audio / volume ───────────────────────────────────────────────────────────

/** Speaker with waves — volume control. (Lucide: volume-2) */
export const iconVolume = svg`
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>
    <path d="M16 9a5 5 0 0 1 0 6"/>
    <path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>`;

// ─── UI actions ───────────────────────────────────────────────────────────────

/** Gear/cog — settings panel. (Lucide: settings) */
export const iconSettings = svg`
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>
    <circle cx="12" cy="12" r="3"/>`;

/** Two sliders — services settings / filter. (Lucide: settings-2) */
export const iconSettingsSliders = svg`
    <path d="M14 17H5"/>
    <path d="M19 7h-9"/>
    <circle cx="17" cy="17" r="3"/>
    <circle cx="7" cy="7" r="3"/>`;

/** X cross — close / dismiss / cancel. (Lucide: x) */
export const iconClose = svg`
    <path d="M18 6 6 18"/>
    <path d="m6 6 12 12"/>`;

/** Arrow down into tray — download. (Lucide: download) */
export const iconDownload = svg`
    <path d="M12 15V3"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <path d="m7 10 5 5 5-5"/>`;

/** Arrow up from tray — upload. (Lucide: upload) */
export const iconUpload = svg`
    <path d="M12 3v12"/>
    <path d="m17 8-5-5-5 5"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>`;

/** Open padlock — unlocked state. (Lucide: lock-open) */
export const iconUnlock = svg`
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;

/** Key — passkey / authentication. (Lucide: key) */
export const iconKey = svg`
    <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/>
    <path d="m21 2-9.6 9.6"/>
    <circle cx="7.5" cy="15.5" r="5.5"/>`;

/** Open book — documentation link. (Lucide: book-open) */
export const iconDocs = svg`
    <path d="M12 7v14"/>
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>`;

/** Branching paths — API tree / Swagger. (Lucide: git-branch) */
export const iconApiTree = svg`
    <path d="M15 6a9 9 0 0 0-9 9V3"/>
    <circle cx="18" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>`;

/** Angle brackets — code / expert mode. (Lucide: code) */
export const iconCode = svg`
    <path d="m16 18 6-6-6-6"/>
    <path d="m8 6-6 6 6 6"/>`;

/** Triangle with exclamation — warning. (Lucide: triangle-alert) */
export const iconWarning = svg`
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
    <path d="M12 9v4"/>
    <path d="M12 17h.01"/>`;

/** Floppy disk — save / persist changes. (Lucide: save) */
export const iconSave = svg`
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>
    <path d="M7 3v4a1 1 0 0 0 1 1h7"/>`;

/** Horizontal sliders — equalizer / preview diff. (Lucide: sliders-horizontal) */
export const iconSliders = svg`
    <path d="M10 5H3"/>
    <path d="M12 19H3"/>
    <path d="M14 3v4"/>
    <path d="M16 17v4"/>
    <path d="M21 12h-9"/>
    <path d="M21 19h-5"/>
    <path d="M21 5h-7"/>
    <path d="M8 10v4"/>
    <path d="M8 12H3"/>`;

/** Clock with back arrow — history / backups. (Lucide: history) */
export const iconHistory = svg`
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l4 2"/>`;

/** Trash can — delete / remove. (Lucide: trash-2) */
export const iconTrash = svg`
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    <path d="M3 6h18"/>
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`;

/** Circle with i — info / tooltip. (Lucide: info) */
export const iconInfo = svg`
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4"/>
    <path d="M12 8h.01"/>`;

/** Arrow pointing up-right with box — external link. (Lucide: external-link) */
export const iconExternalLink = svg`
    <path d="M15 3h6v6"/>
    <path d="M10 14 21 3"/>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`;

/** Copy rectangles — copy to clipboard. (Lucide: copy) */
export const iconCopy = svg`
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`;

/** Circle with check — success / installed state. (Lucide: circle-check) */
export const iconCheckCircle = svg`
    <circle cx="12" cy="12" r="10"/>
    <path d="m9 12 2 2 4-4"/>`;

/** Empty circle — placeholder / not-installed state. (Lucide: circle) */
export const iconCircle = svg`<circle cx="12" cy="12" r="10"/>`;

/** Radial lines — loading spinner (apply CSS rotate animation). (Lucide: loader) */
export const iconSpinner = svg`
    <path d="M12 2v4"/>
    <path d="m16.2 7.8 2.9-2.9"/>
    <path d="M18 12h4"/>
    <path d="m16.2 16.2 2.9 2.9"/>
    <path d="M12 18v4"/>
    <path d="m4.9 19.1 2.9-2.9"/>
    <path d="M2 12h4"/>
    <path d="m4.9 4.9 2.9 2.9"/>`;

/** Lightning bolt — low-power / zap indicator. (Lucide: zap) */
export const iconZap = svg`
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`;

/** Open eye — show / reveal. (Lucide: eye) */
export const iconEye = svg`
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
    <circle cx="12" cy="12" r="3"/>`;

/** Eye with slash — hide / conceal. (Lucide: eye-off) */
export const iconEyeOff = svg`
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575a1 1 0 0 1 0 .696a10.747 10.747 0 0 1-1.444 2.49"/>
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 4.446-5.143"/>
    <path d="m2 2 20 20"/>`;

/** Power on/off button — boot toggle / power state. (Lucide: power) */
export const iconPower = svg`
    <path d="M12 2v10"/>
    <path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>`;

/** Log out arrow — logout / sign out. (Lucide: log-out) */
export const iconLogout = svg`
    <path d="m16 17 5-5-5-5"/>
    <path d="M21 12H9"/>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>`;

// ─── System / hardware ────────────────────────────────────────────────────────

/** CPU chip with pins — processor / CPU metric. (Lucide: cpu) */
export const iconCpu = svg`
    <path d="M12 20v2"/><path d="M12 2v2"/>
    <path d="M17 20v2"/><path d="M17 2v2"/>
    <path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/>
    <path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/>
    <path d="M7 20v2"/><path d="M7 2v2"/>
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <rect x="8" y="8" width="8" height="8" rx="1"/>`;

/** Server — a music/media server node (e.g. Roon Core) in the pipeline. (Lucide: server) */
export const iconServer = svg`
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
    <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
    <line x1="6" x2="6.01" y1="6" y2="6"/>
    <line x1="6" x2="6.01" y1="18" y2="18"/>`;

/** Audio lines — an amplifier node in the signal chain. (Lucide: audio-lines) */
export const iconAudioLines = svg`
    <path d="M2 10v3"/>
    <path d="M6 6v11"/>
    <path d="M10 3v18"/>
    <path d="M14 8v7"/>
    <path d="M18 5v13"/>
    <path d="M22 10v3"/>`;

/** Audio waveform — a converter / DAC (digital-to-analog) node. (Lucide: audio-waveform) */
export const iconAudioWaveform = svg`
    <path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>`;

/** Thermometer — temperature metric. (Lucide: thermometer) */
export const iconThermometer = svg`
    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>`;

/** Memory stick with contacts — RAM / memory metric. (Lucide: memory-stick) */
export const iconMemory = svg`
    <path d="M12 12v-2"/><path d="M12 18v-2"/>
    <path d="M16 12v-2"/><path d="M16 18v-2"/>
    <path d="M2 11h1.5"/><path d="M20 18v-2"/><path d="M20.5 11H22"/>
    <path d="M4 18v-2"/><path d="M8 12v-2"/><path d="M8 18v-2"/>
    <rect x="2" y="6" width="20" height="10" rx="2"/>`;

/** Hard drive with platters — disk / storage metric. (Lucide: hard-drive) */
export const iconHardDrive = svg`
    <path d="M10 16h.01"/>
    <path d="M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    <path d="M21.946 12.013H2.054"/>
    <path d="M6 16h.01"/>`;

/** Cast / broadcast to a screen or speaker. (Lucide: cast) */
export const iconCast = svg`
    <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
    <path d="M2 12a9 9 0 0 1 8 8"/>
    <path d="M2 16a5 5 0 0 1 4 4"/>`;

/** Plug — network connection / I/O. (Lucide: plug) */
export const iconConnection = svg`
    <path d="M12 22v-5"/>
    <path d="M15 8V2"/>
    <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/>
    <path d="M9 8V2"/>`;

/** Cable with connectors — power cord / reboot. (Lucide: cable) */
export const iconPowerCord = svg`
    <path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/>
    <path d="M17 21v-2"/>
    <path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/>
    <path d="M21 21v-2"/>
    <path d="M3 5V3"/>
    <path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/>
    <path d="M7 5V3"/>`;

/** Clock face — uptime / time. (Lucide: clock) */
export const iconClock = svg`
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6v6l4 2"/>`;

/** Terminal prompt — CLI / terminal. (Lucide: terminal) */
export const iconTerminal = svg`
    <path d="M12 19h8"/>
    <path d="m4 17 6-6-6-6"/>`;

/** Database cylinders — storage / database. (Lucide: database) */
export const iconDatabase = svg`
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
    <path d="M3 12A9 3 0 0 0 21 12"/>`;

/** Smartphone outline — mobile device. (Lucide: smartphone) */
export const iconSmartphone = svg`
    <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
    <path d="M12 18h.01"/>`;

/** Stacked layers — stack / apply all. (Lucide: layers) */
export const iconLayers = svg`
    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/>
    <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/>
    <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>`;

/** Counter-clockwise arrow — undo / reset to defaults. (Lucide: rotate-ccw) */
export const iconUndo = svg`
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>`;

/** Inward arrows — collapse / minimize. (Lucide: minimize-2) */
export const iconMinimize = svg`
    <path d="m14 10 7-7"/>
    <path d="M20 10h-6V4"/>
    <path d="m3 21 7-7"/>
    <path d="M4 14h6v6"/>`;

/** Outward arrows — expand / maximize. (Lucide: maximize-2) */
export const iconMaximize = svg`
    <path d="M15 3h6v6"/>
    <path d="m21 3-7 7"/>
    <path d="m3 21 7-7"/>
    <path d="M9 21H3v-6"/>`;

// ─── User / auth ──────────────────────────────────────────────────────────────

/** Person silhouette — standard user. (Lucide: user) */
export const iconUser = svg`
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>`;

/** Person with cog — admin user. (Lucide: user-cog) */
export const iconUserAdmin = svg`
    <path d="M10 15H6a4 4 0 0 0-4 4v2"/>
    <path d="m14.305 16.53.923-.382"/>
    <path d="m15.228 13.852-.923-.383"/>
    <path d="m16.852 12.228-.383-.923"/>
    <path d="m16.852 17.772-.383.924"/>
    <path d="m19.148 12.228.383-.923"/>
    <path d="m19.53 18.696-.382-.924"/>
    <path d="m20.772 13.852.924-.383"/>
    <path d="m20.772 16.148.924.383"/>
    <circle cx="18" cy="15" r="3"/>
    <circle cx="9" cy="7" r="4"/>`;

/** Shield shape — security / admin tab. (Lucide: shield) */
export const iconShield = svg`
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`;

/** Headphones — audio software tab. (Lucide: headphones) */
export const iconHeadphones = svg`
    <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>`;

// ─── Metrics / network ────────────────────────────────────────────────────────

/** Arrow pointing up — egress / upload metric. (Lucide: arrow-up) */
export const iconArrowUp = svg`
    <path d="m5 12 7-7 7 7"/>
    <path d="M12 19V5"/>`;

/** Arrow pointing down — ingress / download metric. (Lucide: arrow-down) */
export const iconArrowDown = svg`
    <path d="M12 5v14"/>
    <path d="m19 12-7 7-7-7"/>`;

/** Document with lines — file / read metric. (Lucide: file-text) */
export const iconFileText = svg`
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>
    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
    <path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>`;

/** Credit card — purchase / payment. (Lucide: credit-card) */
export const iconCreditCard = svg`
    <rect width="20" height="14" x="2" y="5" rx="2"/>
    <line x1="2" x2="22" y1="10" y2="10"/>`;

/** Crosshair target — reset zoom / pan to center. (Lucide: crosshair) */
export const iconCrosshair = svg`
    <circle cx="12" cy="12" r="10"/>
    <line x1="22" y1="12" x2="18" y2="12"/>
    <line x1="6"  y1="12" x2="2"  y2="12"/>
    <line x1="12" y1="6"  x2="12" y2="2"/>
    <line x1="12" y1="22" x2="12" y2="18"/>
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`;

/** Zoom in — pipeline viewport zoom-in control. (Lucide: zoom-in) */
export const iconZoomIn = svg`
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" x2="16.65" y1="21" y2="16.65"/>
    <line x1="11" x2="11" y1="8" y2="14"/>
    <line x1="8" x2="14" y1="11" y2="11"/>`;

/** Zoom out — pipeline viewport zoom-out control. (Lucide: zoom-out) */
export const iconZoomOut = svg`
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" x2="16.65" y1="21" y2="16.65"/>
    <line x1="8" x2="14" y1="11" y2="11"/>`;

/** Bar chart — statistics / components. (Lucide: bar-chart-3) */
export const iconBarChart = svg`
    <path d="M3 3v16a2 2 0 0 0 2 2h16"/>
    <path d="M7 16h6"/>
    <path d="M7 11h9"/>
    <path d="M7 6h3"/>`;

/** Open left panel — toggle the mobile vertical navigation sidebar. (Lucide: panel-left-open) */
export const iconPanelLeftOpen = svg`
    <rect width="18" height="18" x="3" y="3" rx="2"/>
    <path d="M9 3v18"/>
    <path d="m14 9 3 3-3 3"/>`;

/** Bell — notification. (Lucide: bell) */
export const iconBell = svg`
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`;

