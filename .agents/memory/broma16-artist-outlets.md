---
name: Broma16 artist outlets (dynamic list)
description: How artist→Broma16 outlet IDs are stored, migrated, and sent; pitfalls when editing this path.
---

# Broma16 artist outlets

Artist "ID на площадках" is a **dynamic list**, not the old fixed spotifyId/appleId pair.

- Stored in `artists.broma16_outlets` (jsonb) as `Broma16OutletRef[] {outletId:number, outletName:string, idOutletUser:string}`. Legacy `spotify_id`/`apple_id` columns are **kept** (non-destructive backup); do not drop them.
- Dropdown options come from `GET /api/artists/meta/outlets` (requireRole admin/manager/label) → `getDictionary("outlet")`. The frontend uses a **raw `fetch`**, not the generated orval client, so this endpoint is intentionally **not in openapi.yaml**.
- `getDictionary("outlet")` returns already-normalized `{externalId, code, name}` — there is **no** titleRu/titleEn/title on the returned rows (those exist only in the raw Broma16 payload inside `normalizeItem`). Use `.name`.
- Outlet dictionary rows have an **empty `code`**; the numeric Broma16 outlet id lives in `externalId` (e.g. Spotify "6140", Apple "49803"). Select value = externalId string; store `outletId` as number.

**Why (server-side hardening):** `buildArtistOutlets` in `services/broma16/artists.ts` re-validates every `outletId` against `getDictionary("outlet")`, drops unknown/duplicate ids, and derives `outlet` (name) from the dictionary — it does **not** trust the client-sent `outletName`. Keep it async; both `createArtist` and `pushArtistOutlets` await it.

**Dev migrator is broken (pre-existing, not this feature's bug):** the dev DB was created via `drizzle-kit push`, so `__drizzle_migrations` is untracked and the migrator replays the journal from scratch and dies on old non-idempotent `0011` (`deliveries ADD COLUMN attempts`). Apply new migrations to **dev** directly via SQL. New migration files must still be idempotent (`ADD COLUMN IF NOT EXISTS`, backfill only `WHERE ... IS NULL`) — prod's migrator history is tracked and applies them cleanly.
