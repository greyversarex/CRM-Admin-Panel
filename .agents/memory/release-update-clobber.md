---
name: PUT /releases/:id clobbers zod-defaulted fields
description: Partial release updates silently reset boolean flags unless all defaulted fields are sent
---

# PUT /releases/:id clobbers fields with zod `.default()`

The handler does `db.update(releasesTable).set(parsed.data)` where `parsed.data`
is `UpdateReleaseBody.parse(req.body)`. `UpdateReleaseBody` declares `.default()`
on several fields (`isExplicit`, `isCompilation`, `isVariousArtists`,
`territories`, `upcRequestPending`). Zod fills absent fields with their defaults,
so they end up in `parsed.data` and get written — resetting flags the caller
never intended to touch.

**Why:** A territory-only or metadata-only update that omits e.g. `isCompilation`
will reset it to `false`. The legacy edit dialog has this latent bug too.

**How to apply:** Any client building an `UpdateReleaseBody` for a partial change
must read the current release and re-send ALL defaulted fields
(`isExplicit`, `isCompilation`, `isVariousArtists`, `upcRequestPending`,
`territories`), not just the one being changed. Treat empty `territories: []` as
"none selected", not world-wide — only an explicit `"WW"` entry means world-wide.
