---
name: Publishing works data-isolation
description: Label scoping for publishing works must be applied to every endpoint, not just the list.
---

# Publishing works label scoping

A publishing work has no `labelId` column. Its owner is derived through its
`trackId`: the work belongs to a label if `track → release.labelId` matches the
label OR `track.artistId` belongs to that label's artist roster
(`artists.labelId == scope.labelId`). Admin/manager bypass via `scope.fullAccess`.

**Rule:** this scoping must be enforced on *every* publishing-works endpoint
(list, GET-by-id, POST, PUT), using one shared helper — never on the list alone.

**Why:** the list endpoint was scoped but GET-by-id/POST/PUT were not, so a label
user could read, create, edit, or reassign works outside their roster by hitting
those routes directly. List-only scoping is a false sense of isolation.

**How to apply:**
- GET-by-id of an out-of-scope work → return 404 (do not leak existence).
- POST → the supplied `trackId` must be in scope; null trackId is forbidden for
  non-fullAccess users (fail-closed).
- PUT → check the *existing* work's track is in scope, AND if `trackId` is being
  changed, the new track must also be in scope (block cross-scope reassignment).
- Publishing routes are mounted for admin/manager/label only (not artist), so the
  helper only needs to handle the `label` role for non-fullAccess.
