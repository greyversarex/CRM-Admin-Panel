---
name: Broma16 dictionary shape & wizard form contract
description: How Broma16 dictionary rows are shaped, what to display vs store, and how genre/language/country flow from the release wizard to the push.
---

# Broma16 dictionary shape & wizard form contract

Broma16 dictionary API items have: `id` (numeric), `code` (meaningful short value), and human-readable names in **`title_ru` / `title_en` / `title`** (release_type/outlet use `title`; genre/language/country use `title_ru`+`title_en`). There is NO `name`/`title` field on genre/language/country — so the dictionary normalizer MUST read `title_ru`/`title_en`/`title` for the display name, else `name` silently falls back to the numeric id ("1").

**Per-type meaning of `code`:** genre code = the genre identifier Broma16 expects in `genres` (e.g. "Pop", "Trip-Hop"); country code = ISO-3166 ("RU"); language code = ISO-ish ("EN","TG").

**Release-wizard form contract (full reliance on Broma16):**
- Dropdowns load options from `GET /api/catalog/dictionary/:type` (genre/language/country). Display label = readable `name` (title_ru), stored value = Broma16 **`code`** for genre/language/country.
- Push-time resolve functions must canonicalize to what the Broma16 create-release API expects: genres → **code** strings (`resolveGenres` maps code/name/id → code); country → numeric id via `resolveCountryId` (matches code first); language → numeric id via `resolveLanguageId` (exact code/name match, then hints).
- **Why store code, not the readable name:** Broma16 wants the code (genres array) / resolves ids by code; storing the code makes push mapping exact instead of fuzzy name-matching.
- Subgenre has no Broma16 equivalent → it's an optional second genre from the same genre list (not sent at push).
- Fallback: when the dictionary is empty (integration not synced), the combobox falls back to the curated constants in `release-wizard/types.ts` so release creation is never blocked. The combobox also preserves an unknown current value (legacy releases) so old hardcoded values still display.

**Two release-create forms exist and drift:** the step wizard (`release-wizard/wizard.tsx`) and the quick-create page (`pages/releases/new.tsx`). Catalog dropdowns (genre/subgenre/language/country) must use `useCatalogOptions` in BOTH. `new.tsx` historically shipped hardcoded `GENRES`/`SUBGENRES` while the wizard already used the dictionary — if a user reports "only ~13 genres", check which form they're on before assuming the endpoint is broken.

**How to apply:** any new metadata field that maps to a Broma16 dictionary should follow this pattern — load via the catalog endpoint, store the code, resolve to id/code at push.
