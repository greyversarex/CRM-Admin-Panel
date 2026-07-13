---
name: Audio/cover "pool" assets resolved by objectPath, not only track_id/release_id
description: The stereo-upload pages store audio/cover as release-level pool asset rows with track_id=null; tracks/releases link to them only via track.audioUrl / release.coverUrl. Every delivery/QC validator must fall back to objectPath lookup or it reports "нет аудио"/"обложка не загружена" for correctly-attached files.
---

**Two upload paths, two linkage models.**
- Wizard inline upload (track-card.tsx) uploads with `{ trackId, attach:true }` → asset row has `track_id` set; the classic `assets.track_id = track.id` lookup finds it.
- Dedicated "Upload Stereo Audio" pages (`/releases/:id/audio-upload`, `/releases/:id/tracks/:tid/audio-upload`) upload with `{ releaseId, attach:false }` (NO trackId) → asset row lands in a release-level **pool** with `track_id = NULL`. The user then picks a file per track via a dropdown on the track edit page, which sets ONLY `track.audioUrl = asset.objectPath` (never back-fills `asset.track_id`). Cover behaves the same via `release.coverUrl`.

**The trap:** delivery + QC validators resolved a track's audio strictly by `assets.track_id = track.id` and cover by `assets.release_id`. So a pooled file that the UI correctly linked via the URL field was invisible → false "нет аудио" / "не загружена обложка" / ACRCloud "релиз не готов к отправке" even though the file exists and Broma16 (which reads the URL fields) would deliver it fine.

**Fix / rule:** the canonical "which file belongs to this track/release" link is `track.audioUrl` / `release.coverUrl` (= asset.objectPath). Every reader that maps track→audio or release→cover must do id-scoped lookup FIRST, then fall back to `assets WHERE object_path = <url> AND kind = ...`. Places that needed it: `ddex/service.ts buildReleaseContext` (ACR drop + DDEX build), `routes/distribution-extras.ts` (Auto QC details + `/distribution/moderation` list `withAudio` stat), `routes/releases-extras.ts` (readiness `/issues`/validate). Any NEW validator or delivery path must apply the same fallback.

**Why:** the pool→dropdown workflow deliberately leaves `asset.track_id` null and expresses the link only through the URL field; ignoring the URL field makes real, deliverable files look missing.

**Notes:**
- objectPath is a server-generated unique UUID path, so the fallback lookup is safe cross-tenant in practice; adding release/artist scope predicates is optional hardening (pool audio rows carry release_id, pool cover too).
- A genuinely external `audioUrl`/`coverUrl` with NO asset row anywhere (pure transfer import) still fails DDEX/readiness (can't deliver a file you don't hold) — that divergence from Auto QC (which warns) is intentional.
- Alternative durable fix (not done): back-fill `asset.track_id` when the dropdown assigns audio; would let the classic lookup work and needs a one-time backfill of existing pooled rows.
