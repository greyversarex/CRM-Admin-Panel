---
name: Broma16 artist outlets (showcase IDs)
description: How Spotify/Apple Artist IDs are sent to Broma16 when creating/syncing an artist.
---

Artist showcase IDs (Spotify/Apple) go to Broma16 via the artist object's `outlets`
array (POST create + PUT "Update author"). Each item: `{ outlet (name), outlet_id
(int from dictionaries/outlets), id_outlet_user (the artist's ID on that showcase),
site? }`. `id_outlet_user` is the Spotify/Apple Artist ID.

**Why name-based mapping:** the Broma16 `outlet` dictionary rows have an EMPTY `code`
column; only `name` + numeric `externalId` are usable. So map our keys by name hint,
not code: Spotify → "Spotify" (outlet_id 6140); Apple → "Apple Music, iTunes"
(outlet_id 49803). Outlets absent from the synced dict are skipped, never guessed.

**How to apply:** create path (createArtist) embeds outlets in the POST body.
Manual re-sync (syncArtist) always does a best-effort PUT of outlets afterward
(idempotent; also covers artists that were found remotely by name-search, where
outlets were never sent at create). Release-push path (ensureArtistSynced early
return) is intentionally left unchanged to avoid per-push PUT overhead.
