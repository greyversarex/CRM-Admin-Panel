---
name: Release artists endpoint scope checks
description: PUT /releases/:id/artists must scope-check every payload artistId, not just existence.
---

# Release artists (multi-primary) authorization

`PUT /releases/:id/artists` replaces the whole `release_artists` join table and
syncs `releases.artist_id` to the first primary. `loadReleaseInScope` only checks
access to the *release*, NOT the artist IDs in the request body.

**Rule:** every `artistId` in the payload must be scope-checked for non-fullAccess
callers, fetched with labelId in one `inArray` query:
- artist role: `firstPrimary.artistId === scope.artistId` (block ownership transfer);
  co-artists allowed only if they share the caller artist's labelId (independent
  artist with `labelId = null` → only themselves).
- label role: every assigned artist's labelId must equal `scope.labelId`.
- admin/manager (fullAccess): unrestricted.

**Why:** without this an artist/label user could assign foreign artist IDs or hand
the release to another artist via the first primary (the first primary becomes
`releases.artist_id`, i.e. the owner used by scope filters). This mirrors the
create-release scope convention in `releases.ts`.

**How to apply:** any endpoint that accepts artist IDs in the body and feeds them
into ownership-bearing columns must validate them against caller scope, not just
existence. Same principle as splitshare-ownership-perms (derive scope, never trust
client-supplied IDs).

## Two-step save ordering (detail page edit)
The detail page saves artists FIRST (`updateReleaseArtists`), THEN metadata
(`updateRelease`). The artists endpoint's txn both replaces the join table and
syncs `releases.artist_id`, so if it fails metadata is untouched, and if metadata
fails afterward the artists+artistId are already consistent. There is no combined
atomic endpoint — acceptable because edits are draft-only and retryable.
