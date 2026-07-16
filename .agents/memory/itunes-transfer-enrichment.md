---
name: iTunes Search API enrichment in Transfer Track
description: How iTunes Search API is integrated into the UPC import flow for pLine/cLine/cover enrichment, and the metadata_cache table design.
---

# iTunes Search API + metadata_cache в Transfer Track

## Правило
Любой UPC-импорт обогащается iTunes Search API (бесплатно, без ключей) для получения `pLine`/`cLine` (copyright) и обложки 600px. Результат кэшируется 30 дней в `metadata_cache`.

**Why:** Spotify/Deezer/MusicBrainz не возвращают copyright. iTunes даёт `copyright` → парсим на pLine/cLine. Apple Music API (MusicKit) — не использовать (платный Developer Program, JWT-ротация, не стоит выгоды).

## Как применять
- Сервис: `artifacts/api-server/src/services/itunes.ts`
  - `itunesLookupByUpc(upc)` — никогда не бросает, возвращает `{ kind: "found"|"not_found"|"error" }`
  - `itunesHighResCover(artworkUrl100)` — заменяет `NxNbb.` на `600x600bb.`
  - `parseItunesCopyright(copyright)` — возвращает `{ pLine, cLine }`
- Таблица: `metadata_cache` (миграция 0026)
  - PK: `upc`; TTL проверяется на прикладном уровне (`METADATA_CACHE_TTL_MS = 30 days`)
  - `raw_itunes` / `raw_source` — полные ответы для будущего переиспользования без повторных запросов
  - Запись неблокирующая (`writeMetadataCache` — void, ошибки логируются но не бросаются)
- Flow в `POST /releases/import-upc`:
  1. Проверка кэша → при свежем хите пропускаем внешние API
  2. `itunesLookupByUpc` запускается параллельно с первичным источником
  3. Обогащение: iTunes → pLine/cLine, cover (если нет у источника), genre (если нет)
  4. Upsert в кэш (`onConflictDoUpdate`)
  5. Транзакция: `pLine`/`cLine` сохраняются в `releases` (поля уже есть в схеме)

## Важные детали
- `ImportedReleaseData` добавлены поля: `pLine`, `cLine`, `_ids`, `_rawSource`, `_rawItunes` (внутренние, не идут в OpenAPI)
- iTunes НЕ возвращает composer/writer — это ошибочное убеждение. Writer → MusicBrainz Works API (отдельная задача)
- iTunes возвращает единое поле `copyright` (℗ и © вместе); `parseItunesCopyright` ставит его и в pLine, и в cLine
- При `drizzle-kit generate` в этом проекте появляются интерактивные вопросы про уже существующие изменения схемы — использовать `psql` для CREATE TABLE + ручная запись в journal
