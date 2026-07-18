---
name: Label cross-imprint release scope
description: Labels may assign any labelId (imprint) to a release; visibility uses OR-semantics via shared helper
---

Rule: a label-role user may set ANY `labelId` on release create/edit (release under another imprint). Their access to that release is preserved because scope uses OR-semantics: `release.labelId === own` OR `release.artist.labelId === own`.

**Why:** locking labelId to the caller's own label blocked a real business flow; but simply relaxing the create check made cross-imprint releases invisible/immutable to their creator (list, counts, tracks, splits, reorder, issues all gated on release.labelId equality).

**How to apply:** all release visibility checks must go through `artifacts/api-server/src/lib/release-scope.ts` (`releaseInScope`, `labelReleaseScopeCondition` for list queries) — never inline `release.labelId === scope.labelId` for label role. Artist assignment is still restricted: label users can only attach artists belonging to their own label (that's what anchors ownership). GET /labels is open to all roles (dropdown needs the full list).
