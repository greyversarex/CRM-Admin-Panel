---
name: ACRCloud is S3 DDEX-drops ONLY
description: This project uses ACRCloud exclusively via the partner S3 DDEX-drop path; never propose or use the Identify API.
---

# ACRCloud usage policy for this project

Dedup checking runs **only** through the partner **S3 DDEX-drop** flow (engine `acrcloud_ddex`, mode `ddex_drop`): package the ERN + assets and upload to ACRCloud's S3 bucket.

**Do NOT** use or suggest the direct **Identify API** / sample scan (`callAcrIdentify`) — it is a *different ACRCloud service* the customer does not subscribe to, even though the code path exists and would return an instant match. Never offer it as a "just to see it work" alternative.

**Result ingestion is manual (for now):** S3-drop verdicts do NOT return automatically — no polling, webhook, or return-report ingestion exists. An operator records the verdict via `POST /distribution/acr/manual-result` (`unique`→`clean`, `duplicate`→`matched`). A pending `acr_checks` row after a successful drop is the *correct* expected state; do not treat pending as a bug.

**Why:** contractual — customer works with ACRCloud under an S3-Drops partner agreement only. Automatic result retrieval (webhook/API) is pending guidance from ACRCloud (contact "Tony"); add it only once they specify the mechanism. The earlier 404 on push was a wrong-domain bug (.ru vs .com), NOT the Identify-vs-drop distinction.

**How to apply:** when asked to run/verify an ACR dedup check, use the S3 DDEX-drop path, confirm upload succeeded + status pending, and stop there. Don't switch modes to force an automatic result.
