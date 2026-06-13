---
name: Generated client params may be ignored server-side
description: orval ListXParams can include query params the Express route never implements, silently returning wrong/incomplete data.
---

The orval-generated client types (`ListTracksParams`, etc. in `lib/api-client-react/src/generated/api.schemas.ts`) expose query params like `release_id`, `artist_id`, `page`, `limit`. The frontend compiles and *sends* them, but the corresponding Express route may not actually read/apply every one — the param is silently dropped and you get a scope-only, paginated (default limit 20) result.

**Why:** This bit the track-edit "one file = one track" dedup: the page passed `{ release_id }` to `useListTracks` to get sibling tracks, but `GET /api/tracks` ignored `release_id` and returned ≤20 global (scope-filtered) tracks — so dedup missed siblings and `nextTrack` navigation was unreliable.

**How to apply:** Before relying on a list filter for *correctness* (dedup, uniqueness, prev/next navigation), confirm the server route actually reads that query param. When adding a server filter, combine it with the existing role-scope condition via `and(...conditions)` — never replace scope — so non-fullAccess users can't read another scope's rows by passing an id. Also pass an explicit high `limit` from the client when you need the full set, since the default is 20.
