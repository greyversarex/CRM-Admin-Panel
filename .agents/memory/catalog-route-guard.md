---
name: /catalog router is admin-guarded
description: Why public read endpoints under /catalog must mount before the admin guard in api-server routes/index.ts.
---

# /catalog router is admin-guarded

In `artifacts/api-server/src/routes/index.ts`, the whole `/catalog/*` prefix is guarded by `router.use("/catalog", adminOnly, requireManagerPermission("catalog"))`. Any route added to `catalog.ts` is therefore **admin/manager-only**, even read-only ones.

**Why it matters:** release-wizard dictionary reads must be available to label/artist roles too (they create releases). Putting a read endpoint inside `catalogRouter` blocks them with 403.

**How to apply:** mount role-open `/catalog/...` read endpoints in their own router (e.g. `catalog-dictionary.ts`) **before** the `/catalog` admin guard line in index.ts (Express matches in registration order, so the earlier route wins and the guard never runs). Keep the path under `/catalog/...` so the frontend URL is unchanged. Verify with a non-admin login: dictionary read → 200, a sensitive catalog route → 403.
