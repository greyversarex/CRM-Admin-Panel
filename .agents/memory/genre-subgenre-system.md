---
name: Genre/subgenre system + import enrichment
description: How CRM genres/subgenres are defined, the Broma16 safety net, and how UPC import fills fields.
---

# Genre / subgenre system

- The genre + subgenre lists are a **hardcoded frontend constant**: `GENRES`, `SUBGENRES` (Record<genre, subgenres[]>), `GENRE_OPTIONS`, `SUBGENRE_OPTIONS` in `artifacts/crm-panel/src/components/release-wizard/types.ts`. Stored on `releases.genre/subgenre` and `tracks.genre/subgenre` as **free-text** (nullable), not FKs.
- The wizard subgenre selector filters by selected genre via `SUBGENRES[genre]` (track-card.tsx / tracks/edit.tsx). So `SUBGENRES` keys **must be exactly the 68 GENRES**. A recurring bug: the SUBGENRES keys drifted to a mix of genre+subgenre names (e.g. "Baseline","Country Pop" as keys) while real genres had empty arrays — that means the source spreadsheet was parsed wrong.

## Broma16 safety net
- On delivery, genre is resolved to a Broma16 code by `resolveGenres` in `artifacts/api-server/src/services/broma16/dictionaries.ts` (direct match → REGIONAL_GENRE_HINTS → **"World" fallback**). **Why it matters:** you can freely change the CRM genre list without breaking delivery — unknown genres fall back to World, they don't crash the push.

## Parsing the client genre spreadsheet (Tajik_Music_Genres_Subgenres...xlsx)
- "Genres" sheet: flat numbered list (`N. Name`), 68 primary genres.
- "Sub Genres" sheet: a **wide matrix of horizontal bands**; each band's first row is 9 genre headers, subgenre rows beneath each column. **Traps:** bands are NOT cleanly separated by empty rows, and the row right after a header can look like a header too (Pop/Rock/House/Techno/Trance all match). Reliable detection: a row is a header iff it contains **≥6 cells matching the 68 primary-genre names**; keep `cur` header until the next header; merge subgenres per genre across bands (Dance/Electronic repeat). Header "Afrobeat / Afrobeats" maps to both. Drop self-references and non-primary headers ("Cinematic").

## UPC import field enrichment (POST /releases/import-upc, releases.ts)
- Import now fills genre (via `mapSourceGenre` + `GENRE_ALIASES`, canonicalized by stripping non-alphanumerics so "R&B"/"Rap/Hip Hop"/"Electro" match), release type (record_type/album_type via `normalizeReleaseType`), release-level `isExplicit`, and per-track `isExplicit`+`explicitStatus` ("explicit"/"non_explicit") + genre. Sources: Deezer `genres.data[].name` / `record_type` / track `explicit_lyrics`; Spotify `genres` / `album_type` / track `explicit`; MusicBrainz has none (genre/type null).
- **Drift risk:** `CRM_GENRES` is **duplicated** in releases.ts (must mirror `GENRES` in types.ts). Imported genre must be a value from that list or the wizard Select renders blank; unknown source genres → null (not fabricated). Subgenre is NOT importable (Deezer/Spotify give no true subgenres) — left manual.
