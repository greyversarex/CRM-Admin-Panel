---
name: Broma16 publishing composition push
description: Publishing-only (composition) push to Broma16 and its idempotency constraint
---

# Broma16 publishing-only composition push

Separate path from the 9-step release push: registers ONLY a composition
(authors + shares) with no release/audio/cover/outlets. Flow:
`POST /repertoire/composition` (title, account_id, iswc?) → get id →
`POST /repertoire/composition/{id}/contributors` (contributors[]) →
`POST /repertoire/composition/{id}/step` (step: "completed").

Contributors reuse the same shape as recording composition contributors:
`{ title, ownership (2dp string), roles (C/A), controlled_by_submitter:1, ipi? }`,
shares must sum to 100% or fall back to a single "Copyright Control" 100%.

**Rule:** the `/contributors` endpoint ADDS authors, it does not upsert/replace.
So re-pushing an already-submitted composition would duplicate authors/shares.
**Why:** no documented idempotent-upsert guarantee from Broma16.
**How to apply:** persist a broma16_status; block re-push once "submitted"
(server returns 409, UI disables the button). A "pending" state (composition
created but step not completed) is safe to retry — reuse the saved composition id.
