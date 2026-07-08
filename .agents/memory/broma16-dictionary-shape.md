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
- **Custom taxonomy always merged with dict:** the label also carries a large curated custom genre/subgenre taxonomy (`GENRE_OPTIONS`/`SUBGENRE_OPTIONS` in `release-wizard/types.ts`). `useCatalogOptions` takes `extra?: Option[]` and merges it into BOTH the Broma16 and fallback lists via `mergeOptions` (dedup by normalized lowercase/trim label, **base/Broma16 wins on collision** so its code is stored). Genre pickers pass `extra: GENRE_OPTIONS`; subgenre pickers pass `extra: [...GENRE_OPTIONS, ...SUBGENRE_OPTIONS]` → subgenre is a flat searchable list of genres+subgenres, NOT filtered by selected genre (so DON'T reset subgenre on genre change; the old per-genre `SUBGENRES[genre]` map + reset effects were removed). **Why safe:** `resolveGenres` maps any custom genre string → valid code (direct/regional-hint/`World`), and subgenre is never pushed, so custom values never break Broma16.
- Fallback: when the dictionary is empty (integration not synced), the combobox falls back to the curated constants in `release-wizard/types.ts` so release creation is never blocked. The combobox also preserves an unknown current value (legacy releases) so old hardcoded values still display.

**Many release-create/edit surfaces exist and drift:** catalog dropdowns (genre/subgenre/language/country) must use `useCatalogOptions` + the searchable `release-wizard/dictionary-combobox.tsx` (Popover+Command, scrollable) — NOT a plain shadcn `Select` — in ALL of them: `wizard.tsx`, `track-card.tsx`, `pages/releases/new.tsx`, `pages/releases/[id].tsx` (EditDetailsForm + MultiEditTracksDialog), `pages/releases/tracks/edit.tsx`, `pages/releases/multi-track-edit-category.tsx`. A plain `Select` for ~280 dictionary rows has no search and scrolls badly — that's the recurring user complaint. If a user reports "only ~13 genres" or "can't scroll/search", check which form they're on before assuming the endpoint is broken.

**Clear/"— не менять" semantics when swapping Select→combobox:** a combobox has no built-in way to return to empty once a value is picked. For genuinely optional fields that were clearable before (tracks/edit.tsx metadata-language/genre/subgenre/country) and bulk "don't change" fields ([id].tsx MultiEditTracksDialog), prepend an explicit empty option `{ value: "", label: "— Not specified" | "— не менять" }` to `options` so the clear path survives. Fields that never had a clear option (new.tsx, EditDetailsForm, vocalLanguage) must NOT gain one — match the original. Also keep curated fallbacks aligned (e.g. don't drop Turkish) when replacing an inline hardcoded list with a shared constant.

**How to apply:** any new metadata field that maps to a Broma16 dictionary should follow this pattern — load via the catalog endpoint, store the code, resolve to id/code at push.
