---
name: Transfer Track import (Spotify → Broma16)
description: How catalog transfer imports tracks/ISRC/UPC and the isTransferRelease flag
---

# Transfer Track import quirks

**Spotify simplified track objects carry NO ISRC.** `/v1/albums/{id}/tracks` returns
simplified tracks (id/name/track_number only). To preserve original ISRC you MUST
batch-fetch full track objects via `/v1/tracks?ids=` (chunks of 50) and read
`external_ids.isrc`. The album-detail endpoint's `tracks.items` are also simplified —
do not assume `external_ids` is present there.

**Synthetic UPC.** The transfer search endpoint fabricates `SPOTIFY-<albumId>` when
Spotify returns no real barcode. Never persist that as a real UPC — only store the
barcode when it does NOT start with `SPOTIFY-`. The synthetic value is still useful:
`resolveSpotifyAlbumId` extracts the album id from it (else searches by real UPC).

**Album track pagination.** Albums can exceed 50 tracks; the tracks endpoint is paged
via `next` URL. Loop until `next` is null, then chunk the ISRC lookups by 50.

**Fail-open.** Spotify being unconfigured/unavailable must NEVER break the import —
best-effort fetch into a map before the per-item tx; on any failure fall back to
placeholder tracks (count-based generic titles). Import correctness does not depend
on Spotify.

## isTransferRelease flag
`releases.isTransfer` (boolean) is set true on transfer-imported releases. In the
Broma16 release push (step 2 releaseBody) it maps to the documented Broma16 boolean
`isTransferRelease=true`. **Why:** Broma16 needs to know a release is a catalog
transfer (not a fresh release) to handle it correctly on their side.
