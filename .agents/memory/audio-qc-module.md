---
name: Audio QC module
description: Design decisions and constraints for the per-track audio analysis (waveform peaks, clipping, silence, LUFS) module.
---

- Analysis is ffmpeg/ffprobe-based (available on PATH). PCM is processed **streaming** (mono f32le 44.1kHz chunks from ffmpeg stdout) in one pass — never buffer the whole decode (a 4-min WAV ≈ 44MB f32; concurrent runs would OOM). Peaks/clipping/100ms-RMS windows all come from the same pass; LUFS/True Peak from ebur128 stderr.
- **Why:** code review flagged unbounded memory from full-buffer decode; keep it streaming if detectors are added.
- Endpoints: GET/POST /tracks/:id/audio-qc (raw fetch on frontend, NOT in openapi — precedent: release-outlets). GET lazily (re)analyzes when no row or row.objectPath ≠ track.audioUrl.
- Anti-IDOR: before analyzing, if the asset resolved by objectPath belongs to another track/artist, refuse — track.audioUrl could point at another tenant's file.
- Concurrency: in-process Map<trackId, Promise> dedup + stale-wins guard (re-read track.audioUrl after analysis; skip write if changed).
- WaveformPlayer takes optional trackId; real peaks resampled to 180 bars, PRNG fallback removed (neutral placeholder). Issue markers drawn from issues[].startSec/endSec.
