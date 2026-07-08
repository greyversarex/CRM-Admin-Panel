---
name: /catalog router is admin-guarded
description: Why /catalog endpoints that non-admins legitimately need (dictionary reads, ISRC code-gen) must mount before the admin guard in api-server routes/index.ts.
---

# /catalog router is admin-guarded

In `artifacts/api-server/src/routes/index.ts`, the whole `/catalog/*` prefix is guarded by `router.use("/catalog", adminOnly, requireManagerPermission("catalog"))`. Any route added to `catalog.ts` is therefore **admin/manager-only**, even read-only ones.

**Why it matters:** release creators (label/artist) need some `/catalog/...` endpoints too — not just reads. Dictionary reads must be role-open, and the release wizard's "Generate ISRC" button calls `POST /catalog/codes/isrc`, so code generation also cannot live behind the admin guard or artists get 403. (`/catalog/codes/config` and `/catalog/codes/upc` stay admin-only — only the admin Codes page uses them.)

**How to apply:** mount role-open `/catalog/...` endpoints in their own router **before** the `/catalog` admin guard line in index.ts — reads in e.g. `catalog-dictionary.ts`, ISRC code-gen in `catalog-codes.ts`. Express matches in registration order, so the earlier route wins and the guard never runs; global `requireAuth` still applies, so it stays authenticated-only (anonymous can't consume the ISRC counter). Keep the path under `/catalog/...` so the frontend URL is unchanged. Verify with a non-admin login: dictionary read / ISRC gen → 200, a sensitive catalog route → 403.
