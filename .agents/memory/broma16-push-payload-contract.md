---
name: Broma16 release push payload contract
description: Observed 422 validation rules of Broma16 repertoire API discovered by running the live push end-to-end; what each step's body must contain.
---

Discovered by walking a real release through `pushReleaseToBroma16` against the live Broma16 API (`.com` domain, account with a finished onboarding). Each step returned 422s that the code violated. Rules below are observed from Broma16's responses, not from docs.

**Error parsing:** Broma16 returns nested error objects per field (e.g. `errors.created_date = { date: ["..."] }`), not always arrays of strings. The client error parser MUST recursively flatten nested objects/arrays, otherwise messages collapse to useless `[object Object]` and you lose the diagnostic. (`flattenErrorValue` in client.ts.)

**create_release (`POST /repertoire/release`):**
- `date_p_line` / `date_c_line` must be **strings** (`string_type`), not the numeric year stored in `pLineYear`/`cLineYear`.
- `created_date` is **required** at release level, format `YYYY-MM-DD`.
- `ean` (UPC) is format-validated (check digit). A bad/test UPC -> `ean: rule: invalid upc format`. Omit UPC and send `generate_ean: true` to let Broma16 generate one.

**upload_tracks / cover upload (multipart):**
- Broma16 detects file type by **filename extension**. Our assets are stored under a bare UUID with no extension -> `file: rule: file_type; value: flac, wav`. Append the correct extension from the asset MIME before building the multipart form. (`ensureFilenameExtension` in files.ts.)

**track_metadata (`PUT .../recording/:id`):**
- `created_date` here is the **recording (master) date** and must be **<= today** (`before_or_equal_date`). Release date is often in the future (scheduled), so clamp it to today for the recording. (`toBroma16RecordingDate`.)
- `catalog_number` is **required at recording level** too (`required_without` generate flag). Inherit `release.catalogNumber`, else send `generate_catalog_number: true`.
- For a **single**, the recording `title` must **equal the release title** (`title: does not match` otherwise). This is a Broma16 business rule, not a code bug.

**distribution (`POST .../distribution`) — RESOLVED:**
- Send a **top-level `outlets`** array of outlet codes (`required_unless: update`) plus `sale_start_date` (YYYY-MM-DD). That's it — confirmed by a real 200.
- `distribution_outlets` is the wrong key for the simple case; it's an OPTIONAL array of `{ outlets, delivery_start_time }` objects ONLY for per-outlet personalised ship dates (by separate agreement with the outlet). Omit it normally.

**send-moderate (`POST .../send-moderate`) — final full validation, RESOLVED:**
- This step re-validates the WHOLE release; missing recording fields surface here as `tracks.N.*`, NOT at the earlier partial PUTs.
- `parental_warning_type` and `language` are `required_without is_instrumental` (i.e. required for non-instrumental tracks). These were previously sent ONLY inside the optional `lyrics` step, which is skipped for tracks with no lyrics → moderation failed. Fix: send `is_instrumental` + `parental_warning_type` + `language` in the always-run `track_metadata` step.
- `producer` / `party_id` are mutually-conditional (`required_if; value: empty`): provide EITHER. We send a free-text `producer` name (from `track.production`/`performers`, role producer). No party_id mapping needed. Pre-validate producer presence before pushing (preflight throws a clear RU error) — real catalog items with no producer would otherwise hard-fail at moderation.

**Why:** This is a real production distributor; every release passes through this path. These were genuine bugs blocking ALL pushes, not test-data quirks (except the single-title rule and a bad test UPC).
