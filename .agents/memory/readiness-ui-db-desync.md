---
name: Readiness dialog vs UI desync
description: Submit-readiness validates DB, but wizard UI displayed unsaved defaults as "chosen" — keep displays honest
---

Rule: any form control must render the *persisted* value; never display a client-side default (current year, "none", all-outlets-checked) as if selected while the DB column is NULL. The readiness check (`/releases/:id/issues`) reads the DB, so fake displays make its errors look like false positives.

**Why:** users saw ℗/© year, AI usage and DSP outlets as "filled" (wizard defaults) while DB had NULLs → readiness errors looked like system-wide corruption.

**How to apply:** wizard AI radio uses `value ?? ""` (nothing selected until chosen); default "all outlets" only when `releaseId == null`; readiness accepts a 4-digit year embedded in the p/c-line string (legacy rows); detail-page edit dialog must include every field readiness checks (it lacked year/AI fields for a long time — check when adding new required fields).
