---
name: audio preview player
description: Why the in-app track audio preview uses native <audio> streaming instead of wavesurfer.js
---

# Audio preview player (track edit page)

The track-edit preview player (`crm-panel/src/components/waveform-player.tsx`,
component still exported as `WaveformPlayer`) must use a native `<audio>` element,
NOT wavesurfer.js.

**Why:** wavesurfer.js v7 with the `url` option downloads the ENTIRE file and
decodes it into peaks before firing `ready` / enabling the play button. For label
master WAVs (~44 MB) that took ~45 s on the dev proxy, so the play button stayed a
spinner and looked frozen. Users upload large lossless files, so this is the norm,
not an edge case.

**How to apply:** Stream via `<audio src preload="metadata">`. The storage proxy
`GET /api/storage/objects/uploads/:objectId` (api-server `routes/assets.ts`)
supports HTTP Range and returns 206 Partial Content, so playback starts in <1 s at
any file size. Gate the play button on the media element's `loadedmetadata`/`canplay`
events, never on a full-decode "ready". If a real waveform is ever wanted back,
precompute peaks server-side — do not let the client decode the whole file inline.
