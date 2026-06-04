---
name: audio preview player
description: How the in-app track audio preview player streams playback and renders its waveform
---

# Audio preview player (track edit page)

The track-edit preview player (`crm-panel/src/components/waveform-player.tsx`,
exported as `WaveformPlayer`) splits playback from the waveform on purpose:

- **Playback:** native `<audio preload="metadata">` streaming via HTTP Range. The
  storage proxy `GET /api/storage/objects/uploads/:objectId` (api-server
  `routes/assets.ts`) returns 206 Partial Content, so audio starts in <1s at any
  file size. Gate the play button on the media element's `loadedmetadata`/`canplay`
  events — NEVER on a full-file decode.
- **Waveform:** computed server-side and drawn on a `<canvas>` from a tiny peaks
  JSON. Endpoint `GET /api/storage/objects/uploads/:objectId/peaks` uses the pure-JS
  `audio-decode` lib, returns ~800 normalized peaks, caches to a `<file>.peaks.json`
  sidecar on disk. Client never downloads the whole file for the picture.

**Why this shape:** wavesurfer.js with a `url` downloaded+decoded the ENTIRE file
(label masters are 40-60MB WAV ≈ 45s) before enabling play — the player looked
frozen. wavesurfer was removed entirely.

**How to apply / gotchas:**
- `audio-decode` returns `{ channelData: Float32Array[], sampleRate }` — NOT a Web
  AudioBuffer (no `getChannelData`/`numberOfChannels`/`duration`). Compute duration
  as `channelData[0].length / sampleRate`.
- `audio-decode` is pure JS/wasm → works after `pnpm install` on the VPS (no ffmpeg
  needed). It does NOT decode m4a/aac; those (and oversized/undecodable files) return
  `failed:true` with empty peaks, and the client falls back to a slim seek bar while
  audio still plays.
- Server decode reads+expands the whole file in memory, so it is guarded: max file
  size, an estimated-PCM-bytes budget (from the asset's stored duration/sampleRate/
  channels), a concurrency semaphore, and negative caching of failures. Keep these
  guards if you touch `lib/audioPeaks.ts` — without them a long compressed file can
  OOM the API.
- Bump `PEAKS_VERSION` in `lib/audioPeaks.ts` whenever the peaks JSON shape or
  computation changes, or stale sidecars will be served.
