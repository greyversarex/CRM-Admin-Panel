---
name: Local asset storage is under /tmp (ephemeral)
description: Uploaded asset files vanish on container recycle because LOCAL_STORAGE_ROOT points into /tmp; DB rows survive, files do not.
---

# Uploaded asset files are ephemeral

`LOCAL_STORAGE_ROOT=/tmp/tajikmusic-uploads` (api-server env). The `assets` DB rows persist, but the physical files under `/tmp` are **wiped when the container recycles** (e.g. overnight). Symptom: any flow that reads the real file (DDEX/ACRCloud drop with s3 or local-fs transport) fails with `ENOENT: ... /tmp/tajikmusic-uploads/...` even though the asset row looks fine.

**Why:** asset upload (presign→PUT→confirm) writes to `LOCAL_STORAGE_ROOT`; the path resolves via `storage_key` (e.g. `private/uploads/<uuid>`, no extension). `/tmp` is not durable.

**How to apply:** before re-running a drop/delivery on an older release, verify the files exist on disk. To restore for a test release without re-doing the UI upload: regenerate matching media, copy to `$LOCAL_STORAGE_ROOT/<storage_key>` (exact path, no extension added), then sync each asset's `sha256` + `size_bytes` (and audio `sample_rate_hz`/`bit_depth`/`channels`) so validation/probe stays consistent. A real stereo 44.1kHz/16-bit WAV = `ffmpeg -f lavfi -i "sine=...:sample_rate=44100" -ac 2 -sample_fmt s16 out.wav`. For durable storage, repoint `LOCAL_STORAGE_ROOT` outside `/tmp` (env change — confirm with user).
