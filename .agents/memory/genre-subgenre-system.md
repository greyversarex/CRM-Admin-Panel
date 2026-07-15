---
name: Genre/subgenre system + import enrichment
description: How CRM genres/subgenres are defined, the Broma16 safety net, and how UPC import fills fields.
---

# Genre / subgenre system

- The genre + subgenre lists are a **hardcoded frontend constant**: `GENRES`, `SUBGENRES` (Record<genre, subgenres[]>), `GENRE_OPTIONS`, `SUBGENRE_OPTIONS` in `artifacts/crm-panel/src/components/release-wizard/types.ts`. Stored on `releases.genre/subgenre` and `tracks.genre/subgenre` as **free-text** (nullable), not FKs.
- The wizard subgenre selector filters by selected genre via `SUBGENRES[genre]` (track-card.tsx / tracks/edit.tsx). So `SUBGENRES` keys **must be exactly the 68 GENRES**. A recurring bug: the SUBGENRES keys drifted to a mix of genre+subgenre names (e.g. "Baseline","Country Pop" as keys) while real genres had empty arrays — that means the source spreadsheet was parsed wrong.

## The recurring "wrong genres / subgenre won't filter" bug
- Symptom: the Жанр dropdown lists SUBgenres ("2-Step Garage", "Acid House"…) and the Поджанры box never changes when you pick a genre.
- **Root cause is the UI wiring, NOT the SUBGENRES data:** the selectors were fed by `useCatalogOptions("genre")` (the flat Broma16 catalog dictionary — hundreds of genres+subgenres mixed, alphabetical), so fixing the SUBGENRES map alone changes nothing visible.
- **Fix:** genre/subgenre selectors must use the document hierarchy via helpers in types.ts — `genreOptionsWith(current)` (68 GENRES, prepends an out-of-list saved value so it doesn't vanish) and `subgenreOptionsFor(genre, current)` (ONLY `SUBGENRES[genre]`). On genre change, reset an incompatible subgenre (functional setState). Applied in wizard.tsx, track-card.tsx, releases/new.tsx, releases/[id].tsx, releases/tracks/edit.tsx, releases/multi-track-edit-category.tsx. `useCatalogOptions` stays for language/country only.
- **Why not the Broma16 catalog:** delivery re-resolves free-text genre to a Broma16 code (`resolveGenres`, World fallback), so the UI doesn't need catalog codes.

## Broma16 safety net
- On delivery, genre is resolved to a Broma16 code by `resolveGenres` in `artifacts/api-server/src/services/broma16/dictionaries.ts` (direct match → REGIONAL_GENRE_HINTS → **"World" fallback**). **Why it matters:** you can freely change the CRM genre list without breaking delivery — unknown genres fall back to World, they don't crash the push.

## Parsing the client genre spreadsheet (Tajik_Music_Genres_Subgenres...xlsx)
- "Genres" sheet: flat numbered list (`N. Name`), 68 primary genres.
- "Sub Genres" sheet: a **wide matrix of horizontal bands**; each band's first row is 9 genre headers, subgenre rows beneath each column. **Traps:** bands are NOT cleanly separated by empty rows, and the row right after a header can look like a header too (Pop/Rock/House/Techno/Trance all match). Reliable detection: a row is a header iff it contains **≥6 cells matching the 68 primary-genre names**; keep `cur` header until the next header; merge subgenres per genre across bands (Dance/Electronic repeat). Header "Afrobeat / Afrobeats" maps to both. Drop self-references and non-primary headers ("Cinematic").

## UPC import field enrichment (POST /releases/import-upc, releases.ts)
- Import now fills genre (via `mapSourceGenre` + `GENRE_ALIASES`, canonicalized by stripping non-alphanumerics so "R&B"/"Rap/Hip Hop"/"Electro" match), release type (record_type/album_type via `normalizeReleaseType`), release-level `isExplicit`, and per-track `isExplicit`+`explicitStatus` ("explicit"/"non_explicit") + genre. Sources: Deezer `genres.data[].name` / `record_type` / track `explicit_lyrics`; Spotify `genres` / `album_type` / track `explicit`; MusicBrainz has none (genre/type null).
- **Drift risk:** `CRM_GENRES` is **duplicated** in releases.ts (must mirror `GENRES` in types.ts). Imported genre must be a value from that list or the wizard Select renders blank; unknown source genres → null (not fabricated). Subgenre is NOT importable (Deezer/Spotify give no true subgenres) — left manual.
