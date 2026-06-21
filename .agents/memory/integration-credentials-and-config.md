---
name: Integration credentials vs config
description: How integration credentials/config are split (and not), plus the code-default partner-config pattern.
---

# Integration credentials vs config

## saveCredentials encrypts EVERY submitted field
`services/integrations-service.ts#saveCredentials(code, fields)` AES-encrypts **all** entries of `fields` into `integration_credentials` — there is NO config/credential classification. The frontend `/integrations/:code/credentials` body `{fields}` therefore must contain **only secret values**.

**Why:** non-secret config (bucket/region/prefix, party ids) would otherwise be stored encrypted as a "credential" and never reach `integration.config`.

**How to apply:** when adding a `ServiceDef` in `settings/integrations-tab.tsx` for a partner whose non-secret config is supplied by code defaults, list ONLY the credential fields (e.g. `access_key_id`, `secret_access_key`). Do not add bucket/region/prefix fields.

## Code-default partner config: getEffectiveIntegrationConfig
`ddex/service.ts` exposes `PARTNER_DELIVERY_DEFAULTS` + `getEffectiveIntegrationConfig(code, dbConfig)`. DB `integration.config` overrides code defaults, but empty-string DB values do NOT clobber a non-empty default. Used by `buildPartnerContext`, `processMessage`, the `dropToAcrCloud` flow, and `connectors/ddex-s3.ts#testConnection`.

**Why:** lets an operator connect an S3 partner (e.g. `acrcloud_ddex`: bucket/region/prefix/partyIds baked in) by entering only the two S3 keys; testConnection must merge defaults or it fails with only creds present.

## acr/checks `configured` is the Identify integration, NOT the S3 drop
`GET /api/distribution/acr/checks` returns `configured` reflecting the legacy `acrcloud` (Identify) creds (host/access_key/access_secret) — it does NOT indicate whether the `acrcloud_ddex` (S3 drop) integration is set up. Don't reuse it as an "S3 drop configured" signal; gate the drop on the `acrcloud_ddex` integration's own credentials (the POST `/acr/drop` endpoint returns 400 when those are missing).
