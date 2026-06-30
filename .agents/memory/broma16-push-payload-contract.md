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

**distribution (`POST .../distribution`) — UNRESOLVED, needs Broma16 docs:**
- Sending `distribution_outlets: [code, ...]` (flat array) fails. Broma16 wants `distribution_outlets` as an **array of objects** each `{ outlets: [...], delivery_start_time: ... }`, PLUS a top-level `outlets` field (`required_unless: update`).
- Exact grouping (one entry with all outlets vs per-outlet) and `delivery_start_time` format are unconfirmed. **Do not guess** — wrong distribution config could mis-deliver real releases. Confirm schema with Broma16 before implementing.

**Why:** This is a real production distributor; every release passes through this path. These were genuine bugs blocking ALL pushes, not test-data quirks (except the single-title rule and a bad test UPC).
