---
name: Stereo audio upload validation
description: How /assets/confirm validates stereo audio and why the MIME gate must stay lenient.
---

# Stereo audio upload (assets/confirm)

- Stereo spec validation (container WAV/AIFF/FLAC, sampleRate>=44100, 16/24-bit, stereo) runs in `/assets/confirm` ONLY when `body.audioProfile === "stereo"`. Spatial and legacy uploads intentionally bypass it.
- The coarse kind↔MIME gate for `kind=audio` must accept empty AND `application/octet-stream` MIME types.

**Why:** Some browsers/OS report empty or generic MIME for valid WAV/AIFF/FLAC. A strict `startsWith("audio/")` gate falsely 400-rejects valid files before the real container check runs. Server-side container/spec validation is the real source of truth, so the MIME gate should only be a loose early filter.

**How to apply:** If audio uploads start failing with "MIME ... does not match kind=audio", check the generic-MIME allowance first. Never tighten the MIME gate to compensate for content validation — put real checks in validateStereoSpecs.
