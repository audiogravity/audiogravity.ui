/**
 * @module library-constants
 * @description Shared constants for Library components (source IDs, labels, icons).
 */

import { html } from 'lit';
import { iconRadio, iconHardDrive, iconMusicNote, iconWifi, iconHeadphones } from '../ag-icons.js';

export const ROON_IDS = new Set(['src_mono-sgen', 'src_roon']);

export const SOURCE_LABELS = {
    'src_mono-sgen': 'Roon',
    src_roon: 'Roon',
    src_mpd: 'MPD',
    src_qobuz: 'Qobuz',
    src_tidal: 'Tidal',
};

export const SOURCE_ICONS = {
    'src_mono-sgen': html`<span class="lib-src-logo-roon" role="img" aria-label="Roon"></span>`,
    src_roon: html`<span class="lib-src-logo-roon" role="img" aria-label="Roon"></span>`,
    src_mpd: 'MPD',
    src_qobuz: html`<img src="./pics/qobuz.webp" alt="Qobuz" width="24" height="24" style="object-fit:contain">`,
    src_tidal: html`<span class="lib-src-logo-tidal" role="img" aria-label="Tidal"></span>`,
    default: '♪',
};

/* ─── Stream origin / provider (Now Playing badge) ───
 * The backend now-playing payload tags each item with an `origin` kind
 * (independent of transport, since Tidal/Qobuz/UPnP/local all flow over MPD).
 * These map that kind to a human label + a 24×24 icon for <ag-source-badge>. */

/** Wrap an ag-icons glyph (a Lit `svg` fragment) into a renderable 24×24 svg. */
const originSvg = (glyph, label) => html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
         role="img" aria-label=${label}>${glyph}</svg>`;

export const ORIGIN_LABELS = {
    tidal: 'Tidal',
    qobuz: 'Qobuz',
    roon: 'Roon',
    radio: 'Radio',
    upnp: 'UPnP',
    library: 'Library',
    airplay: 'AirPlay',
    spotify: 'Spotify',
    hqplayer: 'HQPlayer',
    mpris: 'Stream',
};

export const ORIGIN_ICONS = {
    tidal: SOURCE_ICONS.src_tidal,
    qobuz: SOURCE_ICONS.src_qobuz,
    roon: SOURCE_ICONS.src_roon,
    radio: originSvg(iconRadio, 'Radio'),
    upnp: originSvg(iconHardDrive, 'UPnP'),
    library: originSvg(iconMusicNote, 'Library'),
    airplay: originSvg(iconWifi, 'AirPlay'),
    spotify: originSvg(iconMusicNote, 'Spotify'),
    hqplayer: originSvg(iconHeadphones, 'HQPlayer'),
    mpris: originSvg(iconMusicNote, 'Stream'),
};

/**
 * Resolve the display badge for a now-playing origin.
 * @param {string|null|undefined} origin - origin kind from the now-playing payload
 * @param {string|null} [name] - specific provider name (e.g. UPnP server) overriding the label
 * @returns {{icon: import('lit').TemplateResult|string, label: string}|null} null when unknown
 */
export function originBadge(origin, name) {
    if (!origin) return null;
    const icon = ORIGIN_ICONS[origin] ?? ORIGIN_ICONS.library;
    const label = name || ORIGIN_LABELS[origin] || origin;
    return { icon, label };
}

/* ─── Searchable library sources ─── */

/** Maps known source IDs to a display label and a deduplication group
 *  (e.g. src_roon + src_mono-sgen collapse to a single "Roon"). */
export const SOURCE_META = {
    'src_mono-sgen': { label: 'Roon',  group: 'roon'  },
    src_roon:        { label: 'Roon',  group: 'roon'  },
    src_mpd:         { label: 'MPD',   group: 'mpd'   },
    src_qobuz:       { label: 'Qobuz', group: 'qobuz' },
    src_tidal:       { label: 'Tidal', group: 'tidal' },
};

/**
 * Build the deduplicated list of searchable library sources for the search bar.
 * Combines playback-pipeline sources with known UPnP/DLNA media servers (which
 * are not part of the pipeline). mpris receivers (AirPlay, Spotify, the upmpdcli
 * bridge) are dropped — they expose no library API.
 *
 * @param {Array<{source_id:string, name?:string, protocol?:string}>} rawSources - pipeline sources
 * @param {Array<{id:string, friendly_name?:string, location?:string}>} [upnpServers] - known UPnP servers
 * @returns {Array<{id:string, label:string, group:string, location:string}>}
 */
export function normalizeSearchSources(rawSources, upnpServers = []) {
    const seen = new Set();
    const sources = (rawSources ?? []).reduce((acc, s) => {
        if (s.protocol === 'mpris') return acc;
        const meta = SOURCE_META[s.source_id] ?? { label: s.name ?? s.source_id, group: s.source_id };
        if (seen.has(meta.group)) return acc;
        seen.add(meta.group);
        acc.push({ id: s.source_id, label: meta.label, group: meta.group, location: '' });
        return acc;
    }, []);
    for (const srv of upnpServers ?? []) {
        if (seen.has(srv.id)) continue;
        seen.add(srv.id);
        sources.push({ id: srv.id, label: srv.friendly_name || 'UPnP', group: srv.id, location: srv.location || '' });
    }
    return sources;
}

/* ─── Radio — curated dropdowns ─── */

/** ISO 3166-1 alpha-2 codes for the country picker in the Radio search. */
export const RADIO_COUNTRIES = [
    { code: '', label: 'All countries' },
    { code: 'FR', label: 'France' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'US', label: 'United States' },
    { code: 'DE', label: 'Germany' },
    { code: 'IT', label: 'Italy' },
    { code: 'ES', label: 'Spain' },
    { code: 'NL', label: 'Netherlands' },
    { code: 'BE', label: 'Belgium' },
    { code: 'CH', label: 'Switzerland' },
    { code: 'CA', label: 'Canada' },
    { code: 'AU', label: 'Australia' },
    { code: 'JP', label: 'Japan' },
    { code: 'BR', label: 'Brazil' },
    { code: 'SE', label: 'Sweden' },
    { code: 'NO', label: 'Norway' },
    { code: 'DK', label: 'Denmark' },
    { code: 'FI', label: 'Finland' },
    { code: 'PL', label: 'Poland' },
    { code: 'IE', label: 'Ireland' },
];

/** Genre tags accepted by the Radio Browser API ``tag`` filter. */
export const RADIO_GENRES = [
    { tag: '', label: 'All genres' },
    { tag: 'classical', label: 'Classical' },
    { tag: 'jazz', label: 'Jazz' },
    { tag: 'rock', label: 'Rock' },
    { tag: 'pop', label: 'Pop' },
    { tag: 'electronic', label: 'Electronic' },
    { tag: 'ambient', label: 'Ambient' },
    { tag: 'blues', label: 'Blues' },
    { tag: 'folk', label: 'Folk' },
    { tag: 'world', label: 'World' },
    { tag: 'news', label: 'News' },
    { tag: 'talk', label: 'Talk' },
    { tag: 'oldies', label: 'Oldies' },
    { tag: 'reggae', label: 'Reggae' },
    { tag: 'soul', label: 'Soul' },
    { tag: 'hip hop', label: 'Hip-hop' },
    { tag: 'metal', label: 'Metal' },
    { tag: 'country', label: 'Country' },
    { tag: 'house', label: 'House' },
];
