---
name: Hand-crafted test release for ACRCloud/Broma16
description: How to build a complete, distribution-ready release with REAL fingerprint-matchable audio for testing ACRCloud dedup + Broma16 push.
---

# Building a test release that ACRCloud will actually match

**Real audio source:** iTunes Search API preview clips (`https://itunes.apple.com/search?term=...&entity=song`)
return ~30s MP3/M4A of the genuine commercial recording. ACRCloud fingerprint-matches these against
its DB, so a famous track (e.g. "Billie Jean") is a reliable positive. Public preview endpoint, no auth.
**Why:** you cannot ship pirated full tracks; a 30s real clip is enough for ACRCloud dedup and for
exercising the Broma16 push flow.

**How to apply:**
- Convert to lossless stereo WAV: `ffmpeg -i in.m4a -ac 2 -ar 44100 -sample_fmt s16 -f wav out`.
  Stereo audioProfile validation requires WAV/FLAC, ≥44100Hz, 16/24-bit, exactly 2 channels.
- Storage: files live at `$LOCAL_STORAGE_ROOT/private/uploads/<uuid>` (root = /home/runner/workspace/.data/uploads).
  DB `assets.storage_key='private/uploads/<uuid>'`, `object_path='/objects/uploads/<uuid>'`; link via
  `tracks.audio_url` / `releases.cover_url` = the object_path. Store real sha256/size_bytes/ffprobe specs.
- Completeness gate: `GET /releases/:id/issues` returns `{ok,issues}`; needs title, cover_url, genre,
  release_date (>7d future), language, p_line+p_line_year, c_line+c_line_year, cover_ai_usage,
  ≥1 track (title/audio/displayArtists/writers summing 100), ≥1 release_dsps row, ≥1 territory,
  ≥1 release_artists. splits absence is only a warning.
- Distribution preconditions: status must be exactly `approved` for both the "Отправить в ACRCloud"
  button (also visible for processing/published) and `POST /broma16/releases/:id/push`.
  ACR drop also needs UPC + cover asset + audio on every track; PartyIds have hardcoded defaults.
- Broma16 outlets: `releases.broma16_distribution_outlets` accepts outlet external_id/name/code
  (resolveOutletCodes normalizes any of them); dictionary `code` is empty, use external_id
  (Spotify 6140, Apple 49803, YouTube 21859, Deezer 22025, Amazon 6157).
