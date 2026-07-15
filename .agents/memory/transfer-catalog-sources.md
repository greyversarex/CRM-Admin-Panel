---
name: Transfer Track catalog data sources
description: Which external source gives which metadata for catalog transfer/import, and Deezer specifics
---

# Transfer Track — multi-source catalog metadata

**No single service returns everything.** Metadata lives in layers, each with a
different authoritative source. Combine per data type; never assume one API has it all:

- **Recording/track data** (title, ISRC, duration, performers, explicit) → DSP catalogs: Spotify, **Deezer**, Apple.
- **Release data** (UPC/barcode, cover, label, date, tracklist order) → DSP catalogs OR the distributor (Broma16).
- **Composition/publishing** (composers, lyricists, publishers) → **NOT exposed by Spotify/Deezer public APIs.** Use MusicBrainz work relationships (incomplete coverage) or Broma16 composition path, or manual entry.
- **Canonical UPC/ISRC for a NEW release** → issued by Broma16 at distribution time. For a *transfer*, keep the original codes from the source.

**Why:** the client asked "can composers come only from MusicBrainz and UPC from Broma?" — yes, that instinct is correct and matches how the code already blends sources.

## Deezer source (import-by-UPC)
`POST /releases/import-upc` accepts `source: spotify|deezer|musicbrainz|apple` (apple degrades to MusicBrainz). Deezer is the best default: **free, keyless, no Premium**, unaffected by Spotify's owner-Premium block.

- Lookup: `GET https://api.deezer.com/album/upc:<upc>` — returns **HTTP 200 with `{error:{...}}`** when not found (guard on `alb.error || !alb.id`, don't trust status alone), then fall back to MusicBrainz.
- Tracks: `GET /album/{id}/tracks?limit=100` returns **`isrc` inline** — no per-track N+1. Paginate via `next`, but only follow URLs starting `https://api.deezer.com/` (SSRF guard).
- **Deezer free-text search (`/search?q=`) returns empty from server IPs** (geo/IP restriction) — do NOT build the transfer around name search; use UPC/ISRC/link lookups, which work fine.
- Fields: album has `upc,label,release_date,cover_xl,artist.name,nb_tracks`; cover up to 1000x1000 via `cover_xl`.

## Spotify block (context)
Spotify Web API is blocked for apps whose **owner account lacks Premium** — every catalog endpoint (`/search`, `/artists`, `/albums`) returns 403 "Active premium subscription required for the owner of the app", even though token issuance succeeds. Confirmed empirically; unchecking "Web Playback SDK" in the dashboard does NOT lift it. This is why Deezer was added as a free alternative.
