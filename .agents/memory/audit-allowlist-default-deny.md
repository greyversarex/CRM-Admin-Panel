---
name: Audit allowlist is default-deny
description: New auditMutation entityTypes silently log empty diffs until added to ENTITY_ALLOWLIST.
---

# Audit allowlist is default-deny

`lib/audit.ts` has `ENTITY_ALLOWLIST: Record<string, Set<string>>`. `auditMutation` sanitizes `before`/`after` per `entityType`: if the entityType has no allowlist entry, **all fields are stripped** (default-deny) — the audit row records action/actor/entityId/timestamp but an empty diff.

**Why:** compliance requirement — never accidentally log secrets/PII. Safer to drop fields than leak them.

**How to apply:** when calling `auditMutation` with a new `entityType` (or wanting field-level diffs for an existing thin one), add a `Set` of the non-sensitive field names to `ENTITY_ALLOWLIST`. Listing a field that doesn't exist on the row is harmless. Never list secret/PII columns (password hashes, bank details, tokens, raw socialLinks).
