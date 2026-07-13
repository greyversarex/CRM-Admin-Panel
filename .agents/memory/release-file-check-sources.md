---
name: Release file/QC validators read inconsistent sources
description: Three validators disagree on whether a release's cover/audio "exists" because they read different sources (assets table vs coverUrl/audioUrl); Broma16 delivery uses the URL fields, DDEX uses the assets table.
---

A release's cover and each track's audio have TWO storage references that must stay in sync:
- `assets` table rows (kind `cover`/`image`, `audio`), linked by releaseId/trackId — carries technical metadata (mime, sampleRate, bitDepth) used for spec checks.
- `release.coverUrl` / `track.audioUrl` (objectPath) — the canonical URL fields the rest of the app uses. Populated by `maybeAttach` in routes/assets.ts on `/assets/confirm` (only when confirm is called with releaseId/trackId).

**Who reads what (the trap):**
- Pre-submission readiness (`/releases/:id/issues`, release-flow.ts) → `release.coverUrl` / `track.audioUrl`. Does NOT check UPC/ISRC.
- Auto QC (distribution-extras.ts, moderator view) → the `assets` table + requires `release.upc` and `track.isrc`.
- Broma16 push (services/broma16/release-pusher.ts + files.ts) → delivers from `release.coverUrl` / `track.audioUrl` (does NOT need the assets table).
- DDEX/SFTP delivery (ddex/service.ts) → strict on the `assets` table; missing rows = null cover/audio in the package (business-validator flags invalid).

**Consequence:** a release whose files are attached only via coverUrl/audioUrl (transfer/import, or an upload path that didn't create/link asset rows) passes the pre-submit check and delivers fine to Broma16, but Auto QC falsely reports "Обложка/аудио не загружен". Fixed Auto QC to treat a populated coverUrl/audioUrl as valid presence (missing-asset-but-URL-present → downgraded to a "specs unverified" warning, not a hard error).

**UPC/ISRC are assigned by the distributor (Broma16), not by us.** They are issued at/after push and sync back into our release/track rows. So a missing UPC/ISRC before delivery is EXPECTED — Auto QC must treat missing_upc/missing_isrc as warnings (informational), never blocking errors. (Per label owner: "Брома поставит сама, потом у нас появятся".)

**Why:** the assets table and the URL fields can legitimately diverge, and the actual delivery method (Broma16) only needs the URL fields, so QC must not hard-block on asset-row absence when the URL is present.

**How to apply:** any new "is the file present?" check must accept `coverUrl`/`audioUrl` as evidence (Broma16 path), and reserve asset-row/technical-spec requirements for the DDEX path only. Keep the two references in sync at upload time when possible.
