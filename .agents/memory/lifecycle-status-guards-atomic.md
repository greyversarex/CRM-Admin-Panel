---
name: Lifecycle status guards must be atomic conditional writes
description: Release lifecycle mutations (delete/reopen/takedown/submit) must guard the source status inside the DB write's WHERE clause, not via SELECT-then-mutate-by-id.
---

Any release lifecycle mutation that is only valid from certain source statuses
must enforce that source-status check inside the DB write's WHERE clause
(conditional UPDATE/DELETE on `status IN (...)`), then treat 0 affected rows as
a 409. For DELETE, re-SELECT after 0 rows to distinguish 404 (gone) from 409
(status changed). Examples in releases.ts:
- DELETE (owner): only `draft|rejected`
- POST /reopen: `approved|rejected` -> draft
- POST /request-takedown: `approved|live` -> takedown_requested
- POST /submit, /cancel-submission: existing precedent for the pattern

**Why:** A SELECT-then-mutate-by-id guard is non-atomic — a concurrent request
can change the status between the check and the write, letting a protected
release (e.g. approved) be deleted or transitioned. The architect flagged
exactly this on the DELETE guard.

**How to apply:** Mirror the existing /submit and /cancel-submission atomic
conditional-write pattern for any new lifecycle endpoint. fullAccess
(admin/manager) may skip the status condition where a moderator override is
intended (e.g. DELETE any status), but owner paths must always be conditional.
