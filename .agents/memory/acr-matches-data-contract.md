---
name: ACR matches modal data contract
description: How ACRCloud check results are stored (sample vs full) and the parsing rules any consumer must follow to render matches without crashing.
---

# ACRCloud matches — storage shapes & parsing rules

`acr_checks.resultJson` holds two DIFFERENT shapes depending on scan mode; any consumer (the release-level matches modal, exports, etc.) must handle BOTH:

- **Sample scan** stores the raw ACRCloud identify response: `metadata.music[]`, each entry with `artists[]` (`{name}`), `album.name`, `external_ids` (isrc/upc), and `external_metadata` keyed by DSP (`spotify`/`deezer`/`youtube`/…).
- **Full scan** stores a normalized `top_match` that we enrich from the best matching segment: label, album, upc, releaseDate, `foundOn` (DSP key list), and `sampleBeginMs`/`sampleEndMs`.

**Rules (learned the hard way):**
- ACRCloud returns inconsistent/partial shapes. ALWAYS `Array.isArray`-guard `metadata.music` and `artists`, and object-guard `external_metadata`, BEFORE `.map()`/`Object.keys()`. A raw `.map` on a string/object field throws — on the frontend that crashes the modal mid-render; on the backend it turns one odd payload into a false "error" scan outcome. Degrade to `—`/undefined instead.
- **Matched-segment time** is derived from `sample_begin/end_time_offset_ms` (fallback `play_offset_ms`), NOT from coarse byte-segment percentages — the pct is misleading and unrelated to playback position.
- **"Scanned Segments"** count = `segments.length` for full scans, `1` for sample scans.
- `acr_checks` may be EMPTY and ACRCloud may be UNCONFIGURED in a given env → the UI must render a graceful "not configured"/empty state and never assume data exists.

**Why:** the two-shape split + upstream inconsistency is invisible from a single code path; guarding both shapes and reading time from offsets are the non-obvious constraints that keep the feature from crashing or lying about match position.
