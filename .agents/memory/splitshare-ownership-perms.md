---
name: SplitShare ownership permissions
description: Who may mutate/read splits and the integrity invariants that keep it safe.
---

Splits (`/splits`) are mutable by admin/manager (any release) OR the release owner
(label → release.labelId === scope.labelId, artist → release.artistId === scope.artistId).
The single source of truth for this is `canMutateReleaseSplits(scope, releaseId)` — reuse
it for POST/PUT/DELETE *and* for the GET /splits/:id read scope check.

**Why:** Owners must set up SplitShare themselves (Symphonic model), but a label/artist
must never touch another owner's release. Earlier admin/manager-only gating blocked owners.

**How to apply (non-negotiable invariants):**
- A split carries `releaseId` and/or `trackId`. When `trackId` is set, the release is
  derived from the track (source of truth) and any supplied `releaseId` must match —
  otherwise it's an attempt to bind someone else's track to your release. Enforce via
  `resolveSplitTargetRelease()`.
- PUT must check ownership of BOTH the existing split's release AND the effective new
  target release, or a scoped user can "move" a split onto a release they don't own.
- Do NOT write read/ownership checks as `!scope.artistId || release.artistId === scope.artistId`.
  That `!scope.artistId` short-circuit grants access to null-bound roles (IDOR). Use
  `canMutateReleaseSplits` which requires the binding to be truthy AND match.
- Accept/reject (`/splits/:id/accept|reject`) is separate: participant-bound by
  entityType+entityId, only artist/label roles. Leave it alone.

**Status lock (separate from ownership):** ownership (`canMutateReleaseSplits`) is
NOT enough — owners must also be blocked from changing splits once the release
leaves draft/rejected (pending_review, approved, live, delivering…), exactly like
tracks/metadata. Enforce a second gate via `releaseSplitLockReason` (fullAccess
bypass; null when releaseId null; else `releaseEditableReason(scope, status)` →
409) on POST/PUT/DELETE. PUT must lock BOTH existing and target release. This is
the same lock tracks use (`releaseLockReasonForTrack`/`releaseEditableReason`),
which is the source of truth for "is this release editable by an owner".
**Why:** hidden UI (SplitShare Edit button gated on `release.isEditable`) is only
honest if the API rejects the same mutation — owner could otherwise open
`/releases/:id/splitshare` directly and edit a release under moderation.
